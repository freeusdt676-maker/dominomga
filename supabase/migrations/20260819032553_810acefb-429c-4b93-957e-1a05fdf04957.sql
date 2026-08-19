CREATE OR REPLACE FUNCTION public.crash_new_round()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE seed text; cp numeric; rid uuid; recent boolean;
BEGIN
  seed := encode(extensions.gen_random_bytes(32), 'hex');
  cp := public.crash_point_from(seed, 1);

  -- ×100+ is allowed at most once per 24h (unpredictable, never scheduled)
  IF cp >= 100 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.crash_round_secrets s
      WHERE s.crash_point >= 100 AND s.created_at > now() - interval '24 hours'
    ) INTO recent;
    IF recent THEN
      cp := 1.00 + (cp - floor(cp));  -- fold back into a low multiplier
      IF cp < 1.01 THEN cp := 1.00; END IF;
    END IF;
  END IF;

  INSERT INTO public.crash_rounds(server_seed_hash, nonce, status, betting_ends_at)
  VALUES (encode(extensions.digest(seed,'sha256'),'hex'), 1, 'betting', now() + interval '8 seconds')
  RETURNING id INTO rid;
  INSERT INTO public.crash_round_secrets(round_id, server_seed, crash_point) VALUES (rid, seed, cp);
  RETURN rid;
END
$fn$;