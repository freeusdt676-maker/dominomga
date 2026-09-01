CREATE OR REPLACE FUNCTION public.join_3p_start(_game_id uuid, _player3 uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g RECORD; v_real int; v_bot int; v_new_is_bot boolean;
BEGIN
  IF public.game_blocked('domino') THEN
    RAISE EXCEPTION 'game_blocked' USING HINT = 'Bloqué le jeu: Domino maintenance vetivety';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('join:'||_game_id::text, 0));
  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF g IS NULL THEN RAISE EXCEPTION 'game_not_found'; END IF;
  IF COALESCE(g.players_count,2) <> 3 THEN RAISE EXCEPTION 'not_3p'; END IF;
  IF g.player3_id IS NOT NULL THEN RAISE EXCEPTION 'already_taken'; END IF;
  IF g.player2_id IS NULL THEN RAISE EXCEPTION 'need_player2_first'; END IF;
  IF _player3 = g.player1_id OR _player3 = g.player2_id THEN RAISE EXCEPTION 'cannot_join_own'; END IF;

  -- Fitsipika 3P: raha misy bot ao dia mpilalao tena izy IRAY ihany no ekena.
  v_bot := (CASE WHEN public.is_virtual_player(g.player1_id) THEN 1 ELSE 0 END)
         + (CASE WHEN public.is_virtual_player(g.player2_id) THEN 1 ELSE 0 END);
  v_real := 2 - v_bot;
  v_new_is_bot := public.is_virtual_player(_player3);
  IF v_new_is_bot THEN
    IF v_real >= 2 THEN RAISE EXCEPTION 'already_taken'; END IF;
  ELSE
    IF v_bot >= 1 AND v_real >= 1 THEN RAISE EXCEPTION 'already_taken'; END IF;
  END IF;

  UPDATE public.games SET player3_id=_player3, status='in_progress', current_turn=g.player1_id, turn_started_at=now(), updated_at=now() WHERE id=_game_id;
  PERFORM public.start_game_deduct(_game_id);
  RETURN jsonb_build_object('ok', true, 'ticket', g.ticket_number);
END $function$;