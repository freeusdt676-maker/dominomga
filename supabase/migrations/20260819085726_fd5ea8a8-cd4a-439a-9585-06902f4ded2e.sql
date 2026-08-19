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
  force_low boolean := false; jit numeric; hi_run int; low_run int; low_cap int;
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

  jit := 0.92 + random() * 0.16;
  k := k * jit;
  tail := tail * (0.94 + random() * 0.12);

  -- anti-frustration only: many very low rounds in a row relaxes the curve
  SELECT count(*) INTO dry FROM (
    SELECT crash_point FROM public.crash_rounds
    WHERE status='crashed' AND crash_point IS NOT NULL
    ORDER BY round_no DESC LIMIT 12
  ) q WHERE crash_point < 1.60;
  IF dry >= 11 THEN k := GREATEST(k, 1.00); tail := GREATEST(tail, 0.64); END IF;

  SELECT COALESCE(sum(CASE WHEN crash_point >= 2 THEN 1 ELSE 0 END),0)::numeric
    INTO hi
  FROM (
    SELECT crash_point FROM public.crash_rounds
    WHERE status='crashed' AND crash_point IS NOT NULL
    ORDER BY round_no DESC LIMIT 4
  ) q;

  roll := random();
  force_low := dry < 11 AND (
    (hi >= 3 AND roll < 0.70) OR
    (hi = 2 AND roll < 0.45) OR
    (hi = 1 AND roll < 0.15)
  );

  -- current run lengths (how many latest rounds share the same side)
  SELECT array_agg(CASE WHEN r.crash_point < 2 THEN 0 ELSE 1 END ORDER BY r.round_no DESC)
    INTO prev
  FROM (SELECT crash_point, round_no FROM public.crash_rounds
        WHERE status = 'crashed' AND crash_point IS NOT NULL
        ORDER BY round_no DESC LIMIT 20) r;

  hi_run := 0; low_run := 0;
  IF prev IS NOT NULL THEN
    FOR i IN 1..array_length(prev,1) LOOP
      EXIT WHEN prev[i] <> 1; hi_run := hi_run + 1;
    END LOOP;
    FOR i IN 1..array_length(prev,1) LOOP
      EXIT WHEN prev[i] <> 0; low_run := low_run + 1;
    END LOOP;
  END IF;

  -- low runs may go long (random cap between 8 and 15) so the history never
  -- shows a regular "one high every 4 rounds" rhythm
  low_cap := 8 + floor(random() * 8)::int;

  LOOP
    tries := tries + 1;
    seed := encode(extensions.gen_random_bytes(32), 'hex');
    n := (floor(random() * 9000000000)::bigint + 1000000);
    cp := public.crash_point_calc(seed, n, k, tail);
    b := CASE WHEN cp < 2 THEN 0 ELSE 1 END;
    EXIT WHEN tries >= 8;
    -- never allow more than two consecutive high rounds
    IF hi_run >= 2 AND b = 1 THEN CONTINUE; END IF;
    IF force_low AND b = 1 THEN CONTINUE; END IF;
    -- only break a low run once it exceeds its random cap
    IF low_run >= low_cap AND b = 0 THEN CONTINUE; END IF;
    EXIT;
  END LOOP;

  IF (force_low OR hi_run >= 2) AND cp >= 2.00 THEN
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
  VALUES (encode(extensions.digest(seed,'sha256'),'hex'), n, 'betting', now() + interval '10 seconds')
  RETURNING id INTO rid;
  INSERT INTO public.crash_round_secrets(round_id, server_seed, crash_point) VALUES (rid, seed, cp);
  RETURN rid;
END
$function$;