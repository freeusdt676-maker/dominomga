CREATE OR REPLACE FUNCTION public.crash_uniform(_seed text, _nonce bigint, _salt text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $function$
DECLARE h bytea; raw bigint; e numeric;
BEGIN
  h := extensions.hmac((_nonce::text || ':' || _salt)::bytea, _seed::bytea, 'sha256');
  raw := ('x0' || substr(encode(h, 'hex'), 1, 13))::bit(56)::bigint;
  e := raw::numeric / (2::numeric ^ 52);
  IF e < 0 THEN e := -e; END IF;
  IF e >= 1 THEN e := 0.999999999; END IF;
  RETURN e;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crash_new_round()
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  seed text; cp numeric; rid uuid; recent boolean; n bigint;
  wag numeric; pay numeric; rtp numeric;
  u numeric; v numeric; shift numeric := 0;
  b1 numeric; b2 numeric; b3 numeric; b4 numeric; b5 numeric;
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

  b1 := 0.11 + shift;
  b2 := 0.68 + shift;
  b3 := 0.87 + shift;
  b4 := 0.955 + shift * 0.5;
  b5 := 0.990 + shift * 0.2;

  IF u < b1 THEN
    cp := 1.00;
  ELSIF u < b2 THEN
    cp := floor((1.01 + v * 0.98) * 100.0) / 100.0;
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

REVOKE ALL ON FUNCTION public.crash_uniform(text,bigint,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.crash_new_round() FROM public, anon, authenticated;