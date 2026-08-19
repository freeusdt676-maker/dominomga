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
  c := floor((0.88 / (1.0 - e)) * 100.0) / 100.0;
  IF c < 1.01 THEN RETURN 1.00; END IF;
  RETURN LEAST(c, 999.00);
END
$$;

CREATE OR REPLACE FUNCTION public.mask_phone(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _phone IS NULL OR length(regexp_replace(_phone,'\D','','g')) < 5 THEN 'joueur'
    ELSE left(regexp_replace(_phone,'\D','','g'),3) || 'xxxxx' || right(regexp_replace(_phone,'\D','','g'),2)
  END
$$;

CREATE OR REPLACE FUNCTION public.crash_round_bets(_round_id uuid DEFAULT NULL)
RETURNS TABLE(bet_id uuid, masked_phone text, amount numeric, cashout_multiplier numeric, payout numeric, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id,
         public.mask_phone(p.phone),
         b.amount,
         b.cashout_multiplier,
         b.payout,
         b.status
  FROM public.crash_bets b
  LEFT JOIN public.profiles p ON p.user_id = b.user_id
  WHERE b.round_id = COALESCE(
          _round_id,
          (SELECT id FROM public.crash_rounds ORDER BY round_no DESC LIMIT 1))
  ORDER BY b.amount DESC
  LIMIT 100
$$;

CREATE OR REPLACE FUNCTION public.crash_top_gains_today()
RETURNS TABLE(bet_id uuid, masked_phone text, amount numeric, cashout_multiplier numeric, payout numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id,
         public.mask_phone(p.phone),
         b.amount,
         b.cashout_multiplier,
         b.payout
  FROM public.crash_bets b
  LEFT JOIN public.profiles p ON p.user_id = b.user_id
  WHERE b.status = 'cashed'
    AND (b.created_at AT TIME ZONE 'Indian/Antananarivo')::date
        = (now() AT TIME ZONE 'Indian/Antananarivo')::date
  ORDER BY b.payout DESC
  LIMIT 50
$$;

GRANT EXECUTE ON FUNCTION public.crash_round_bets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crash_top_gains_today() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_phone(text) TO authenticated;