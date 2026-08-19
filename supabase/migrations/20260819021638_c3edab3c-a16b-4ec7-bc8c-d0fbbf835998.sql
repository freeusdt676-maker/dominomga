CREATE TABLE IF NOT EXISTS public.round_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_kind text NOT NULL,
  game_id uuid NOT NULL,
  ticket_number text,
  round_number integer NOT NULL DEFAULT 1,
  player_id uuid NOT NULL,
  points numeric NOT NULL DEFAULT 0,
  cumulative numeric NOT NULL DEFAULT 0,
  stake numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  is_final boolean NOT NULL DEFAULT false,
  is_winner boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (game_kind, game_id, round_number, player_id)
);

GRANT SELECT ON public.round_ledger TO authenticated;
GRANT ALL ON public.round_ledger TO service_role;

ALTER TABLE public.round_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "round_ledger_select_own" ON public.round_ledger;
CREATE POLICY "round_ledger_select_own" ON public.round_ledger
  FOR SELECT TO authenticated
  USING (player_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_round_ledger_player ON public.round_ledger (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_ledger_game ON public.round_ledger (game_kind, game_id, round_number);

CREATE OR REPLACE FUNCTION public.rl_payout(_stake numeric, _players integer, _is_winner boolean)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _is_winner THEN (round(coalesce(_stake,0) * 0.9) * greatest(coalesce(_players,2),1)) - coalesce(_stake,0)
    ELSE -coalesce(_stake,0)
  END;
$$;

CREATE OR REPLACE FUNCTION public.log_domino_round()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final boolean := (NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished');
  v_round integer := coalesce(OLD.round_number, 1);
  v_pc integer := coalesce(NEW.players_count, 2);
BEGIN
  IF NOT v_final AND NEW.round_number IS NOT DISTINCT FROM OLD.round_number THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.round_ledger (game_kind, game_id, ticket_number, round_number, player_id, points, cumulative, stake, amount, is_final, is_winner, reason)
  SELECT 'domino', NEW.id, NEW.ticket_number, v_round, p.pid,
         p.new_score - p.old_score, p.new_score, NEW.stake,
         CASE WHEN v_final THEN public.rl_payout(NEW.stake, v_pc, p.pid = NEW.winner_id) ELSE 0 END,
         v_final, v_final AND p.pid = NEW.winner_id, NEW.last_reason
  FROM (
    VALUES
      (NEW.player1_id, coalesce(OLD.score_p1,0), coalesce(NEW.score_p1,0)),
      (NEW.player2_id, coalesce(OLD.score_p2,0), coalesce(NEW.score_p2,0)),
      (NEW.player3_id, coalesce(OLD.score_p3,0), coalesce(NEW.score_p3,0))
  ) AS p(pid, old_score, new_score)
  WHERE p.pid IS NOT NULL
  ON CONFLICT (game_kind, game_id, round_number, player_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_domino_round ON public.games;
CREATE TRIGGER trg_log_domino_round
AFTER UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.log_domino_round();

CREATE OR REPLACE FUNCTION public.log_petanque_round()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final boolean := (NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished');
  v_round integer := coalesce(OLD.round_number, 1);
BEGIN
  IF NOT v_final AND NEW.round_number IS NOT DISTINCT FROM OLD.round_number THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.round_ledger (game_kind, game_id, ticket_number, round_number, player_id, points, cumulative, stake, amount, is_final, is_winner, reason)
  SELECT 'petanque', NEW.id, NEW.ticket_number, v_round, p.pid,
         p.new_score - p.old_score, p.new_score, NEW.stake,
         CASE WHEN v_final THEN public.rl_payout(NEW.stake, 2, p.pid = NEW.winner_id) ELSE 0 END,
         v_final, v_final AND p.pid = NEW.winner_id, NULL
  FROM (
    VALUES
      (NEW.player1_id, coalesce(OLD.score_p1,0)::numeric, coalesce(NEW.score_p1,0)::numeric),
      (NEW.player2_id, coalesce(OLD.score_p2,0)::numeric, coalesce(NEW.score_p2,0)::numeric)
  ) AS p(pid, old_score, new_score)
  WHERE p.pid IS NOT NULL
  ON CONFLICT (game_kind, game_id, round_number, player_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_petanque_round ON public.petanque_games;
CREATE TRIGGER trg_log_petanque_round
AFTER UPDATE ON public.petanque_games
FOR EACH ROW EXECUTE FUNCTION public.log_petanque_round();

CREATE OR REPLACE FUNCTION public.log_ludo_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pc integer := coalesce(NEW.players_count, 2);
BEGIN
  IF NOT (NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.round_ledger (game_kind, game_id, ticket_number, round_number, player_id, points, cumulative, stake, amount, is_final, is_winner, reason)
  SELECT 'ludo', NEW.id, NEW.ticket_number, 1, p.pid, 0, 0, NEW.stake,
         public.rl_payout(NEW.stake, v_pc, p.pid = NEW.winner_id),
         true, p.pid = NEW.winner_id, NULL
  FROM (
    VALUES (NEW.player1_id), (NEW.player2_id), (NEW.player3_id), (NEW.player4_id)
  ) AS p(pid)
  WHERE p.pid IS NOT NULL
  ON CONFLICT (game_kind, game_id, round_number, player_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ludo_result ON public.ludo_games;
CREATE TRIGGER trg_log_ludo_result
AFTER UPDATE ON public.ludo_games
FOR EACH ROW EXECUTE FUNCTION public.log_ludo_result();