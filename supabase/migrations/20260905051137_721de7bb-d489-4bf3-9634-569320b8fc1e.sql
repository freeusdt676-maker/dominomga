
-- Admin-only combined bot config reader
CREATE OR REPLACE FUNCTION public.admin_bot_config()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.has_role(auth.uid(), 'admin') THEN jsonb_build_object(
    'enabled', COALESCE((SELECT value = 'true' FROM public.app_internal_config WHERE key = 'bots_enabled'), true),
    'skill', COALESCE((SELECT value::int FROM public.app_internal_config WHERE key = 'bot_skill'), 80)
  ) ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.admin_bot_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bot_config() TO authenticated, service_role;

-- Hide internal bot/maintenance helpers from players
REVOKE ALL ON FUNCTION public.bots_enabled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_virtual_player(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_bot_only_games() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.domino_guard_instant_win() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_withdrawals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bots_enabled() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_virtual_player(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_bot_only_games() TO service_role;
GRANT EXECUTE ON FUNCTION public.domino_guard_instant_win() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_withdrawals() TO service_role;

-- Admin-only listing stays admin-only, and never reachable by signed-out visitors
REVOKE ALL ON FUNCTION public.admin_list_virtual_players() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_virtual_players() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_bot_skill(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_bot_skill(integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_bots_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_bots_enabled(boolean) TO authenticated, service_role;

-- Defense in depth on the bot registry table
REVOKE ALL ON public.virtual_players FROM anon;
GRANT SELECT ON public.virtual_players TO authenticated;
GRANT ALL ON public.virtual_players TO service_role;
