CREATE OR REPLACE FUNCTION public.crash_point_from(_seed text, _nonce bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE h bytea; hv numeric; e numeric; c numeric;
BEGIN
  h := extensions.hmac(_nonce::text, _seed, 'sha256');
  hv := (get_byte(h,0)::numeric*4294967296 + get_byte(h,1)::numeric*16777216 + get_byte(h,2)::numeric*65536 + get_byte(h,3)::numeric*256 + get_byte(h,4)::numeric);
  e := hv / 1099511627776.0;               -- [0,1)
  c := floor((0.80 / (1.0 - e)) * 100.0) / 100.0;  -- P(c >= x) = 0.80/x
  IF c < 1.01 THEN RETURN 1.00; END IF;    -- ~20% instant bust; P(c>=2)=40%
  RETURN LEAST(c, 999.00);
END $function$;

CREATE OR REPLACE FUNCTION public.crash_place_bet(_amount numeric, _auto_cashout numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); r RECORD; bal numeric; admin_user uuid; st account_status;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.game_blocked('crash') THEN RAISE EXCEPTION 'game_blocked'; END IF;
  SELECT account_status INTO st FROM public.profiles WHERE user_id = uid;
  IF st IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'account_not_active'; END IF;
  IF _amount IS NULL OR _amount < 100 OR _amount > 10000 OR _amount <> floor(_amount) THEN
    RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _auto_cashout IS NOT NULL AND (_auto_cashout < 1.01 OR _auto_cashout > 999.00) THEN
    RAISE EXCEPTION 'invalid_auto_cashout'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crash_bet:'||uid::text, 0));
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO r FROM public.crash_rounds ORDER BY round_no DESC LIMIT 1;
  IF r IS NULL OR r.status <> 'betting' OR now() >= r.betting_ends_at THEN
    RAISE EXCEPTION 'betting_closed'; END IF;
  IF EXISTS (SELECT 1 FROM public.crash_bets WHERE round_id=r.id AND user_id=uid) THEN
    RAISE EXCEPTION 'already_bet'; END IF;

  SELECT balance INTO bal FROM public.wallets WHERE user_id=uid FOR UPDATE;
  IF bal IS NULL OR bal < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  SELECT user_id INTO admin_user FROM public.user_roles WHERE role='admin' ORDER BY created_at LIMIT 1;

  UPDATE public.wallets SET balance = balance - _amount, updated_at=now() WHERE user_id=uid;
  UPDATE public.admin_wallets SET balance = balance + _amount, updated_at=now() WHERE admin_id = admin_user;
  INSERT INTO public.transactions(user_id,type,amount,status,game_id)
    VALUES (uid,'game_stake',_amount,'completed',r.id);
  INSERT INTO public.crash_bets(round_id,user_id,amount,auto_cashout) VALUES (r.id,uid,_amount,_auto_cashout);

  RETURN jsonb_build_object('ok',true,'round_id',r.id,'amount',_amount);
END $function$;