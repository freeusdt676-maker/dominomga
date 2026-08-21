-- 1. Wallet PIN verification (server side, tolerant of admin-approved PIN changes)
CREATE OR REPLACE FUNCTION public.wallet_verify_pin(_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); h text; plain text; calc text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _pin IS NULL OR _pin !~ '^[0-9]{4,6}$' THEN RETURN false; END IF;
  calc := encode(extensions.digest(_pin || uid::text, 'sha256'), 'hex');
  SELECT pin_hash INTO h FROM public.wallets WHERE user_id = uid;
  IF h IS NOT NULL AND h = calc THEN RETURN true; END IF;
  SELECT pin_plain INTO plain FROM public.profiles WHERE user_id = uid;
  IF plain IS NOT NULL AND btrim(plain) = _pin THEN
    UPDATE public.wallets SET pin_hash = calc, updated_at = now() WHERE user_id = uid;
    RETURN true;
  END IF;
  IF h IS NULL THEN
    -- no PIN configured yet: adopt the first PIN entered
    UPDATE public.wallets SET pin_hash = calc, updated_at = now() WHERE user_id = uid;
    RETURN true;
  END IF;
  RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.wallet_verify_pin(text) FROM public;
GRANT EXECUTE ON FUNCTION public.wallet_verify_pin(text) TO authenticated;

-- 2. Keep wallet pin_hash in sync when an admin approves a PIN change
CREATE OR REPLACE FUNCTION public.admin_approve_profile_change(_req_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD; admin_uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(admin_uid,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO r FROM public.profile_change_requests WHERE id=_req_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'already_processed'; END IF;

  UPDATE public.profiles SET
    mvola_name = COALESCE(r.proposed_mvola_name, mvola_name),
    phone = COALESCE(r.proposed_phone, phone),
    password_plain = COALESCE(r.proposed_password, password_plain),
    pin_plain = COALESCE(r.proposed_pin, pin_plain),
    selfie_url = COALESCE(r.proposed_selfie_url, selfie_url),
    avatar_url = COALESCE(r.proposed_selfie_url, avatar_url),
    updated_at = now()
  WHERE user_id = r.user_id;

  IF r.proposed_pin IS NOT NULL AND btrim(r.proposed_pin) ~ '^[0-9]{4,6}$' THEN
    UPDATE public.wallets
      SET pin_hash = encode(extensions.digest(btrim(r.proposed_pin) || r.user_id::text, 'sha256'), 'hex'),
          updated_at = now()
      WHERE user_id = r.user_id;
  END IF;

  UPDATE public.profile_change_requests
    SET status='approved', processed_by=admin_uid, processed_at=now()
    WHERE id=_req_id;

  INSERT INTO public.chat_messages(sender_id, recipient_id, content, is_admin_broadcast)
  VALUES (admin_uid, r.user_id, 'Nankatoavin''ny ADMINISTRATIF ny fanovana ny mombamomba anao ✓', false);

  RETURN jsonb_build_object('ok',true);
END $$;

-- 3. Allow blocking the crash game
CREATE OR REPLACE FUNCTION public.admin_set_game_block(_admin_id uuid, _pin text, _game_type text, _blocked boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _admin_id := auth.uid();
  IF _game_type NOT IN ('domino', 'ludo', 'petanque', 'crash') THEN RAISE EXCEPTION 'game_type_diso'; END IF;

  INSERT INTO public.game_blocks(game_type, blocked, updated_by, updated_at)
  VALUES (_game_type, _blocked, _admin_id, now())
  ON CONFLICT (game_type) DO UPDATE
    SET blocked = EXCLUDED.blocked,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'game_type', _game_type, 'blocked', _blocked);
END $$;

-- 4. Crash: break the predictable "high round every ~4 rounds" pattern
CREATE OR REPLACE FUNCTION public.crash_new_round()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  seed text; cp numeric; rid uuid; n bigint; nxt bigint;
  wag numeric; pay numeric; rtp numeric;
  u numeric; v numeric; w numeric; shift numeric := 0;
  b2 numeric; lowp numeric; lows int := 0; prevlow boolean := false;
  slo numeric := NULL; shi numeric := NULL;
  hi_recent int := 0; jitter numeric;
BEGIN
  SELECT COALESCE(sum(amount),0), COALESCE(sum(payout),0) INTO wag, pay
  FROM public.crash_bets WHERE created_at > now() - interval '24 hours';
  rtp := CASE WHEN wag > 0 THEN pay / wag ELSE 0.85 END;
  IF wag >= 5000 THEN
    IF rtp >= 1.20 THEN shift := 0.10;
    ELSIF rtp >= 1.00 THEN shift := 0.06;
    ELSIF rtp <= 0.45 THEN shift := -0.05;
    END IF;
  END IF;

  seed := encode(extensions.gen_random_bytes(32), 'hex');
  n := (floor(random() * 9000000000)::bigint + 1000000);
  u := public.crash_uniform(seed, n, 'bucket');
  v := public.crash_uniform(seed, n, 'value');
  w := public.crash_uniform(seed, n, 'low');

  SELECT COALESCE(max(round_no), 0) + 1 INTO nxt FROM public.crash_rounds;

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
    SELECT count(*) FILTER (WHERE s.crash_point <= 1.15),
           bool_or(s.crash_point <= 1.15) FILTER (WHERE rn = 1)
      INTO lows, prevlow
    FROM (
      SELECT s.crash_point, row_number() OVER (ORDER BY r.round_no DESC) rn
      FROM public.crash_rounds r
      JOIN public.crash_round_secrets s ON s.round_id = r.id
      ORDER BY r.round_no DESC LIMIT 6
    ) s;
    prevlow := COALESCE(prevlow, false);

    SELECT count(*) INTO hi_recent FROM (
      SELECT s.crash_point
      FROM public.crash_rounds r
      JOIN public.crash_round_secrets s ON s.round_id = r.id
      ORDER BY r.round_no DESC LIMIT 8
    ) t WHERE t.crash_point >= 1.80;

    -- base low probability + random jitter so no visible periodicity
    jitter := (random() - 0.5) * 0.16;
    lowp := 0.66 + shift * 2.5 + jitter;
    IF prevlow THEN lowp := lowp + 0.06; END IF;
    -- long low streaks only slightly relax the odds (never a guaranteed high)
    IF lows >= 5 THEN lowp := lowp - 0.18;
    ELSIF lows >= 4 THEN lowp := lowp - 0.10;
    END IF;
    IF lowp > 0.90 THEN lowp := 0.90; END IF;
    IF lowp < 0.48 THEN lowp := 0.48; END IF;

    IF u < lowp THEN
      IF w < 0.55 THEN
        cp := 1.00;
      ELSE
        cp := floor((1.01 + v * 0.14) * 100.0) / 100.0;
      END IF;
    ELSE
      b2 := lowp + 0.96 * (1 - lowp);
      IF hi_recent >= 1 AND random() < 0.85 THEN b2 := 1.01; END IF;
      IF u < b2 THEN
        cp := floor((1.16 + v * 0.55) * 100.0) / 100.0;
      ELSE
        cp := floor((1.80 + v * 0.30) * 100.0) / 100.0;
      END IF;
    END IF;
    IF cp > 2.10 THEN cp := 2.10; END IF;
  END IF;

  IF cp < 1.01 THEN cp := 1.00; END IF;
  IF cp > 999.00 THEN cp := 999.00; END IF;

  INSERT INTO public.crash_rounds(server_seed_hash, nonce, status, betting_ends_at)
  VALUES (encode(extensions.digest(seed,'sha256'),'hex'), n, 'betting', now() + interval '10 seconds')
  RETURNING id INTO rid;
  INSERT INTO public.crash_round_secrets(round_id, server_seed, crash_point)
  VALUES (rid, seed, cp);
  RETURN rid;
END $$;