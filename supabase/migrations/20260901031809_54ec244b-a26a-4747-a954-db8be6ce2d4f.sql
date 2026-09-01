-- 1) Pot complet (comme si tous les sièges avaient payé)
CREATE OR REPLACE FUNCTION public.start_game_deduct(_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g RECORD; commission_each NUMERIC; admin_user UUID; bal NUMERIC; pcount int;
        total_commission NUMERIC := 0; pot NUMERIC := 0; real_count int := 0;
        pids uuid[]; pid uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('start_deduct:'||_game_id::text, 0));
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO g FROM public.games WHERE id=_game_id FOR UPDATE;
  IF g IS NULL THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF g.status <> 'in_progress' THEN RAISE EXCEPTION 'Game not in_progress'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_audit WHERE game_id=g.id AND game_kind='domino' AND action='stake') THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  pcount := COALESCE(g.players_count, 2);
  IF pcount = 2 AND g.player2_id IS NULL THEN RAISE EXCEPTION 'No opponent'; END IF;
  IF pcount = 3 AND (g.player2_id IS NULL OR g.player3_id IS NULL) THEN RAISE EXCEPTION 'No opponents'; END IF;
  commission_each := round(g.stake * 0.10);
  pids := ARRAY[g.player1_id, g.player2_id, g.player3_id]::uuid[];

  FOR i IN 1..pcount LOOP
    pid := pids[i];
    IF pid IS NULL THEN RAISE EXCEPTION 'missing_player'; END IF;
    CONTINUE WHEN public.is_virtual_player(pid);
    SELECT balance INTO bal FROM public.wallets WHERE user_id=pid FOR UPDATE;
    IF bal < g.stake THEN RAISE EXCEPTION 'Tsy ampy ny solde-nao'; END IF;
    UPDATE public.wallets SET balance=balance-g.stake, updated_at=now() WHERE user_id=pid;
    INSERT INTO public.transactions(user_id,type,amount,status,game_id)
      VALUES (pid,'game_stake',g.stake,'completed',g.id);
    real_count := real_count + 1;
  END LOOP;

  -- Commission: vrais joueurs uniquement (les bots ne paient rien)
  total_commission := commission_each * real_count;
  -- Pot: identique a une partie 100% humaine (les sieges bots sont finances par le systeme)
  pot := (g.stake - commission_each) * pcount;

  IF total_commission > 0 THEN
    SELECT user_id INTO admin_user FROM public.user_roles WHERE role='admin' ORDER BY created_at LIMIT 1;
    IF admin_user IS NOT NULL THEN
      INSERT INTO public.admin_wallets(admin_id, balance) VALUES (admin_user, total_commission)
      ON CONFLICT (admin_id) DO UPDATE SET balance = admin_wallets.balance + EXCLUDED.balance, updated_at = now();
    END IF;
  END IF;

  INSERT INTO public.game_audit(game_kind, game_id, ticket_number, action, stake, commission, pot, players_count, meta)
  VALUES ('domino', g.id, g.ticket_number, 'stake', g.stake, total_commission, pot, pcount,
          jsonb_build_object('real_players', real_count));

  UPDATE public.games SET commission = total_commission, cash_pool = pot WHERE id = g.id;
  RETURN jsonb_build_object('ok', true, 'commission_total', total_commission, 'cash_pool', pot, 'real_players', real_count);
END $function$;

-- 2) Settle: si un bot gagne, la part reelle part a la maison
CREATE OR REPLACE FUNCTION public.settle_game(_game_id uuid, _winner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  admin_user uuid;
  real_part numeric := 0;
  real_count int := 0;
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

  IF pot > 0 AND public.is_virtual_player(_winner) THEN
    -- Le bot gagne: seule la part financee par les vrais joueurs va a la maison
    SELECT count(*) INTO real_count
      FROM unnest(ARRAY[g.player1_id, g.player2_id, g.player3_id]) AS pid
      WHERE pid IS NOT NULL AND NOT public.is_virtual_player(pid);
    real_part := (g.stake - round(g.stake * 0.10)) * real_count;
    IF real_part > 0 THEN
      SELECT user_id INTO admin_user FROM public.user_roles WHERE role='admin' ORDER BY created_at LIMIT 1;
      IF admin_user IS NOT NULL THEN
        INSERT INTO public.admin_wallets(admin_id, balance) VALUES (admin_user, real_part)
        ON CONFLICT (admin_id) DO UPDATE SET balance = admin_wallets.balance + EXCLUDED.balance, updated_at = now();
      END IF;
    END IF;
  ELSIF pot > 0 THEN
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
END $function$;

-- 3) Affichage admin: argent bloque = part des vrais joueurs uniquement
CREATE OR REPLACE FUNCTION public.admin_total_locked_cash_pool(_admin_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT SUM((g.stake - round(g.stake * 0.10)) * (
      SELECT count(*) FROM unnest(ARRAY[g.player1_id, g.player2_id, g.player3_id]) AS pid
      WHERE pid IS NOT NULL AND NOT public.is_virtual_player(pid)
    ))
    FROM public.games g WHERE g.status='in_progress'
  ),0)
  + COALESCE((SELECT SUM(cash_pool) FROM public.ludo_games WHERE status='in_progress'),0)
  + COALESCE((SELECT SUM(cash_pool) FROM public.petanque_games WHERE status='in_progress'),0)
  WHERE public.has_role(auth.uid(), 'admin');
$function$;