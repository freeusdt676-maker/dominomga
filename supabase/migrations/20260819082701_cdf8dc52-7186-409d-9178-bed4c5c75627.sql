
CREATE OR REPLACE FUNCTION public.crash_point_calc(_seed text, _nonce bigint, _k numeric, _tail numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE h bytea; raw bigint; e numeric; c numeric;
BEGIN
  h := extensions.hmac(_nonce::text::bytea, _seed::bytea, 'sha256');
  raw := ('x0' || substr(encode(h, 'hex'), 1, 13))::bit(56)::bigint;
  e := raw::numeric / (2::numeric ^ 52);
  IF e < 0 THEN e := -e; END IF;
  IF e >= 1 THEN e := 0.999999999; END IF;
  c := floor((_k / power(1.0 - e, _tail)) * 100.0) / 100.0;
  IF c < 1.01 THEN c := 1.00; END IF;
  IF c > 999.00 THEN c := 999.00; END IF;
  RETURN c;
END;
$function$;

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
  k numeric; tail numeric; dry int;
BEGIN
  -- ---- hidden risk engine (never exposed to clients) ----
  SELECT COALESCE(sum(amount),0), COALESCE(sum(payout),0)
    INTO wag, pay
  FROM public.crash_bets
  WHERE created_at > now() - interval '24 hours';

  pnl := wag - pay;                                   -- positive = platform ahead
  rtp := CASE WHEN wag > 0 THEN pay / wag ELSE 0.85 END;

  k := 0.96; tail := 0.69;

  IF wag >= 5000 THEN
    IF rtp >= 1.30 THEN       k := 0.55; tail := 0.55;   -- players way ahead: hard tighten
    ELSIF rtp >= 1.10 THEN    k := 0.68; tail := 0.60;
    ELSIF rtp >= 0.95 THEN    k := 0.80; tail := 0.64;
    ELSIF rtp <= 0.55 THEN    k := 1.06; tail := 0.74;   -- platform way ahead: give back a bit
    ELSIF rtp <= 0.70 THEN    k := 1.00; tail := 0.71;
    END IF;
  END IF;

  IF pnl < 0 THEN
    k := LEAST(k, 0.70); tail := LEAST(tail, 0.60);
  END IF;

  -- anti-frustration: after a long dry streak, relax so players can still win
  SELECT count(*) INTO dry FROM (
    SELECT crash_point FROM public.crash_rounds
    WHERE status='crashed' AND crash_point IS NOT NULL
    ORDER BY round_no DESC LIMIT 7
  ) q WHERE crash_point < 1.60;
  IF dry >= 6 THEN k := GREATEST(k, 1.00); tail := GREATEST(tail, 0.70); END IF;

  -- ---- generation ----
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
    EXIT WHEN tries >= 3 OR prev IS NULL OR array_length(prev,1) < 3;
    EXIT WHEN NOT (prev[1] = b AND prev[2] = b AND prev[3] = b);
  END LOOP;

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
