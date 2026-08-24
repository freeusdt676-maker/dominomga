-- 1. Archive table for finished games
CREATE TABLE IF NOT EXISTS public.games_archive (
  id uuid PRIMARY KEY,
  game_kind text NOT NULL,
  ticket_number text,
  player_ids uuid[] NOT NULL DEFAULT '{}',
  winner_id uuid,
  stake numeric NOT NULL DEFAULT 0,
  commission numeric NOT NULL DEFAULT 0,
  status text NOT NULL,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.games_archive TO authenticated;
GRANT ALL ON public.games_archive TO service_role;
ALTER TABLE public.games_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read archive" ON public.games_archive;
CREATE POLICY "admins read archive" ON public.games_archive
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_games_archive_kind_finished ON public.games_archive(game_kind, finished_at DESC);

-- 2. Maintenance log
CREATE TABLE IF NOT EXISTS public.maintenance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.maintenance_log TO authenticated;
GRANT ALL ON public.maintenance_log TO service_role;
ALTER TABLE public.maintenance_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read maintenance" ON public.maintenance_log;
CREATE POLICY "admins read maintenance" ON public.maintenance_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- helpful indexes for the retention scans
CREATE INDEX IF NOT EXISTS idx_game_moves_created_at ON public.game_moves(created_at);
CREATE INDEX IF NOT EXISTS idx_crash_rounds_created_at ON public.crash_rounds(created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON public.login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_games_status_finished_at ON public.games(status, finished_at);

-- 3. Archive games older than 90 days (finished/cancelled only)
CREATE OR REPLACE FUNCTION public.archive_old_games(_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => GREATEST(_days, 30));
  n_dom int := 0; n_ludo int := 0; n_pet int := 0;
BEGIN
  -- DOMINO
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

  -- LUDO
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

  -- PETANQUE
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
$$;

-- 4. Main cleanup routine
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d30 timestamptz := now() - interval '30 days';
  d60 timestamptz := now() - interval '60 days';
  d90 timestamptz := now() - interval '90 days';
  res jsonb := '{}'::jsonb;
  n int;
BEGIN
  -- game logs (moves) older than 30 days, only for games that are no longer active
  DELETE FROM public.game_moves gm
  WHERE gm.created_at < d30
    AND NOT EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = gm.game_id AND g.status IN ('waiting','in_progress')
    );
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('game_moves', n);

  -- crash history older than 30 days (keep active/pending rounds)
  DELETE FROM public.crash_bets b
  USING public.crash_rounds r
  WHERE b.round_id = r.id AND r.created_at < d30 AND r.status = 'crashed';
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crash_bets', n);

  DELETE FROM public.crash_round_secrets s
  USING public.crash_rounds r
  WHERE s.round_id = r.id AND r.created_at < d30 AND r.status = 'crashed';
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crash_round_secrets', n);

  DELETE FROM public.crash_rounds r
  WHERE r.created_at < d30 AND r.status = 'crashed';
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crash_rounds', n);

  DELETE FROM public.crash_schedule cs WHERE cs.created_at < d30;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crash_schedule', n);

  -- security / rate limiting noise
  DELETE FROM public.login_attempts WHERE created_at < d30;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('login_attempts', n);

  DELETE FROM public.rate_limits WHERE window_start < d30;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('rate_limits', n);

  -- messages
  DELETE FROM public.chat_messages WHERE created_at < d30;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('chat_messages', n);

  DELETE FROM public.lobby_messages WHERE created_at < interval '7 days' + '-infinity'::timestamptz
     OR created_at < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lobby_messages', n);

  -- audit trails older than 90 days
  DELETE FROM public.audit_log WHERE created_at < d90;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('audit_log', n);

  DELETE FROM public.game_audit WHERE created_at < d90;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('game_audit', n);

  DELETE FROM public.fraud_alerts WHERE resolved AND created_at < d90;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('fraud_alerts', n);

  -- stale push subscriptions
  DELETE FROM public.push_subscriptions WHERE last_seen_at < d60;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('push_subscriptions', n);

  -- processed recovery / profile change requests older than 90 days
  DELETE FROM public.password_reset_requests WHERE status <> 'pending' AND created_at < d90;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('password_reset_requests', n);

  DELETE FROM public.profile_change_requests WHERE status <> 'pending' AND created_at < d90;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('profile_change_requests', n);

  -- archive finished games older than 90 days
  res := res || jsonb_build_object('archived', public.archive_old_games(90));

  INSERT INTO public.maintenance_log (details) VALUES (res);
  DELETE FROM public.maintenance_log WHERE ran_at < d90;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_data() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_old_games(integer) FROM public, anon, authenticated;

-- 5. Schedule: every 6 hours
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-old-data';
SELECT cron.schedule('cleanup-old-data', '17 */6 * * *', $$SELECT public.cleanup_old_data();$$);
