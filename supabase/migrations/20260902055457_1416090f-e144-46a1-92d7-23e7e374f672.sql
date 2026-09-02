CREATE OR REPLACE FUNCTION public.bots_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT value = 'true' FROM public.app_internal_config WHERE key = 'bots_enabled'), true);
$$;

GRANT EXECUTE ON FUNCTION public.bots_enabled() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_bots_enabled(_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_offline int := 0; v_rooms int := 0; v_demo int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  INSERT INTO public.app_internal_config (key, value, updated_at)
  VALUES ('bots_enabled', CASE WHEN _enabled THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  IF NOT _enabled THEN
    -- 1) Salles en attente créées par des bots (aucun vrai joueur dedans)
    WITH bad AS (
      SELECT g.id FROM public.games g
      WHERE g.status = 'waiting'
        AND public.is_virtual_player(g.player1_id)
        AND (g.player2_id IS NULL OR public.is_virtual_player(g.player2_id))
        AND (g.player3_id IS NULL OR public.is_virtual_player(g.player3_id))
    ), upd AS (
      UPDATE public.games g SET status = 'cancelled', last_reason = 'bots_disabled',
             updated_at = now(), finished_at = now()
      FROM bad WHERE g.id = bad.id RETURNING g.id
    )
    SELECT COUNT(*)::int INTO v_rooms FROM upd;

    -- 2) Parties DEMO 100% bots (aucun argent réel engagé)
    WITH bad AS (
      SELECT g.id FROM public.games g
      WHERE g.status = 'in_progress'
        AND public.is_virtual_player(g.player1_id)
        AND (g.player2_id IS NULL OR public.is_virtual_player(g.player2_id))
        AND (g.player3_id IS NULL OR public.is_virtual_player(g.player3_id))
    ), upd AS (
      UPDATE public.games g SET status = 'cancelled', last_reason = 'bots_disabled',
             updated_at = now(), finished_at = now()
      FROM bad WHERE g.id = bad.id RETURNING g.id
    )
    SELECT COUNT(*)::int INTO v_demo FROM upd;

    -- 3) File d'attente matchmaking des bots
    DELETE FROM public.matchmaking_queue q WHERE public.is_virtual_player(q.user_id);

    -- 4) Tous les bots hors ligne
    WITH upd AS (
      UPDATE public.virtual_players SET online = false, online_until = NULL, updated_at = now()
      WHERE online RETURNING user_id
    )
    SELECT COUNT(*)::int INTO v_offline FROM upd;

    UPDATE public.profiles p SET is_online = false, updated_at = now()
    WHERE public.is_virtual_player(p.user_id) AND COALESCE(p.is_online, false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'enabled', _enabled,
    'rooms_cancelled', v_rooms, 'demo_cancelled', v_demo, 'set_offline', v_offline);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_bots_enabled(boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.virtual_online_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.bots_enabled()
    THEN (SELECT COUNT(*)::int FROM public.virtual_players WHERE active AND online)
    ELSE 0 END;
$$;