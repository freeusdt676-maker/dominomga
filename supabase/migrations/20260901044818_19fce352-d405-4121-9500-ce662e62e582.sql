CREATE OR REPLACE FUNCTION public.enforce_domino_settle_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  real_count int;
  settled_pot numeric;
BEGIN
  IF NEW.status = 'finished' AND NEW.winner_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'finished') THEN
    IF NEW.commission IS DISTINCT FROM OLD.commission THEN
      RAISE EXCEPTION 'integrity_violation: commission niova nandritra ny settlement';
    END IF;
    IF COALESCE(OLD.cash_pool, 0) < 0 OR COALESCE(NEW.cash_pool, 0) <> 0 THEN
      RAISE EXCEPTION 'integrity_violation: cash_pool diso nandritra ny settlement';
    END IF;
    IF NEW.winner_id NOT IN (NEW.player1_id, NEW.player2_id, COALESCE(NEW.player3_id, NEW.player1_id)) THEN
      RAISE EXCEPTION 'integrity_violation: winner tsy mpilalao';
    END IF;

    SELECT count(*) INTO real_count
      FROM unnest(ARRAY[NEW.player1_id, NEW.player2_id, NEW.player3_id]) AS pid
      WHERE pid IS NOT NULL AND NOT public.is_virtual_player(pid);
    settled_pot := COALESCE(OLD.cash_pool, 0);

    INSERT INTO public.game_audit(game_kind, game_id, ticket_number, action, stake, commission, pot, winner_id, players_count, meta)
    VALUES (
      'domino', NEW.id, NEW.ticket_number, 'settle', NEW.stake, NEW.commission,
      settled_pot, NEW.winner_id, COALESCE(NEW.players_count, 2),
      jsonb_build_object('score_p1', NEW.score_p1, 'score_p2', NEW.score_p2, 'score_p3', NEW.score_p3, 'real_players', real_count)
    );
  END IF;
  RETURN NEW;
END
$function$;