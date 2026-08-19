CREATE OR REPLACE FUNCTION public.crash_new_round()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  seed text; cp numeric; rid uuid; recent boolean;
  n bigint; b int; prev int[]; tries int := 0;
  fn_bucket int;
BEGIN
  -- last 4 crash points (most recent first) as buckets
  SELECT array_agg(CASE WHEN r.crash_point < 2 THEN 0 WHEN r.crash_point < 5 THEN 1 ELSE 2 END ORDER BY r.round_no DESC)
    INTO prev
  FROM (SELECT crash_point, round_no FROM public.crash_rounds
        WHERE status = 'crashed' AND crash_point IS NOT NULL
        ORDER BY round_no DESC LIMIT 4) r;

  LOOP
    tries := tries + 1;
    seed := encode(extensions.gen_random_bytes(32), 'hex');
    -- random nonce so the sequence can never be walked / studied
    n := (floor(random() * 9000000000)::bigint + 1000000);
    cp := public.crash_point_from(seed, n);
    b := CASE WHEN cp < 2 THEN 0 WHEN cp < 5 THEN 1 ELSE 2 END;

    EXIT WHEN tries >= 3 OR prev IS NULL OR array_length(prev,1) < 3;
    -- break visible streaks: avoid a 4th identical bucket in a row
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