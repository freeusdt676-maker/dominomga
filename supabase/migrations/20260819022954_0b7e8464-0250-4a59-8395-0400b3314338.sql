-- CRASH MGA -------------------------------------------------------------
CREATE TABLE public.crash_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_no bigserial NOT NULL,
  server_seed_hash text NOT NULL,
  nonce bigint NOT NULL DEFAULT 0,
  crash_point numeric,            -- revealed only after crash
  status text NOT NULL DEFAULT 'betting',  -- betting | running | crashed
  betting_ends_at timestamptz NOT NULL,
  started_at timestamptz,
  crashed_at timestamptz,
  next_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crash_rounds_no_idx ON public.crash_rounds(round_no DESC);
GRANT SELECT ON public.crash_rounds TO authenticated;
GRANT ALL ON public.crash_rounds TO service_role;
ALTER TABLE public.crash_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crash_rounds_read" ON public.crash_rounds FOR SELECT TO authenticated USING (true);

CREATE TABLE public.crash_round_secrets (
  round_id uuid PRIMARY KEY REFERENCES public.crash_rounds(id) ON DELETE CASCADE,
  server_seed text NOT NULL,
  crash_point numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.crash_round_secrets TO service_role;
ALTER TABLE public.crash_round_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crash_secrets_admin" ON public.crash_round_secrets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND EXISTS (SELECT 1 FROM public.crash_rounds r WHERE r.id = round_id AND r.status='crashed'));

CREATE TABLE public.crash_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.crash_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  auto_cashout numeric,
  cashout_multiplier numeric,
  payout numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'placed',  -- placed | cashed | lost
  created_at timestamptz NOT NULL DEFAULT now(),
  cashed_at timestamptz,
  UNIQUE (round_id, user_id)
);
CREATE INDEX crash_bets_user_idx ON public.crash_bets(user_id, created_at DESC);
CREATE INDEX crash_bets_round_idx ON public.crash_bets(round_id);
GRANT SELECT ON public.crash_bets TO authenticated;
GRANT ALL ON public.crash_bets TO service_role;
ALTER TABLE public.crash_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crash_bets_own_read" ON public.crash_bets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

ALTER TABLE public.game_blocks DROP CONSTRAINT IF EXISTS game_blocks_game_type_check;
ALTER TABLE public.game_blocks ADD CONSTRAINT game_blocks_game_type_check
  CHECK (game_type IN ('domino','petanque','ludo','crash'));
INSERT INTO public.game_blocks(game_type, blocked) VALUES ('crash', false)
  ON CONFLICT (game_type) DO NOTHING;

-- growth rate: multiplier = exp(0.08 * elapsed_seconds)
CREATE OR REPLACE FUNCTION public.crash_mult_at(_elapsed numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(1.00, floor(exp(0.08 * GREATEST(_elapsed,0)) * 100.0) / 100.0);
$$;

CREATE OR REPLACE FUNCTION public.crash_duration(_crash numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0, ln(GREATEST(_crash,1.0)) / 0.08);
$$;

-- provably fair crash point from server seed + nonce (1% house edge)
CREATE OR REPLACE FUNCTION public.crash_point_from(_seed text, _nonce bigint)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE h bytea; hv numeric; e numeric; c numeric;
BEGIN
  h := extensions.hmac(_nonce::text, _seed, 'sha256');
  hv := (get_byte(h,0)::numeric*4294967296 + get_byte(h,1)::numeric*16777216 + get_byte(h,2)::numeric*65536 + get_byte(h,3)::numeric*256 + get_byte(h,4)::numeric);
  e := hv / 1099511627776.0;               -- [0,1)
  IF e >= 0.99 THEN RETURN 1.00; END IF;   -- 1% instant bust
  c := floor((0.99 / (1.0 - e)) * 100.0) / 100.0;
  RETURN LEAST(GREATEST(c, 1.00), 999.00);
END $$;

CREATE OR REPLACE FUNCTION public.crash_new_round()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE seed text; cp numeric; rid uuid;
BEGIN
  seed := encode(extensions.gen_random_bytes(32), 'hex');
  cp := public.crash_point_from(seed, 1);
  INSERT INTO public.crash_rounds(server_seed_hash, nonce, status, betting_ends_at)
  VALUES (encode(extensions.digest(seed,'sha256'),'hex'), 1, 'betting', now() + interval '8 seconds')
  RETURNING id INTO rid;
  INSERT INTO public.crash_round_secrets(round_id, server_seed, crash_point) VALUES (rid, seed, cp);
  RETURN rid;
END $$;

-- advance the state machine; safe to call from any client
CREATE OR REPLACE FUNCTION public.crash_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r RECORD; cp numeric; b RECORD; admin_user uuid; pay numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('crash_tick', 0));
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO r FROM public.crash_rounds ORDER BY round_no DESC LIMIT 1;
  IF r IS NULL THEN PERFORM public.crash_new_round();
    SELECT * INTO r FROM public.crash_rounds ORDER BY round_no DESC LIMIT 1;
  END IF;

  IF r.status = 'betting' AND now() >= r.betting_ends_at THEN
    UPDATE public.crash_rounds SET status='running', started_at=now() WHERE id=r.id RETURNING * INTO r;
  END IF;

  IF r.status = 'running' THEN
    SELECT crash_point INTO cp FROM public.crash_round_secrets WHERE round_id = r.id;
    IF now() >= r.started_at + (public.crash_duration(cp) || ' seconds')::interval THEN
      -- auto cashout for bets that requested one below the crash point
      SELECT user_id INTO admin_user FROM public.user_roles WHERE role='admin' ORDER BY created_at LIMIT 1;
      FOR b IN SELECT * FROM public.crash_bets WHERE round_id=r.id AND status='placed' LOOP
        IF b.auto_cashout IS NOT NULL AND b.auto_cashout >= 1.01 AND b.auto_cashout < cp THEN
          pay := floor(b.amount * b.auto_cashout);
          UPDATE public.wallets SET balance = balance + pay, updated_at=now() WHERE user_id = b.user_id;
          UPDATE public.admin_wallets SET balance = balance - pay, updated_at=now() WHERE admin_id = admin_user;
          INSERT INTO public.transactions(user_id,type,amount,status,game_id)
            VALUES (b.user_id,'game_win',pay,'completed',r.id);
          UPDATE public.crash_bets SET status='cashed', cashout_multiplier=b.auto_cashout, payout=pay,
            cashed_at = r.started_at + (public.crash_duration(b.auto_cashout) || ' seconds')::interval
            WHERE id=b.id;
        ELSE
          UPDATE public.crash_bets SET status='lost' WHERE id=b.id;
        END IF;
      END LOOP;
      UPDATE public.crash_rounds
        SET status='crashed', crashed_at = r.started_at + (public.crash_duration(cp) || ' seconds')::interval,
            crash_point = cp, next_at = now() + interval '6 seconds'
        WHERE id=r.id RETURNING * INTO r;
    END IF;
  END IF;

  IF r.status = 'crashed' AND now() >= r.next_at THEN
    PERFORM public.crash_new_round();
    SELECT * INTO r FROM public.crash_rounds ORDER BY round_no DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'id', r.id, 'round_no', r.round_no, 'status', r.status,
    'server_seed_hash', r.server_seed_hash,
    'betting_ends_at', r.betting_ends_at, 'started_at', r.started_at,
    'crashed_at', r.crashed_at, 'next_at', r.next_at, 'crash_point', r.crash_point,
    'server_now', now()
  );
END $$;

CREATE OR REPLACE FUNCTION public.crash_place_bet(_amount numeric, _auto_cashout numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); r RECORD; bal numeric; admin_user uuid; st account_status;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.game_blocked('crash') THEN RAISE EXCEPTION 'game_blocked'; END IF;
  SELECT account_status INTO st FROM public.profiles WHERE user_id = uid;
  IF st IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'account_not_active'; END IF;
  IF _amount IS NULL OR _amount < 100 OR _amount > 100000 OR _amount <> floor(_amount) THEN
    RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _auto_cashout IS NOT NULL AND (_auto_cashout < 1.01 OR _auto_cashout > 999.00) THEN
    RAISE EXCEPTION 'invalid_auto_cashout'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crash_bet:'||uid::text, 0));
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO r FROM public.crash_rounds ORDER BY round_no DESC LIMIT 1;
  IF r IS NULL OR r.status <> 'betting' OR now() >= r.betting_ends_at THEN
    RAISE EXCEPTION 'betting_closed'; END IF;
  IF EXISTS (SELECT 1 FROM public.crash_bets WHERE round_id=r.id AND user_id=uid) THEN
    RAISE EXCEPTION 'already_bet'; END IF;

  SELECT balance INTO bal FROM public.wallets WHERE user_id=uid FOR UPDATE;
  IF bal IS NULL OR bal < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  SELECT user_id INTO admin_user FROM public.user_roles WHERE role='admin' ORDER BY created_at LIMIT 1;

  UPDATE public.wallets SET balance = balance - _amount, updated_at=now() WHERE user_id=uid;
  UPDATE public.admin_wallets SET balance = balance + _amount, updated_at=now() WHERE admin_id = admin_user;
  INSERT INTO public.transactions(user_id,type,amount,status,game_id)
    VALUES (uid,'game_stake',_amount,'completed',r.id);
  INSERT INTO public.crash_bets(round_id,user_id,amount,auto_cashout) VALUES (r.id,uid,_amount,_auto_cashout);

  RETURN jsonb_build_object('ok',true,'round_id',r.id,'amount',_amount);
END $$;

CREATE OR REPLACE FUNCTION public.crash_cashout()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); r RECORD; b RECORD; cp numeric; m numeric; pay numeric; admin_user uuid; elapsed numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crash_bet:'||uid::text, 0));
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO r FROM public.crash_rounds ORDER BY round_no DESC LIMIT 1;
  IF r IS NULL OR r.status <> 'running' THEN RAISE EXCEPTION 'not_running'; END IF;
  SELECT * INTO b FROM public.crash_bets WHERE round_id=r.id AND user_id=uid FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'no_bet'; END IF;
  IF b.status <> 'placed' THEN RAISE EXCEPTION 'already_settled'; END IF;

  SELECT crash_point INTO cp FROM public.crash_round_secrets WHERE round_id=r.id;
  elapsed := EXTRACT(EPOCH FROM (now() - r.started_at));
  m := public.crash_mult_at(elapsed);
  IF m >= cp THEN
    UPDATE public.crash_bets SET status='lost' WHERE id=b.id;
    RETURN jsonb_build_object('ok',false,'reason','too_late','crash_point',cp);
  END IF;

  pay := floor(b.amount * m);
  SELECT user_id INTO admin_user FROM public.user_roles WHERE role='admin' ORDER BY created_at LIMIT 1;
  UPDATE public.wallets SET balance = balance + pay, updated_at=now() WHERE user_id=uid;
  UPDATE public.admin_wallets SET balance = balance - pay, updated_at=now() WHERE admin_id=admin_user;
  INSERT INTO public.transactions(user_id,type,amount,status,game_id)
    VALUES (uid,'game_win',pay,'completed',r.id);
  UPDATE public.crash_bets SET status='cashed', cashout_multiplier=m, payout=pay, cashed_at=now() WHERE id=b.id;

  RETURN jsonb_build_object('ok',true,'multiplier',m,'payout',pay);
END $$;

REVOKE ALL ON FUNCTION public.crash_new_round() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crash_tick() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crash_place_bet(numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crash_cashout() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crash_mult_at(numeric) TO authenticated;