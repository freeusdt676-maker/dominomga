-- Matchmaking queue: lookups by mode/players/stake
CREATE INDEX IF NOT EXISTS idx_mmq_mode_players_stake ON public.matchmaking_queue (game_mode, players_count, stake, created_at);
CREATE INDEX IF NOT EXISTS idx_mmq_created ON public.matchmaking_queue (created_at);

-- Lobby chat: newest-first pagination
CREATE INDEX IF NOT EXISTS idx_lobby_messages_created ON public.lobby_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lobby_messages_sender ON public.lobby_messages (sender_id, created_at DESC);

-- Petanque games: player + status lookups (mirror of domino/ludo)
CREATE INDEX IF NOT EXISTS idx_pet_p1_status ON public.petanque_games (player1_id, status);
CREATE INDEX IF NOT EXISTS idx_pet_p2_status ON public.petanque_games (player2_id, status);
CREATE INDEX IF NOT EXISTS idx_pet_status_created ON public.petanque_games (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_status_finished ON public.petanque_games (status, finished_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_ticket ON public.petanque_games (ticket_number) WHERE ticket_number IS NOT NULL;

-- Ludo: finished-at history
CREATE INDEX IF NOT EXISTS idx_ludo_status_finished ON public.ludo_games (status, finished_at DESC);

-- Challenges: outgoing lookups + cleanup by expiry
CREATE INDEX IF NOT EXISTS idx_challenges_from_status ON public.challenges (from_user, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_challenges_expires ON public.challenges (expires_at) WHERE status = 'pending';

-- Tournaments
CREATE INDEX IF NOT EXISTS idx_tourn_regs_user ON public.tournament_registrations (user_id, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_tourn_regs_active ON public.tournament_registrations (tournament_id, group_letter, slot) WHERE cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tourn_match_sched ON public.tournament_matches (scheduled_at) WHERE winner_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_tourn_match_players ON public.tournament_matches (player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status_week ON public.tournaments (status, week_start DESC);

-- Security / auth throttling
CREATE INDEX IF NOT EXISTS idx_login_attempts_phone_created ON public.login_attempts (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits (window_start);

-- Crash: hot path (active round + open bets)
CREATE INDEX IF NOT EXISTS idx_crash_rounds_status_no ON public.crash_rounds (status, round_no DESC);
CREATE INDEX IF NOT EXISTS idx_crash_bets_round_status ON public.crash_bets (round_id, status) WHERE status = 'active';

-- Moves / audit / ledger read paths
CREATE INDEX IF NOT EXISTS idx_game_moves_player_created ON public.game_moves (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_audit_created ON public.game_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_ledger_game ON public.round_ledger (game_kind, game_id, round_number);

-- Profile change requests / password recovery admin queues
CREATE INDEX IF NOT EXISTS idx_pcr_status_created ON public.profile_change_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prr_status_created ON public.password_reset_requests (status, created_at DESC);

-- Consolidate the three per-minute tournament jobs into one
SELECT cron.unschedule('tournament-advance-every-minute');
SELECT cron.unschedule('tournament-notify-every-minute');
SELECT cron.unschedule('tournament-forfeit-every-minute');
SELECT cron.schedule('tournament-maintenance-every-minute', '* * * * *', $$
  SELECT public.tournament_advance(NULL);
  SELECT public.tournament_notify_phase();
  SELECT public.tournament_check_forfeit();
$$);

ANALYZE public.games;
ANALYZE public.ludo_games;
ANALYZE public.petanque_games;
ANALYZE public.crash_rounds;
ANALYZE public.crash_bets;
ANALYZE public.matchmaking_queue;
ANALYZE public.tournament_registrations;