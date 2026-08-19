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
  k numeric; tail numeric; dry int; hi2 int; force_low boolean := false;
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

  SELECT count(*) INTO dry FROM (
    SELECT crash_point FROM public.crash_rounds
    WHERE status='crashed' AND crash_point IS NOT NULL
    ORDER BY round_no DESC LIMIT 7
  ) q WHERE crash_point < 1.60;
  IF dry >= 6 THEN k := GREATEST(k, 1.00); tail := GREATEST(tail, 0.64); END IF;

  SELECT count(*) INTO hi2 FROM (
    SELECT crash_point FROM public.crash_rounds
    WHERE status='crashed' AND crash_point IS NOT NULL
    ORDER BY round_no DESC LIMIT 2
  ) q WHERE crash_point >= 2.00;
  force_low := (hi2 >= 2 AND dry < 6);

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
    cp := floor((1.05 + (cp - floor(cp)) * 0.9) * 100.0) / 100.0;
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