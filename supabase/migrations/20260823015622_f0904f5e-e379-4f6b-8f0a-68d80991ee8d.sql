CREATE OR REPLACE FUNCTION public.tournament_register(_game_type text, _nom text, _tel text, _id_card text, _pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); tid uuid; t public.tournaments%ROWTYPE; current_count int;
        gl text; sl smallint; bal numeric; profile_pin text; fee numeric := 1000;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF coalesce(trim(_nom),'')='' OR coalesce(trim(_tel),'')='' OR coalesce(trim(_id_card),'')='' THEN
    RAISE EXCEPTION 'fields_required'; END IF;
  SELECT pin_plain INTO profile_pin FROM public.profiles WHERE user_id = uid;
  IF profile_pin IS NULL OR profile_pin = '' THEN RAISE EXCEPTION 'pin_not_set'; END IF;
  IF _pin <> profile_pin THEN RAISE EXCEPTION 'pin_diso'; END IF;
  tid := public.tournament_ensure_current(_game_type);
  PERFORM pg_advisory_xact_lock(hashtextextended('tourn_reg:'||tid::text, 0));
  SELECT * INTO t FROM public.tournaments WHERE id = tid FOR UPDATE;
  IF t.status <> 'registration' THEN RAISE EXCEPTION 'registration_closed'; END IF;
  IF now() >= t.reg_close THEN RAISE EXCEPTION 'registration_closed_time'; END IF;
  SELECT count(*) INTO current_count FROM public.tournament_registrations
    WHERE tournament_id = tid AND cancelled_at IS NULL;
  IF current_count >= 8 THEN RAISE EXCEPTION 'tournament_full'; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_registrations
             WHERE tournament_id = tid AND user_id = uid AND cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'already_registered'; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_registrations
             WHERE tournament_id = tid AND lower(trim(id_card)) = lower(trim(_id_card)) AND cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'id_card_already_used'; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_matches tm
             WHERE (tm.player1_id = uid OR tm.player2_id = uid)
               AND tm.winner_id IS NULL AND tm.game_id IS NOT NULL) THEN
    RAISE EXCEPTION 'has_active_tournament_match'; END IF;
  gl := CASE WHEN current_count<2 THEN 'A' WHEN current_count<4 THEN 'B' WHEN current_count<6 THEN 'C' ELSE 'D' END;
  sl := (current_count % 2) + 1;
  PERFORM public.allow_wallet_mutation();
  SELECT balance INTO bal FROM public.wallets WHERE user_id = uid FOR UPDATE;
  IF bal IS NULL OR bal < fee THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE public.wallets SET balance = balance - fee, updated_at = now() WHERE user_id = uid;
  INSERT INTO public.transactions(user_id, type, amount, status, admin_note)
  VALUES (uid, 'game_stake', fee, 'completed', 'Tournoi '||_game_type||' — inscription');
  INSERT INTO public.tournament_registrations(tournament_id, user_id, nom, tel, id_card, paid_amount, group_letter, slot)
  VALUES (tid, uid, trim(_nom), trim(_tel), trim(_id_card), fee, gl, sl);
  UPDATE public.tournaments SET total_collected = total_collected + fee, updated_at = now() WHERE id = tid;
  INSERT INTO public.audit_log(user_id, action, meta)
  VALUES (uid, 'tournament_register', jsonb_build_object('tournament_id', tid, 'game_type', _game_type, 'group', gl, 'slot', sl));
  RETURN jsonb_build_object('ok', true, 'group', gl, 'slot', sl);
END $function$;

ALTER TABLE public.tournament_registrations ALTER COLUMN paid_amount SET DEFAULT 1000;

CREATE OR REPLACE FUNCTION public.tournament_settle_prizes(_tid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.tournaments%ROWTYPE;
  champion uuid; runner_up uuid;
  final_m RECORD; admin_user uuid;
  pot numeric; p1 numeric; p2 numeric; pa numeric;
BEGIN
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO t FROM public.tournaments WHERE id = _tid FOR UPDATE;
  IF t.status <> 'running' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  SELECT * INTO final_m FROM public.tournament_matches WHERE tournament_id = _tid AND round='final' AND match_index=1;
  IF final_m IS NULL OR final_m.winner_id IS NULL THEN RAISE EXCEPTION 'final_not_done'; END IF;

  champion := final_m.winner_id;
  runner_up := CASE WHEN final_m.player1_id = champion THEN final_m.player2_id ELSE final_m.player1_id END;

  pot := COALESCE(t.total_collected, 0);
  p1 := round(pot * 0.75);
  p2 := round(pot * 0.15);
  pa := pot - p1 - p2;

  UPDATE public.wallets SET balance = balance + p1, updated_at = now() WHERE user_id = champion;
  INSERT INTO public.transactions(user_id, type, amount, status, admin_note)
  VALUES (champion, 'game_win', p1, 'completed', 'Tournoi du Semaine — Champion');

  UPDATE public.wallets SET balance = balance + p2, updated_at = now() WHERE user_id = runner_up;
  INSERT INTO public.transactions(user_id, type, amount, status, admin_note)
  VALUES (runner_up, 'game_win', p2, 'completed', 'Tournoi du Semaine — 2ème place');

  SELECT user_id INTO admin_user FROM public.user_roles WHERE role='admin' ORDER BY created_at ASC LIMIT 1;
  IF admin_user IS NOT NULL AND pa > 0 THEN
    INSERT INTO public.admin_wallets(admin_id, balance) VALUES (admin_user, pa)
    ON CONFLICT (admin_id) DO UPDATE SET balance = admin_wallets.balance + pa, updated_at = now();
  END IF;

  UPDATE public.tournaments
    SET status = 'finished', winner_id = champion, runner_up_id = runner_up,
        settled_at = now(), updated_at = now()
    WHERE id = _tid;

  INSERT INTO public.chat_messages(sender_id, recipient_id, content, is_admin_broadcast)
  VALUES (admin_user, champion, '🏆 Mpandresy Tournoi du Semaine! Loka '||to_char(p1,'FM999G999')||' Ar tafiditra ao amin''ny solde.', false);
  INSERT INTO public.chat_messages(sender_id, recipient_id, content, is_admin_broadcast)
  VALUES (admin_user, runner_up, '🥈 Faharoa amin''ny Tournoi du Semaine! Loka '||to_char(p2,'FM999G999')||' Ar tafiditra ao amin''ny solde.', false);

  RETURN jsonb_build_object('ok', true, 'champion', champion, 'runner_up', runner_up);
END $function$;

CREATE OR REPLACE FUNCTION public.tournament_admin_cancel_registration(_reg_id uuid, _pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  r RECORD;
  t public.tournaments%ROWTYPE;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO r FROM public.tournament_registrations WHERE id = _reg_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reg_not_found'; END IF;
  IF r.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'already_cancelled'; END IF;

  SELECT * INTO t FROM public.tournaments WHERE id = r.tournament_id FOR UPDATE;
  IF t.status IN ('finished','cancelled') THEN RAISE EXCEPTION 'tournament_closed'; END IF;

  PERFORM public.allow_wallet_mutation();
  UPDATE public.wallets SET balance = balance + r.paid_amount, updated_at = now() WHERE user_id = r.user_id;
  INSERT INTO public.transactions(user_id, type, amount, status, admin_note, processed_at, processed_by)
  VALUES (r.user_id, 'deposit', r.paid_amount, 'approved', 'Tournoi - annulation admin', now(), uid);

  UPDATE public.tournament_registrations SET cancelled_at = now(), cancelled_by = uid WHERE id = _reg_id;
  UPDATE public.tournaments SET total_collected = GREATEST(0, total_collected - r.paid_amount), updated_at = now()
    WHERE id = r.tournament_id;

  INSERT INTO public.chat_messages(sender_id, recipient_id, content, is_admin_broadcast)
  VALUES (uid, r.user_id, 'Voafoana ny fisoratanao anarana amin''ny Tournoi du Semaine. Naverina ny '||to_char(r.paid_amount,'FM999G999')||' Ar.', false);

  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.tournament_notify_phase()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t RECORD; admin_id uuid; sent int := 0; msg_reg text; msg_qf text; already jsonb;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY created_at LIMIT 1;
  IF admin_id IS NULL THEN RETURN jsonb_build_object('ok', true, 'no_admin', true); END IF;
  FOR t IN SELECT * FROM public.tournaments WHERE status IN ('registration','running') LOOP
    already := COALESCE(t.notified_phases, '{}'::jsonb);
    IF (already->>'reg_close_60') IS NULL
       AND now() >= t.reg_close - interval '60 minutes' AND now() < t.reg_close THEN
      msg_reg := format('⏰ Tornoi %s — Mikatona ato anatin''ny 1h ny inscription! (Mise: 1 000 Ar)', upper(t.game_type::text));
      INSERT INTO public.chat_messages(sender_id, recipient_id, content, is_admin_broadcast)
      SELECT admin_id, r.user_id, msg_reg, false
      FROM public.tournament_registrations r
      WHERE r.tournament_id = t.id AND r.cancelled_at IS NULL;
      UPDATE public.tournaments SET notified_phases = notified_phases || jsonb_build_object('reg_close_60', now()) WHERE id = t.id;
      sent := sent + 1;
    END IF;
    IF (already->>'qf_10') IS NULL
       AND now() >= t.qf_at - interval '10 minutes' AND now() < t.qf_at THEN
      msg_qf := format('🏆 Tornoi %s — Hanomboka ato anatin''ny 10mn! Mafofona automatique ao anaty table du jeu ianao.', upper(t.game_type::text));
      INSERT INTO public.chat_messages(sender_id, recipient_id, content, is_admin_broadcast)
      SELECT admin_id, r.user_id, msg_qf, false
      FROM public.tournament_registrations r
      WHERE r.tournament_id = t.id AND r.cancelled_at IS NULL;
      UPDATE public.tournaments SET notified_phases = notified_phases || jsonb_build_object('qf_10', now()) WHERE id = t.id;
      sent := sent + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'sent', sent);
END $function$;