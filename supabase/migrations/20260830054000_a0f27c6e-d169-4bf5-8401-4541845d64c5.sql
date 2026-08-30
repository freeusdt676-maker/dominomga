CREATE OR REPLACE FUNCTION public.request_password_recovery(_phone text, _name text, _gender text, _games text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile RECORD;
  v_cooldown_until TIMESTAMPTZ;
  v_id UUID;
  v_existing UUID;
  v_last_ok TIMESTAMPTZ;
  v_gender_in TEXT;
  v_gender_profile TEXT;
BEGIN
  SELECT MAX(created_at) INTO v_cooldown_until
  FROM public.password_reset_requests
  WHERE phone = _phone
    AND status = 'rejected_auto'
    AND created_at > now() - INTERVAL '5 minutes';

  IF v_cooldown_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cooldown',
      'retry_at', (v_cooldown_until + INTERVAL '5 minutes'));
  END IF;

  SELECT p.user_id, p.mvola_name, p.gender::text AS gender
  INTO v_profile
  FROM public.profiles p
  WHERE p.phone = _phone
  LIMIT 1;

  IF v_profile.user_id IS NULL THEN
    INSERT INTO public.password_reset_requests(user_id, phone, status, message, answers)
    VALUES (NULL, _phone, 'rejected_auto', 'phone_not_found',
            jsonb_build_object('phone', _phone, 'name', _name, 'gender', _gender));
    RETURN jsonb_build_object('ok', false, 'error', 'wrong');
  END IF;

  v_gender_in := lower(trim(coalesce(_gender,'')));
  v_gender_in := CASE
    WHEN v_gender_in IN ('lahy','male','m','homme','lehilahy') THEN 'male'
    WHEN v_gender_in IN ('vavy','female','f','femme','vehivavy') THEN 'female'
    WHEN v_gender_in IN ('hafa','other','autre') THEN 'other'
    ELSE v_gender_in
  END;
  v_gender_profile := lower(trim(coalesce(v_profile.gender,'')));

  IF lower(trim(coalesce(v_profile.mvola_name,''))) <> lower(trim(coalesce(_name,'')))
     OR v_gender_profile <> v_gender_in THEN
    INSERT INTO public.password_reset_requests(user_id, phone, status, message, answers)
    VALUES (v_profile.user_id, _phone, 'rejected_auto', 'answers_wrong',
            jsonb_build_object('phone', _phone, 'name', _name, 'gender', _gender));
    RETURN jsonb_build_object('ok', false, 'error', 'wrong');
  END IF;

  SELECT id INTO v_existing
  FROM public.password_reset_requests
  WHERE phone = _phone AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'request_id', v_existing);
  END IF;

  -- One accepted recovery per month per phone
  SELECT MAX(created_at) INTO v_last_ok
  FROM public.password_reset_requests
  WHERE phone = _phone
    AND status IN ('approved','rejected')
    AND created_at > now() - INTERVAL '30 days';

  IF v_last_ok IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monthly_limit',
      'retry_at', (v_last_ok + INTERVAL '30 days'));
  END IF;

  INSERT INTO public.password_reset_requests(user_id, phone, status, answers)
  VALUES (v_profile.user_id, _phone, 'pending',
          jsonb_build_object('phone', _phone, 'name', _name, 'gender', _gender))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_password_recovery(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recovery_status(uuid, text) TO anon, authenticated;

-- Tournament entry fee 1 000 -> 2 000 Ar
CREATE OR REPLACE FUNCTION public.tournament_register(_game_type text, _nom text, _tel text, _id_card text, _pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  t public.tournaments%ROWTYPE;
  tid uuid; cnt int;
  gl text; sl smallint; bal numeric; profile_pin text; fee numeric := 2000;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _nom IS NULL OR btrim(_nom) = '' OR _tel IS NULL OR btrim(_tel) = ''
     OR _id_card IS NULL OR btrim(_id_card) = '' THEN
    RAISE EXCEPTION 'fields_required';
  END IF;

  SELECT pin_plain INTO profile_pin FROM public.profiles WHERE user_id = uid;
  IF profile_pin IS NULL OR profile_pin = '' THEN RAISE EXCEPTION 'pin_not_set'; END IF;
  IF profile_pin <> btrim(_pin) THEN RAISE EXCEPTION 'pin_diso'; END IF;

  SELECT * INTO t FROM public.tournaments
   WHERE game_type = _game_type::tournament_game_type AND status = 'registration'
   ORDER BY week_start DESC LIMIT 1;
  IF t.id IS NULL THEN RAISE EXCEPTION 'registration_closed'; END IF;
  IF now() > t.reg_close THEN RAISE EXCEPTION 'registration_closed_time'; END IF;
  tid := t.id;

  IF EXISTS (SELECT 1 FROM public.tournament_registrations
              WHERE tournament_id = tid AND user_id = uid AND cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_registrations
              WHERE tournament_id = tid AND id_card = btrim(_id_card) AND cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'id_card_already_used';
  END IF;

  SELECT count(*) INTO cnt FROM public.tournament_registrations
   WHERE tournament_id = tid AND cancelled_at IS NULL;
  IF cnt >= 8 THEN RAISE EXCEPTION 'tournament_full'; END IF;

  SELECT balance INTO bal FROM public.wallets WHERE user_id = uid FOR UPDATE;
  IF COALESCE(bal,0) < fee THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  gl := (ARRAY['A','B','C','D'])[(cnt / 2) + 1];
  sl := (cnt % 2) + 1;

  PERFORM public.allow_wallet_mutation();
  UPDATE public.wallets SET balance = balance - fee, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.transactions(user_id, type, amount, status, admin_note)
  VALUES (uid, 'game_stake', fee, 'completed', 'Tournoi du Semaine — inscription');

  INSERT INTO public.tournament_registrations(tournament_id, user_id, nom, tel, id_card, paid_amount, group_letter, slot)
  VALUES (tid, uid, btrim(_nom), btrim(_tel), btrim(_id_card), fee, gl, sl);

  UPDATE public.tournaments SET total_collected = total_collected + fee, updated_at = now() WHERE id = tid;

  RETURN jsonb_build_object('ok', true, 'group', gl, 'slot', sl);
END $function$;