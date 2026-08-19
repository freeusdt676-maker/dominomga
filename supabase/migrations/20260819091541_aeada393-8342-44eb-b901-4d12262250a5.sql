CREATE OR REPLACE FUNCTION public.crash_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; cp numeric; b RECORD; pay numeric; el numeric; m numeric;
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
    el := EXTRACT(EPOCH FROM (now() - r.started_at));
    m := public.crash_mult_at(el);

    -- LIVE auto cashout: settle as soon as the target multiplier is reached
    FOR b IN SELECT * FROM public.crash_bets
             WHERE round_id=r.id AND status='placed'
               AND auto_cashout IS NOT NULL AND auto_cashout >= 1.01
               AND auto_cashout <= LEAST(m, cp)
    LOOP
      pay := floor(b.amount * b.auto_cashout);
      UPDATE public.wallets SET balance = balance + pay, updated_at=now() WHERE user_id = b.user_id;
      INSERT INTO public.transactions(user_id,type,amount,status,game_id)
        VALUES (b.user_id,'game_win',pay,'completed',r.id);
      UPDATE public.crash_bets SET status='cashed', cashout_multiplier=b.auto_cashout, payout=pay,
        cashed_at = r.started_at + (public.crash_duration(b.auto_cashout) || ' seconds')::interval
        WHERE id=b.id;
    END LOOP;

    IF now() >= r.started_at + (public.crash_duration(cp) || ' seconds')::interval THEN
      FOR b IN SELECT * FROM public.crash_bets WHERE round_id=r.id AND status='placed' LOOP
        IF b.auto_cashout IS NOT NULL AND b.auto_cashout >= 1.01 AND b.auto_cashout <= cp THEN
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
END $fn$;