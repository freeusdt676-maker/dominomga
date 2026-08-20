CREATE OR REPLACE FUNCTION public.crash_new_round()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  seed text; cp numeric; rid uuid; n bigint; nxt bigint;
  wag numeric; pay numeric; rtp numeric;
  u numeric; v numeric; w numeric; shift numeric := 0;
  b2 numeric; b3 numeric;
  lowp numeric; lows int := 0; prevlow boolean := false;
  slo numeric := NULL; shi numeric := NULL;
  hi_recent int := 0;
BEGIN
  SELECT COALESCE(sum(amount),0), COALESCE(sum(payout),0) INTO wag, pay
  FROM public.crash_bets WHERE created_at > now() - interval '24 hours';
  rtp := CASE WHEN wag > 0 THEN pay / wag ELSE 0.85 END;
  IF wag >= 5000 THEN
    IF rtp >= 1.20 THEN shift := 0.07;
    ELSIF rtp >= 1.00 THEN shift := 0.04;
    ELSIF rtp <= 0.55 THEN shift := -0.04;
    END IF;
  END IF;

  seed := encode(extensions.gen_random_bytes(32), 'hex');
  n := (floor(random() * 9000000000)::bigint + 1000000);
  u := public.crash_uniform(seed, n, 'bucket');
  v := public.crash_uniform(seed, n, 'value');
  w := public.crash_uniform(seed, n, 'low');

  SELECT COALESCE(max(round_no), 0) + 1 INTO nxt FROM public.crash_rounds;

  IF public.crash_schedule_hit(1000, nxt, 100, 500) THEN slo := 100; shi := 500;
  ELSIF public.crash_schedule_hit(100, nxt, 60, 70) THEN slo := 60; shi := 70;
  ELSIF public.crash_schedule_hit(50, nxt, 40, 45) THEN slo := 40; shi := 45;
  ELSIF public.crash_schedule_hit(30, nxt, 22, 25) THEN slo := 22; shi := 25;
  ELSIF public.crash_schedule_hit(20, nxt, 14, 17) THEN slo := 14; shi := 17;
  ELSIF public.crash_schedule_hit(10, nxt, 6, 8) THEN slo := 6; shi := 8;
  END IF;

  IF slo IS NOT NULL THEN
    cp := floor((slo + v * (shi - slo)) * 100.0) / 100.0;
  ELSE
    SELECT count(*) FILTER (WHERE s.crash_point <= 1.15),
           bool_or(s.crash_point <= 1.15) FILTER (WHERE rn = 1)
      INTO lows, prevlow
    FROM (
      SELECT s.crash_point, row_number() OVER (ORDER BY r.round_no DESC) rn
      FROM public.crash_rounds r
      JOIN public.crash_round_secrets s ON s.round_id = r.id
      ORDER BY r.round_no DESC LIMIT 3
    ) s;
    prevlow := COALESCE(prevlow, false);

    -- how many of the last 6 rounds already reached x2.00+
    SELECT count(*) INTO hi_recent FROM (
      SELECT s.crash_point
      FROM public.crash_rounds r
      JOIN public.crash_round_secrets s ON s.round_id = r.id
      ORDER BY r.round_no DESC LIMIT 6
    ) t WHERE t.crash_point >= 2.00;

    lowp := 0.34 + shift * 2.5;
    IF prevlow THEN lowp := lowp + 0.20; END IF;
    IF lows >= 3 THEN lowp := 0.12; END IF;
    IF lowp > 0.68 THEN lowp := 0.68; END IF;
    IF lowp < 0.20 THEN lowp := 0.20; END IF;

    IF u < lowp THEN
      IF w < 0.40 THEN
        cp := 1.00;
      ELSE
        cp := floor((1.01 + v * 0.14) * 100.0) / 100.0;
      END IF;
    ELSE
      -- only ~8% of unscheduled rounds may reach x2.00+, and none if 2+
      -- of the last 6 rounds were already x2.00+
      b2 := lowp + 0.92 * (1 - lowp);
      IF hi_recent >= 2 THEN b2 := 1.01; END IF;
      IF u < b2 THEN
        cp := floor((1.16 + v * 0.83) * 100.0) / 100.0;
      ELSE
        cp := floor((2.00 + v * 0.10) * 100.0) / 100.0;
      END IF;
    END IF;
    IF cp > 2.10 THEN cp := 2.10; END IF;
  END IF;

  IF cp < 1.01 THEN cp := 1.00; END IF;
  IF cp > 999.00 THEN cp := 999.00; END IF;

  INSERT INTO public.crash_rounds(server_seed_hash, nonce, status, betting_ends_at)
  VALUES (encode(extensions.digest(seed,'sha256'),'hex'), n, 'betting', now() + interval '10 seconds')
  RETURNING id INTO rid;
  INSERT INTO public.crash_round_secrets(round_id, server_seed, crash_point) VALUES (rid, seed, cp);
  RETURN rid;
END
$function$;