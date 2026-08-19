CREATE OR REPLACE FUNCTION public.crash_place_bet(_amount numeric, _auto_cashout numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); r RECORD; bal numeric; st account_status;
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
  IF EXISTS (SELECT 1 FROM public.crash_bets WHERE round_id=r.id AND user_id=uid) THEN
    RAISE EXCEPTION 'already_bet'; END IF;

  SELECT balance INTO bal FROM public.wallets WHERE user_id=uid FOR UPDATE;
  IF bal IS NULL OR bal < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  -- Crash MGA: no admin commission, admin_wallets untouched
  UPDATE public.wallets SET balance = balance - _amount, updated_at=now() WHERE user_id=uid;
  INSERT INTO public.transactions(user_id,type,amount,status,game_id)
    VALUES (uid,'game_stake',_amount,'completed',r.id);
  INSERT INTO public.crash_bets(round_id,user_id,amount,auto_cashout) VALUES (r.id,uid,_amount,_auto_cashout);

  RETURN jsonb_build_object('ok',true,'round_id',r.id,'amount',_amount);
END $function$;

CREATE OR REPLACE FUNCTION public.crash_cashout()
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
  -- Crash MGA: payout comes from the game itself, admin_wallets untouched
  UPDATE public.wallets SET balance = balance + pay, updated_at=now() WHERE user_id=uid;
  INSERT INTO public.transactions(user_id,type,amount,status,game_id)
    VALUES (uid,'game_win',pay,'completed',r.id);
  UPDATE public.crash_bets SET status='cashed', cashout_multiplier=m, payout=pay, cashed_at=now() WHERE id=b.id;

  RETURN jsonb_build_object('ok',true,'multiplier',m,'payout',pay);
END $function$;

CREATE OR REPLACE FUNCTION public.crash_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r RECORD; cp numeric; b RECORD; pay numeric;
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
      FOR b IN SELECT * FROM public.crash_bets WHERE round_id=r.id AND status='placed' LOOP
        IF b.auto_cashout IS NOT NULL AND b.auto_cashout >= 1.01 AND b.auto_cashout < cp THEN
          pay := floor(b.amount * b.auto_cashout);
          UPDATE public.wallets SET balance = balance + pay, updated_at=now() WHERE user_id = b.user_id;
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
END $function$;