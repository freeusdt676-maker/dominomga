-- 1) Allow up to 2 showcase bot-only games to keep running
CREATE OR REPLACE FUNCTION public.purge_bot_only_games()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count int := 0;
BEGIN
  WITH bot_live AS (
    SELECT g.id, g.created_at
    FROM public.games g
    WHERE g.status = 'in_progress'
      AND public.is_virtual_player(g.player1_id)
      AND (g.player2_id IS NULL OR public.is_virtual_player(g.player2_id))
      AND (g.player3_id IS NULL OR public.is_virtual_player(g.player3_id))
  ), bad AS (
    SELECT id FROM bot_live ORDER BY created_at DESC OFFSET 2
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

-- 2) archive_old_games: allow short retention windows
CREATE OR REPLACE FUNCTION public.archive_old_games(_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cutoff timestamptz := now() - make_interval(days => GREATEST(_days, 1));
  n_dom int := 0; n_ludo int := 0; n_pet int := 0;
BEGIN
  WITH old AS (
    SELECT * FROM public.games
    WHERE status IN ('finished','cancelled')
      AND COALESCE(finished_at, updated_at, created_at) < cutoff
  ), ins AS (
    INSERT INTO public.games_archive (id, game_kind, ticket_number, player_ids, winner_id, stake, commission, status, finished_at, created_at, snapshot)
    SELECT o.id, 'domino', o.ticket_number,
           ARRAY(SELECT x FROM unnest(ARRAY[o.player1_id, o.player2_id, o.player3_id]) x WHERE x IS NOT NULL),
           o.winner_id, o.stake, o.commission, o.status::text,
           COALESCE(o.finished_at, o.updated_at), o.created_at,
           jsonb_build_object('game_mode', o.game_mode, 'players_count', o.players_count,
                              'score_p1', o.score_p1, 'score_p2', o.score_p2, 'score_p3', o.score_p3,
                              'round_number', o.round_number, 'last_reason', o.last_reason)
    FROM old o
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ), del_moves AS (
    DELETE FROM public.game_moves WHERE game_id IN (SELECT id FROM old)
  ), del_chat AS (
    DELETE FROM public.chat_messages WHERE game_id IN (SELECT id FROM old)
  ), del AS (
    DELETE FROM public.games WHERE id IN (SELECT id FROM old) RETURNING id
  )
  SELECT count(*) INTO n_dom FROM del;

  WITH old AS (
    SELECT * FROM public.ludo_games
    WHERE status IN ('finished','cancelled')
      AND COALESCE(finished_at, updated_at, created_at) < cutoff
  ), ins AS (
    INSERT INTO public.games_archive (id, game_kind, ticket_number, player_ids, winner_id, stake, commission, status, finished_at, created_at, snapshot)
    SELECT o.id, 'ludo', o.ticket_number,
           ARRAY(SELECT x FROM unnest(ARRAY[o.player1_id, o.player2_id, o.player3_id, o.player4_id]) x WHERE x IS NOT NULL),
           o.winner_id, o.stake, o.commission, o.status::text,
           COALESCE(o.finished_at, o.updated_at), o.created_at,
           jsonb_build_object('players_count', o.players_count, 'seat_assignment', o.seat_assignment)
    FROM old o
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ), del AS (
    DELETE FROM public.ludo_games WHERE id IN (SELECT id FROM old) RETURNING id
  )
  SELECT count(*) INTO n_ludo FROM del;

  WITH old AS (
    SELECT * FROM public.petanque_games
    WHERE status IN ('finished','cancelled')
      AND COALESCE(finished_at, updated_at, created_at) < cutoff
  ), ins AS (
    INSERT INTO public.games_archive (id, game_kind, ticket_number, player_ids, winner_id, stake, commission, status, finished_at, created_at, snapshot)
    SELECT o.id, 'petanque', o.ticket_number,
           ARRAY(SELECT x FROM unnest(ARRAY[o.player1_id, o.player2_id]) x WHERE x IS NOT NULL),
           o.winner_id, o.stake, o.commission, o.status::text,
           COALESCE(o.finished_at, o.updated_at), o.created_at,
           jsonb_build_object('score_p1', o.score_p1, 'score_p2', o.score_p2, 'round_number', o.round_number)
    FROM old o
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ), del AS (
    DELETE FROM public.petanque_games WHERE id IN (SELECT id FROM old) RETURNING id
  )
  SELECT count(*) INTO n_pet FROM del;

  RETURN jsonb_build_object('domino', n_dom, 'ludo', n_ludo, 'petanque', n_pet);
END;
$function$;

-- 3) cleanup_old_data: 3-day retention for ALL history, money untouched
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d3 timestamptz := now() - interval '3 days';
  d60 timestamptz := now() - interval '60 days';
  res jsonb := '{}'::jsonb;
  n int;
BEGIN
  DELETE FROM public.game_moves gm
  WHERE gm.created_at < d3
    AND NOT EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = gm.game_id AND g.status IN ('waiting','in_progress')
    );
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('game_moves', n);

  DELETE FROM public.crash_bets b
  USING public.crash_rounds r
  WHERE b.round_id = r.id AND r.created_at < d3 AND r.status = 'crashed';
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crash_bets', n);

  DELETE FROM public.crash_round_secrets s
  USING public.crash_rounds r
  WHERE s.round_id = r.id AND r.created_at < d3 AND r.status = 'crashed';
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crash_round_secrets', n);

  DELETE FROM public.crash_rounds r WHERE r.created_at < d3 AND r.status = 'crashed';
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crash_rounds', n);

  DELETE FROM public.crash_schedule cs WHERE cs.created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crash_schedule', n);

  DELETE FROM public.login_attempts WHERE created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('login_attempts', n);

  DELETE FROM public.rate_limits WHERE window_start < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('rate_limits', n);

  DELETE FROM public.chat_messages WHERE created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('chat_messages', n);

  DELETE FROM public.lobby_messages WHERE created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lobby_messages', n);

  DELETE FROM public.audit_log WHERE created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('audit_log', n);

  DELETE FROM public.game_audit WHERE created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('game_audit', n);

  DELETE FROM public.round_ledger WHERE created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('round_ledger', n);

  DELETE FROM public.games_archive WHERE archived_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('games_archive', n);

  -- processed transactions only (pending stay; wallets never touched)
  DELETE FROM public.transactions
  WHERE status IN ('approved','rejected','completed') AND created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('transactions', n);

  DELETE FROM public.fraud_alerts WHERE resolved AND created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('fraud_alerts', n);

  DELETE FROM public.push_subscriptions WHERE last_seen_at < d60;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('push_subscriptions', n);

  DELETE FROM public.password_reset_requests WHERE status <> 'pending' AND created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('password_reset_requests', n);

  DELETE FROM public.profile_change_requests WHERE status <> 'pending' AND created_at < d3;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('profile_change_requests', n);

  res := res || jsonb_build_object('archived', public.archive_old_games(3));

  INSERT INTO public.maintenance_log (details) VALUES (res);
  DELETE FROM public.maintenance_log WHERE ran_at < now() - interval '30 days';

  RETURN res;
END;
$function$;

-- 4) Indexes to keep lobby/admin queries fast under load
CREATE INDEX IF NOT EXISTS idx_games_status_created ON public.games (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ludo_games_status_created ON public.ludo_games (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_petanque_games_status_created ON public.petanque_games (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status_created ON public.transactions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON public.chat_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_moves_game_created ON public.game_moves (game_id, created_at DESC);