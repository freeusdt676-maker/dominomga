CREATE TABLE IF NOT EXISTS public.crash_schedule (
  window_size int NOT NULL,
  window_index bigint NOT NULL,
  target_round bigint NOT NULL,
  lo numeric NOT NULL,
  hi numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (window_size, window_index)
);
GRANT ALL ON public.crash_schedule TO service_role;
ALTER TABLE public.crash_schedule ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.crash_schedule_hit(_size int, _round bigint, _lo numeric, _hi numeric)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  widx bigint; tgt bigint; base bigint;
BEGIN
  widx := (_round - 1) / _size;
  base := widx * _size + 1;
  SELECT target_round INTO tgt FROM public.crash_schedule
   WHERE window_size = _size AND window_index = widx;
  IF tgt IS NULL THEN
    tgt := base + floor(random() * _size)::bigint;
    INSERT INTO public.crash_schedule(window_size, window_index, target_round, lo, hi)
    VALUES (_size, widx, tgt, _lo, _hi)
    ON CONFLICT (window_size, window_index) DO NOTHING;
    SELECT target_round INTO tgt FROM public.crash_schedule
     WHERE window_size = _size AND window_index = widx;
  END IF;
  RETURN tgt = _round;
END
$function$;
REVOKE ALL ON FUNCTION public.crash_schedule_hit(int,bigint,numeric,numeric) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crash_new_round()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  seed text; cp numeric; rid uuid; n bigint; nxt bigint;
  wag numeric; pay numeric; rtp numeric;
  u numeric; v numeric; shift numeric := 0;
  b0a numeric; b0b numeric; b1 numeric; b2 numeric; b3 numeric;
  slo numeric := NULL; shi numeric := NULL;
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

  SELECT COALESCE(max(round_no), 0) + 1 INTO nxt FROM public.crash_rounds;

  -- scheduled rare rounds: biggest window wins when several land on the same round
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
    -- every other round stays between x1.00 and x3.10
    b0a := 0.11 + shift;
    b0b := b0a + 0.09;
    b1  := b0b + 0.09;
    b2  := 0.72 + shift;
    b3  := 0.90 + shift;
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
    ELSE
      cp := floor((2.50 + v * 0.60) * 100.0) / 100.0;
    END IF;
    IF cp > 3.10 THEN cp := 3.10; END IF;
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