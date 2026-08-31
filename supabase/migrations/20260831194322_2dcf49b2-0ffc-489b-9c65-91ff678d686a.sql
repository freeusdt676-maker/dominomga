CREATE OR REPLACE FUNCTION public.settle_game(_game_id uuid, _winner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  g public.games%ROWTYPE;
  pot numeric;
  caller uuid := auth.uid();
  caller_role text := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '');
  privileged boolean := false;
  winner_score numeric := 0;
  target_score numeric := 120;
  special_win boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('settle:' || _game_id::text, 0));
  PERFORM public.allow_wallet_mutation();
  privileged := caller_role = 'service_role' OR public.has_role(caller, 'admin');

  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'game_not_found'; END IF;
  IF g.status = 'finished' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF g.status <> 'in_progress' THEN RAISE EXCEPTION 'invalid_game_status'; END IF;

  IF _winner <> g.player1_id AND _winner <> g.player2_id
     AND _winner <> COALESCE(g.player3_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'invalid_winner';
  END IF;
  IF NOT privileged AND (caller IS NULL OR caller <> _winner) THEN
    RAISE EXCEPTION 'forbidden_caller';
  END IF;

  target_score := CASE WHEN g.game_mode = 'd80' THEN 80 ELSE 120 END;
  winner_score := CASE
    WHEN _winner = g.player1_id THEN COALESCE(g.score_p1, 0)
    WHEN _winner = g.player2_id THEN COALESCE(g.score_p2, 0)
    WHEN _winner = g.player3_id THEN COALESCE(g.score_p3, 0)
    ELSE 0 END;
  special_win := g.pending_winner_id = _winner
    AND COALESCE(g.last_reason, '') LIKE 'MANDRESY NY LALAO — %';

  IF winner_score < target_score AND NOT special_win THEN
    RAISE EXCEPTION 'domino_win_condition_not_reached';
  END IF;

  IF g.is_tournament = true THEN
    UPDATE public.games
      SET status='finished', winner_id=_winner, finished_at=now(), updated_at=now(), cash_pool=0
      WHERE id=g.id;
    UPDATE public.tournament_matches
      SET winner_id=_winner, finished_at=now()
      WHERE game_id=g.id AND winner_id IS NULL;
    RETURN jsonb_build_object('ok', true, 'tournament', true, 'special_win', special_win);
  END IF;

  pot := COALESCE(g.cash_pool, 0);

  IF pot > 0 THEN
    UPDATE public.wallets SET balance=balance + pot, updated_at=now() WHERE user_id=_winner;
    IF NOT FOUND THEN RAISE EXCEPTION 'winner_wallet_missing'; END IF;

    INSERT INTO public.transactions(user_id,type,amount,status,game_id)
    SELECT _winner,'game_win',pot,'completed',g.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE game_id=g.id AND type='game_win' AND status='completed'
    );
  END IF;

  UPDATE public.games
    SET status='finished', winner_id=_winner, finished_at=now(), updated_at=now(), cash_pool=0
    WHERE id=g.id;
  RETURN jsonb_build_object('ok', true, 'pot', pot, 'target_score', target_score, 'winner_score', winner_score, 'special_win', special_win);
END
$function$;