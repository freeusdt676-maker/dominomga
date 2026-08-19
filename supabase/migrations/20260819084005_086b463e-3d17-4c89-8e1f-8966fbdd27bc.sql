CREATE OR REPLACE FUNCTION public.crash_new_round()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  seed text; cp numeric; rid uuid; recent boolean;
  n bigint; b int; prev int[]; tries int := 0;
  wag numeric; pay numeric; pnl numeric; rtp numeric;
  k numeric; tail numeric; dry int; hi numeric; roll numeric;
  force_low boolean := false; jit numeric;
BEGIN
  SELECT COALESCE(sum(amount),0), COALESCE(sum(payout),0)
    INTO wag, pay
  FROM public.crash_bets
  WHERE created_at > now() - interval '24 hours';

  pnl := wag - pay;
  rtp := CASE WHEN wag > 0 THEN pay / wag ELSE 0.85 END;

  k := 0.95; tail := 0.58;

  IF wag >= 5000 THEN
    IF rtp >= 1.30 THEN       k := 0.70; tail := 0.48;
    ELSIF rtp >= 1.10 THEN    k := 0.80; tail := 0.52;
    ELSIF rtp >= 0.95 THEN    k := 0.88; tail := 0.55;
    ELSIF rtp <= 0.55 THEN    k := 1.02; tail := 0.66;
    ELSIF rtp <= 0.70 THEN    k := 0.98; tail := 0.62;
    END IF;
  END IF;

  IF pnl < 0 THEN
    k := LEAST(k, 0.82); tail := LEAST(tail, 0.52);
  END IF;

  -- random jitter so no two rounds share the same curve params
  jit := 0.92 + random() * 0.16;
  k := k * jit;
  tail := tail * (0.94 + random() * 0.12);

  SELECT count(*) INTO dry FROM (
    SELECT crash_point FROM public.crash_rounds
    WHERE status='crashed' AND crash_point IS NOT NULL
    ORDER BY round_no DESC LIMIT 7
  ) q WHERE crash_point < 1.60;
  IF dry >= 6 THEN k := GREATEST(k, 1.00); tail := GREATEST(tail, 0.64); END IF;

  -- probabilistic mixing: the more recent high rounds, the likelier a low one,
  -- but never a fixed / predictable rule
  SELECT COALESCE(sum(CASE WHEN crash_point >= 2 THEN 1 ELSE 0 END),0)::numeric
    INTO hi
  FROM (
    SELECT crash_point FROM public.crash_rounds
    WHERE status='crashed' AND crash_point IS NOT NULL
    ORDER BY round_no DESC LIMIT 4
  ) q;

  roll := random();
  force_low := dry < 6 AND (
    (hi >= 3 AND roll < 0.70) OR
    (hi = 2 AND roll < 0.45) OR
    (hi = 1 AND roll < 0.15)
  );

  SELECT array_agg(CASE WHEN r.crash_point < 2 THEN 0 WHEN r.crash_point < 5 THEN 1 ELSE 2 END ORDER BY r.round_no DESC)
    INTO prev
  FROM (SELECT crash_point, round_no FROM public.crash_rounds
        WHERE status = 'crashed' AND crash_point IS NOT NULL
        ORDER BY round_no DESC LIMIT 4) r;

  LOOP
    tries := tries + 1;
    seed := encode(extensions.gen_random_bytes(32), 'hex');
    n := (floor(random() * 9000000000)::bigint + 1000000);
    cp := public.crash_point_calc(seed, n, k, tail);
    b := CASE WHEN cp < 2 THEN 0 WHEN cp < 5 THEN 1 ELSE 2 END;
    EXIT WHEN tries >= 8;
    IF force_low AND cp >= 2.00 THEN CONTINUE; END IF;
    EXIT WHEN prev IS NULL OR array_length(prev,1) < 3;
    EXIT WHEN NOT (prev[1] = b AND prev[2] = b AND prev[3] = b);
  END LOOP;

  IF force_low AND cp >= 2.00 THEN
    cp := floor((1.00 + random() * 0.95) * 100.0) / 100.0;
    IF cp < 1.01 THEN cp := 1.00; END IF;
  END IF;

  IF cp >= 100 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.crash_round_secrets s
      WHERE s.crash_point >= 100 AND s.created_at > now() - interval '24 hours'
    ) INTO recent;
    IF recent THEN
      cp := 1.00 + (cp - floor(cp));
      IF cp < 1.01 THEN cp := 1.00; END IF;
    END IF;
  END IF;

  INSERT INTO public.crash_rounds(server_seed_hash, nonce, status, betting_ends_at)
  VALUES (encode(extensions.digest(seed,'sha256'),'hex'), n, 'betting', now() + interval '8 seconds')
  RETURNING id INTO rid;
  INSERT INTO public.crash_round_secrets(round_id, server_seed, crash_point) VALUES (rid, seed, cp);
  RETURN rid;
END
$function$;

-- allow up to two bets per round
CREATE OR REPLACE FUNCTION public.crash_place_bet(_amount numeric, _auto_cashout numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); r RECORD; bal numeric; st account_status; cnt int; bid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.game_blocked('crash') THEN RAISE EXCEPTION 'game_blocked'; END IF;
  SELECT account_status INTO st FROM public.profiles WHERE user_id = uid;
  IF st IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'account_not_active'; END IF;
  IF _amount IS NULL OR _amount < 100 OR _amount > 10000 OR _amount <> floor(_amount) THEN
    RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _auto_cashout IS NOT NULL AND (_auto_cashout < 1.01 OR _auto_cashout > 999.00) THEN
    RAISE EXCEPTION 'invalid_auto_cashout'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crash_bet:'||uid::text, 0));
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO r FROM public.crash_rounds ORDER BY round_no DESC LIMIT 1;
  IF r IS NULL OR r.status <> 'betting' OR now() >= r.betting_ends_at THEN
    RAISE EXCEPTION 'betting_closed'; END IF;
  SELECT count(*) INTO cnt FROM public.crash_bets WHERE round_id=r.id AND user_id=uid;
  IF cnt >= 2 THEN RAISE EXCEPTION 'already_bet'; END IF;

  SELECT balance INTO bal FROM public.wallets WHERE user_id=uid FOR UPDATE;
  IF bal IS NULL OR bal < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE public.wallets SET balance = balance - _amount, updated_at=now() WHERE user_id=uid;
  INSERT INTO public.transactions(user_id,type,amount,status,game_id)
    VALUES (uid,'game_stake',_amount,'completed',r.id);
  INSERT INTO public.crash_bets(round_id,user_id,amount,auto_cashout)
    VALUES (r.id,uid,_amount,_auto_cashout) RETURNING id INTO bid;

  RETURN jsonb_build_object('ok',true,'round_id',r.id,'amount',_amount,'bet_id',bid,'slot',cnt+1);
END $function$;

DROP FUNCTION IF EXISTS public.crash_cashout();
CREATE OR REPLACE FUNCTION public.crash_cashout(_bet_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); r RECORD; b RECORD; cp numeric; m numeric; pay numeric; elapsed numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crash_bet:'||uid::text, 0));
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO r FROM public.crash_rounds ORDER BY round_no DESC LIMIT 1;
  IF r IS NULL OR r.status <> 'running' THEN RAISE EXCEPTION 'not_running'; END IF;

  SELECT * INTO b FROM public.crash_bets
   WHERE round_id=r.id AND user_id=uid AND status='placed'
     AND (_bet_id IS NULL OR id=_bet_id)
   ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'no_bet'; END IF;

  SELECT crash_point INTO cp FROM public.crash_round_secrets WHERE round_id=r.id;
  elapsed := EXTRACT(EPOCH FROM (now() - r.started_at));
  m := public.crash_mult_at(elapsed);
  IF m > cp THEN
    UPDATE public.crash_bets SET status='lost' WHERE id=b.id;
    RETURN jsonb_build_object('ok',false,'reason','too_late','crash_point',cp,'bet_id',b.id);
  END IF;

  pay := floor(b.amount * m);
  UPDATE public.wallets SET balance = balance + pay, updated_at=now() WHERE user_id=uid;
  INSERT INTO public.transactions(user_id,type,amount,status,game_id)
    VALUES (uid,'game_win',pay,'completed',r.id);
  UPDATE public.crash_bets SET status='cashed', cashout_multiplier=m, payout=pay, cashed_at=now() WHERE id=b.id;

  RETURN jsonb_build_object('ok',true,'multiplier',m,'payout',pay,'bet_id',b.id);
END $function$;

GRANT EXECUTE ON FUNCTION public.crash_cashout(uuid) TO authenticated;