CREATE OR REPLACE FUNCTION public.crash_point_from(_seed text, _nonce bigint)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  h bytea;
  raw bigint;
  e numeric;
  c numeric;
BEGIN
  h := extensions.hmac(_nonce::text::bytea, _seed::bytea, 'sha256');
  -- take the first 52 bits (13 hex chars) -> always positive, uniform in [0,1)
  raw := ('x0' || substr(encode(h, 'hex'), 1, 13))::bit(56)::bigint;
  e := raw::numeric / (2::numeric ^ 52);
  IF e < 0 THEN e := -e; END IF;
  IF e >= 1 THEN e := 0.999999999; END IF;
  c := floor((0.88 / power(1.0 - e, 0.70)) * 100.0) / 100.0;
  IF c < 1.01 THEN c := 1.00; END IF;
  IF c > 999.00 THEN c := 999.00; END IF;
  RETURN c;
END;
$$;