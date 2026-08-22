-- 1) Withdrawal hold: debit immediately on request
CREATE OR REPLACE FUNCTION public.withdraw_request(_amount numeric, _phone text, _label text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cur numeric; uid uuid := auth.uid(); tid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount IS NULL OR _amount < 1000 THEN RAISE EXCEPTION 'min_1000'; END IF;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE user_id = uid AND status = 'pending' AND type IN ('deposit','withdrawal')) THEN
    RAISE EXCEPTION 'pending_exists';
  END IF;
  PERFORM public.allow_wallet_mutation();
  SELECT balance INTO cur FROM public.wallets WHERE user_id = uid FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'no_wallet'; END IF;
  IF cur < _amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE public.wallets SET balance = cur - _amount, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.transactions(user_id, type, amount, status, mvola_phone, mvola_reference)
  VALUES (uid, 'withdrawal', _amount, 'pending', _phone, _label)
  RETURNING id INTO tid;
  RETURN jsonb_build_object('ok', true, 'tx_id', tid);
END $function$;

GRANT EXECUTE ON FUNCTION public.withdraw_request(numeric, text, text) TO authenticated;

-- 2) Approve: withdrawal already debited at request time -> do not debit twice
CREATE OR REPLACE FUNCTION public.admin_approve_tx(_tx_id uuid, _admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE t RECORD; cur numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _admin_id := auth.uid();
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO t FROM public.transactions WHERE id = _tx_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tx_not_found_or_not_pending'; END IF;
  SELECT balance INTO cur FROM public.wallets WHERE user_id = t.user_id FOR UPDATE;
  IF cur IS NULL THEN INSERT INTO public.wallets(user_id, balance) VALUES (t.user_id, 0); cur := 0; END IF;

  IF t.type = 'deposit' THEN
    UPDATE public.wallets SET balance = cur + t.amount, updated_at = now() WHERE user_id = t.user_id;
  ELSIF t.type = 'withdrawal' THEN
    -- funds were already held (debited) when the request was created: nothing to do
    NULL;
  ELSE RAISE EXCEPTION 'invalid_tx_type'; END IF;

  UPDATE public.transactions SET status='approved', processed_by=_admin_id, processed_at=now() WHERE id=t.id;
  INSERT INTO public.chat_messages(sender_id, recipient_id, content, is_admin_broadcast)
  VALUES (_admin_id, t.user_id,
    CASE WHEN t.type = 'deposit' THEN 'Dépôt ' ELSE 'Retrait ' END || t.amount::text || ' Ar nankatoavina ✓', false);
  RETURN jsonb_build_object('ok', true);
END $function$;

-- 3) Reject: refund a held withdrawal
CREATE OR REPLACE FUNCTION public.admin_reject_tx(_tx_id uuid, _admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE t RECORD; cur numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _admin_id := auth.uid();
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO t FROM public.transactions WHERE id = _tx_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tx_not_found_or_not_pending'; END IF;

  IF t.type = 'withdrawal' THEN
    SELECT balance INTO cur FROM public.wallets WHERE user_id = t.user_id FOR UPDATE;
    IF cur IS NULL THEN INSERT INTO public.wallets(user_id, balance) VALUES (t.user_id, t.amount);
    ELSE UPDATE public.wallets SET balance = cur + t.amount, updated_at = now() WHERE user_id = t.user_id; END IF;
  END IF;

  UPDATE public.transactions
    SET status = 'rejected', processed_by = _admin_id, processed_at = now()
    WHERE id = t.id;

  INSERT INTO public.chat_messages(sender_id, recipient_id, content, is_admin_broadcast)
  VALUES (_admin_id, t.user_id,
    CASE WHEN t.type = 'deposit' THEN 'Dépôt ' ELSE 'Retrait ' END || t.amount::text ||
    CASE WHEN t.type = 'withdrawal' THEN ' Ar tsy nekena — naverina ao amin''ny wallet ny vola.' ELSE ' Ar tsy nekena. Mba hamarino ny mombamomba ny transaction ataonao.' END,
    false);
  RETURN jsonb_build_object('ok', true);
END $function$;

-- 4) Auto-refund withdrawals not validated within 1 hour
CREATE OR REPLACE FUNCTION public.expire_stale_withdrawals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE t RECORD; n int := 0;
BEGIN
  PERFORM public.allow_wallet_mutation();
  FOR t IN
    SELECT * FROM public.transactions
    WHERE type = 'withdrawal' AND status = 'pending' AND created_at < now() - interval '1 hour'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.wallets SET balance = balance + t.amount, updated_at = now() WHERE user_id = t.user_id;
    UPDATE public.transactions
      SET status = 'rejected', processed_at = now(),
          admin_note = COALESCE(admin_note,'') || ' [auto-refund 1h]'
      WHERE id = t.id;
    INSERT INTO public.chat_messages(sender_id, recipient_id, content, is_admin_broadcast)
    VALUES (t.user_id, t.user_id,
      'Retrait ' || t.amount::text || ' Ar tsy voamarina nandritra ny 1 ora — naverina ao amin''ny wallet ny vola.', false);
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$;

SELECT cron.schedule('withdraw-expire-1h', '* * * * *', $$SELECT public.expire_stale_withdrawals();$$);

-- 5) Crash: hard cap at x25
CREATE OR REPLACE FUNCTION public.crash_new_round()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF public.crash_schedule_hit(1000, nxt, 100, 500) THEN slo := 20; shi := 25;
  ELSIF public.crash_schedule_hit(100, nxt, 60, 70) THEN slo := 16; shi := 22;
  ELSIF public.crash_schedule_hit(50, nxt, 40, 45) THEN slo := 12; shi := 18;
  ELSIF public.crash_schedule_hit(30, nxt, 22, 25) THEN slo := 9; shi := 14;
  ELSIF public.crash_schedule_hit(20, nxt, 14, 17) THEN slo := 6; shi := 9;
  ELSIF public.crash_schedule_hit(10, nxt, 6, 8) THEN slo := 3; shi := 5;
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

    jitter := (random() - 0.5) * 0.16;
    lowp := 0.66 + shift * 2.5 + jitter;
    IF prevlow THEN lowp := lowp + 0.06; END IF;
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
  IF cp > 25.00 THEN cp := 25.00; END IF;

  INSERT INTO public.crash_rounds(server_seed_hash, nonce, status, betting_ends_at)
  VALUES (encode(extensions.digest(seed,'sha256'),'hex'), n, 'betting', now() + interval '10 seconds')
  RETURNING id INTO rid;
  INSERT INTO public.crash_round_secrets(round_id, server_seed, crash_point)
  VALUES (rid, seed, cp);
  RETURN rid;
END $function$;