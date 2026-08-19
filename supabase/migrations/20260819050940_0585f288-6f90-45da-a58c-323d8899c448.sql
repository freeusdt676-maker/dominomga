CREATE OR REPLACE FUNCTION public.crash_point_from(_seed text, _nonce bigint)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE h bytea; hv numeric; e numeric; c numeric;
BEGIN
  h := extensions.hmac(_nonce::text, _seed, 'sha256');
  hv := (get_byte(h,0)::numeric*4294967296 + get_byte(h,1)::numeric*16777216 + get_byte(h,2)::numeric*65536 + get_byte(h,3)::numeric*256 + get_byte(h,4)::numeric);
  e := hv / 1099511627776.0;
  IF e > 0.999999 THEN e := 0.999999; END IF;
  c := floor((0.88 / power(1.0 - e, 0.65)) * 100.0) / 100.0;
  IF c < 1.01 THEN RETURN 1.00; END IF;
  RETURN LEAST(c, 999.00);
END
$$;