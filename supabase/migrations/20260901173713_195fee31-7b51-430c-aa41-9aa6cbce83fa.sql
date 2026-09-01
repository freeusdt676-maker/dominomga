CREATE OR REPLACE FUNCTION public.purge_bot_only_games()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count int := 0;
BEGIN
  WITH bot_live AS (
    SELECT g.id, g.created_at, COALESCE(g.players_count, 2) AS pc
    FROM public.games g
    WHERE g.status = 'in_progress'
      AND public.is_virtual_player(g.player1_id)
      AND (g.player2_id IS NULL OR public.is_virtual_player(g.player2_id))
      AND (g.player3_id IS NULL OR public.is_virtual_player(g.player3_id))
  ), ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY pc ORDER BY created_at DESC) AS rn
    FROM bot_live
  ), bad AS (
    SELECT id FROM ranked WHERE rn > 1
  ), upd AS (
    UPDATE public.games g
       SET status = 'cancelled', last_reason = 'bot_only_no_real_player', updated_at = now(), finished_at = now()
      FROM bad WHERE g.id = bad.id
    RETURNING g.id
  )
  SELECT COUNT(*)::int INTO v_count FROM upd;
  RETURN v_count;
END;
$function$;