CREATE OR REPLACE FUNCTION public.virtual_online_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.virtual_players WHERE active AND online;
$$;

GRANT EXECUTE ON FUNCTION public.virtual_online_count() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_bot_only_games()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int := 0;
BEGIN
  WITH bad AS (
    SELECT g.id
    FROM public.games g
    WHERE g.status = 'in_progress'
      AND public.is_virtual_player(g.player1_id)
      AND (g.player2_id IS NULL OR public.is_virtual_player(g.player2_id))
      AND (g.player3_id IS NULL OR public.is_virtual_player(g.player3_id))
  ), upd AS (
    UPDATE public.games g
       SET status = 'cancelled', last_reason = 'bot_only_no_real_player', updated_at = now(), finished_at = now()
      FROM bad WHERE g.id = bad.id
    RETURNING g.id
  )
  SELECT COUNT(*)::int INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_bot_only_games() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_bot_only_games() TO service_role;