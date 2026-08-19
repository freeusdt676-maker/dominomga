-- 1) Admin RPCs: verify the actual caller is an admin (no more caller-supplied admin id trust)
DO $do$
DECLARE r record; d text; p int; guard text;
BEGIN
  guard := E'\n  -- __admin_guard__\n  IF NOT public.has_role(auth.uid(), ''admin''::public.app_role) THEN RAISE EXCEPTION ''forbidden''; END IF;\n  _admin_id := auth.uid();\n';
  FOR r IN
    SELECT pr.oid FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
      JOIN pg_language l ON l.oid = pr.prolang
    WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
      AND pg_get_function_identity_arguments(pr.oid) ILIKE '%_admin_id%'
  LOOP
    d := pg_get_functiondef(r.oid);
    IF position('__admin_guard__' in d) > 0 THEN CONTINUE; END IF;
    p := position(E'\nBEGIN' in d);
    IF p = 0 THEN RAISE EXCEPTION 'no BEGIN found for %', r.oid::regprocedure; END IF;
    d := left(d, p + 5) || guard || substr(d, p + 6);
    EXECUTE d;
  END LOOP;
END $do$;

-- 2) profiles: remove blanket read access, expose a safe public view instead
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT user_id, mvola_name, avatar_url, selfie_url, is_online, last_seen,
         player_number, account_status, public.mask_phone(phone) AS phone_masked
  FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated;

-- 3) tournament_registrations: only own registration or admins
DROP POLICY IF EXISTS "Regs visible" ON public.tournament_registrations;
CREATE POLICY tr_select_own_or_admin ON public.tournament_registrations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- tournament payload: hide phone / ID card from non-admins
CREATE OR REPLACE FUNCTION public.tournament_get_current(_game_type text DEFAULT 'domino'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE tid uuid; t public.tournaments%ROWTYPE; regs jsonb; matches jsonb; cnt int; is_adm boolean;
BEGIN
  is_adm := public.has_role(auth.uid(), 'admin');
  tid := public.tournament_ensure_current(_game_type);
  SELECT * INTO t FROM public.tournaments WHERE id = tid;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'user_id', r.user_id, 'nom', r.nom,
    'tel', CASE WHEN is_adm OR r.user_id = auth.uid() THEN r.tel ELSE public.mask_phone(r.tel) END,
    'id_card', CASE WHEN is_adm OR r.user_id = auth.uid() THEN r.id_card ELSE '••••' END,
    'paid_amount', r.paid_amount, 'group_letter', r.group_letter, 'slot', r.slot,
    'registered_at', r.registered_at
  ) ORDER BY r.registered_at), '[]'::jsonb) INTO regs
  FROM public.tournament_registrations r
  WHERE r.tournament_id = tid AND r.cancelled_at IS NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id, 'round', m.round, 'match_index', m.match_index,
    'player1_id', m.player1_id, 'player2_id', m.player2_id,
    'winner_id', m.winner_id, 'game_id', m.game_id,
    'scheduled_at', m.scheduled_at, 'started_at', m.started_at, 'finished_at', m.finished_at
  ) ORDER BY m.round, m.match_index), '[]'::jsonb) INTO matches
  FROM public.tournament_matches m WHERE m.tournament_id = tid;
  cnt := jsonb_array_length(regs);
  RETURN jsonb_build_object('tournament', to_jsonb(t), 'registrations', regs, 'matches', matches, 'count', cnt);
END $function$;

-- 4) ludo_games: spectators only see live games
DROP POLICY IF EXISTS ludo_games_select_spectator ON public.ludo_games;
CREATE POLICY ludo_games_select_spectator ON public.ludo_games
  FOR SELECT TO authenticated
  USING (status = 'in_progress'::game_status);

-- 5) matchmaking_queue: own entries or admins only
DROP POLICY IF EXISTS mq_select_all_auth ON public.matchmaking_queue;
CREATE POLICY mq_select_own_or_admin ON public.matchmaking_queue
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 6) fixed search_path on remaining helper functions
ALTER FUNCTION public.crash_duration(numeric) SET search_path = public;
ALTER FUNCTION public.crash_mult_at(numeric) SET search_path = public;