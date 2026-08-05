CREATE OR REPLACE FUNCTION public.domino_guard_instant_win()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  ids uuid[]; scores numeric[]; target integer; pc integer; i integer;
  win_id uuid; win_reason text; s numeric; others_zero boolean; j integer;
BEGIN
  IF NEW.status <> 'in_progress' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.game_mode,'d120') NOT IN ('d80','d120','hand') THEN RETURN NEW; END IF;
  IF NEW.pending_winner_id IS NOT NULL THEN RETURN NEW; END IF;

  pc := COALESCE(NEW.players_count,2);
  IF pc = 3 THEN
    ids := ARRAY[NEW.player1_id,NEW.player2_id,NEW.player3_id];
    scores := ARRAY[COALESCE(NEW.score_p1,0),COALESCE(NEW.score_p2,0),COALESCE(NEW.score_p3,0)];
  ELSE
    ids := ARRAY[NEW.player1_id,NEW.player2_id];
    scores := ARRAY[COALESCE(NEW.score_p1,0),COALESCE(NEW.score_p2,0)];
  END IF;
  target := CASE WHEN NEW.game_mode = 'd80' THEN 80 ELSE 120 END;

  FOR i IN 1..array_length(ids,1) LOOP
    s := scores[i];
    IF ids[i] IS NULL THEN CONTINUE; END IF;
    IF s >= target THEN
      win_id := ids[i]; win_reason := 'MANDRESY NY LALAO — TONGA '||target::text; EXIT;
    END IF;
    others_zero := true;
    FOR j IN 1..array_length(ids,1) LOOP
      IF j <> i AND scores[j] <> 0 THEN others_zero := false; END IF;
    END LOOP;
    IF s >= 40 AND others_zero THEN
      win_id := ids[i]; win_reason := 'MANDRESY NY LALAO — 40 MANDEHA IRERY'; EXIT;
    END IF;
  END LOOP;

  IF win_id IS NULL THEN RETURN NEW; END IF;

  NEW.pending_winner_id := win_id;
  NEW.current_turn := NULL;
  NEW.turn_started_at := NULL;
  NEW.reveal_until := COALESCE(NEW.reveal_until, now() + interval '3 seconds');
  NEW.last_reason := COALESCE(NEW.last_reason, win_reason);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_domino_guard_instant_win ON public.games;
CREATE TRIGGER trg_domino_guard_instant_win
BEFORE UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.domino_guard_instant_win();