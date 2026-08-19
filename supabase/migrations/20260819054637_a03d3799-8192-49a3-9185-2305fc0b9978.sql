CREATE OR REPLACE FUNCTION public.crash_point_from(_seed text, _nonce bigint)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h bytea;
  e numeric;
  c numeric;
BEGIN
  h := hmac(_seed::bytea, _nonce::text::bytea, 'sha256');
  e := ('x' || encode(h, 'hex'))::bit(256)::bigint::numeric / (2::numeric ^ 256);
  c := floor((0.88 / power(1.0 - e, 0.70)) * 100.0) / 100.0;
  IF c < 1.01 THEN c := 1.00; END IF;
  IF c > 999.00 THEN c := 999.00; END IF;
  RETURN c;
END;
$$;