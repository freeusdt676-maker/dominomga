CREATE OR REPLACE FUNCTION public.crash_new_round()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  seed text; cp numeric; rid uuid; recent boolean; n bigint;
  wag numeric; pay numeric; rtp numeric;
  u numeric; v numeric; shift numeric := 0;
  b0a numeric; b0b numeric; b1 numeric; b2 numeric; b3 numeric; b4 numeric; b5 numeric;
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

  b0a := 0.11 + shift;          -- ×1.00 bust
  b0b := b0a + 0.09;            -- 1.01 – 1.09
  b1  := b0b + 0.09;            -- 1.10 – 1.19
  b2  := 0.68 + shift;          -- 1.20 – 1.99
  b3  := 0.87 + shift;
  b4  := 0.955 + shift * 0.5;
  b5  := 0.990 + shift * 0.2;

  IF u < b0a THEN
    cp := 1.00;
  ELSIF u < b0b THEN
    cp := floor((1.01 + v * 0.08) * 100.0) / 100.0;
  ELSIF u < b1 THEN
    cp := floor((1.10 + v * 0.09) * 100.0) / 100.0;
  ELSIF u < b2 THEN
    cp := floor((1.20 + v * 0.79) * 100.0) / 100.0;
  ELSIF u < b3 THEN
    cp := floor((2.00 + v * 0.49) * 100.0) / 100.0;
  ELSIF u < b4 THEN
    cp := floor((2.50 + v * 2.49) * 100.0) / 100.0;
  ELSIF u < b5 THEN
    cp := floor((5.00 + v * 14.99) * 100.0) / 100.0;
  ELSE
    cp := floor((20.0 / power(1.0 - v * 0.98, 0.55)) * 100.0) / 100.0;
  END IF;

  IF cp < 1.01 THEN cp := 1.00; END IF;
  IF cp > 999.00 THEN cp := 999.00; END IF;

  IF cp >= 100 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.crash_round_secrets s
      WHERE s.crash_point >= 100 AND s.created_at > now() - interval '24 hours'
    ) INTO recent;
    IF recent THEN cp := floor((5.00 + v * 14.99) * 100.0) / 100.0; END IF;
  END IF;

  INSERT INTO public.crash_rounds(server_seed_hash, nonce, status, betting_ends_at)
  VALUES (encode(extensions.digest(seed,'sha256'),'hex'), n, 'betting', now() + interval '10 seconds')
  RETURNING id INTO rid;
  INSERT INTO public.crash_round_secrets(round_id, server_seed, crash_point) VALUES (rid, seed, cp);
  RETURN rid;
END
$function$;