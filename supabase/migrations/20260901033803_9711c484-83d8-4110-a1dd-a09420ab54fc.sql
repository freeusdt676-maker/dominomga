CREATE OR REPLACE FUNCTION public.start_game_deduct(_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g RECORD; commission_each NUMERIC; admin_user UUID; bal NUMERIC; pcount int;
        total_commission NUMERIC := 0; real_commission NUMERIC := 0; pot NUMERIC := 0; real_count int := 0;
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

  -- Calcul mitovy amin'ny teo aloha: commission = 10% x isan'ny toerana rehetra
  total_commission := commission_each * pcount;
  -- Pot = (mise - 10%) x isan'ny toerana
  pot := (g.stake - commission_each) * pcount;
  -- Wallet admin: ny anjaran'ny mpilalao tena izy ihany (affichage madio)
  real_commission := commission_each * real_count;

  IF real_commission > 0 THEN
    SELECT user_id INTO admin_user FROM public.user_roles WHERE role='admin' ORDER BY created_at LIMIT 1;
    IF admin_user IS NOT NULL THEN
      INSERT INTO public.admin_wallets(admin_id, balance) VALUES (admin_user, real_commission)
      ON CONFLICT (admin_id) DO UPDATE SET balance = admin_wallets.balance + EXCLUDED.balance, updated_at = now();
    END IF;
  END IF;

  INSERT INTO public.game_audit(game_kind, game_id, ticket_number, action, stake, commission, pot, players_count, meta)
  VALUES ('domino', g.id, g.ticket_number, 'stake', g.stake, total_commission, pot, pcount,
          jsonb_build_object('real_players', real_count, 'real_commission', real_commission));

  UPDATE public.games SET commission = total_commission, cash_pool = pot WHERE id = g.id;
  RETURN jsonb_build_object('ok', true, 'commission_total', total_commission, 'commission_real', real_commission, 'cash_pool', pot, 'real_players', real_count);
END $function$;

CREATE OR REPLACE FUNCTION public.enforce_domino_settle_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE expected_commission numeric; pc int; real_count int;
BEGIN
  IF NEW.status = 'finished' AND NEW.winner_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'finished') THEN
    pc := COALESCE(NEW.players_count, 2);
    SELECT count(*) INTO real_count
      FROM unnest(ARRAY[NEW.player1_id, NEW.player2_id, NEW.player3_id]) AS pid
      WHERE pid IS NOT NULL AND NOT public.is_virtual_player(pid);
    expected_commission := round(NEW.stake * 0.10) * pc;
    IF COALESCE(NEW.commission,0) <> expected_commission THEN
      RAISE EXCEPTION 'integrity_violation: commission diso (nahazo % nefa tokony %)', NEW.commission, expected_commission;
    END IF;
    IF NEW.winner_id NOT IN (NEW.player1_id, NEW.player2_id, COALESCE(NEW.player3_id, NEW.player1_id)) THEN
      RAISE EXCEPTION 'integrity_violation: winner tsy mpilalao';
    END IF;
    INSERT INTO public.game_audit(game_kind, game_id, ticket_number, action, stake, commission, pot, winner_id, players_count, meta)
    VALUES ('domino', NEW.id, NEW.ticket_number, 'settle', NEW.stake, NEW.commission,
            (NEW.stake - round(NEW.stake*0.10)) * pc, NEW.winner_id, pc,
            jsonb_build_object('score_p1', NEW.score_p1, 'score_p2', NEW.score_p2, 'score_p3', NEW.score_p3, 'real_players', real_count));
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_cancel_domino_game(_game_id uuid, _admin_id uuid, _pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g RECORD; pids uuid[]; pid uuid; refunded_count integer := 0; admin_user uuid; refund_amount numeric; real_commission numeric := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _admin_id := auth.uid();
  PERFORM public.allow_wallet_mutation();
  SELECT * INTO g FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'game_not_found'; END IF;
  IF g.status IN ('finished', 'cancelled') THEN RAISE EXCEPTION 'already_closed'; END IF;
  pids := ARRAY[g.player1_id, g.player2_id, g.player3_id]::uuid[];
  refund_amount := COALESCE(g.stake, 0);
  FOREACH pid IN ARRAY pids LOOP
    CONTINUE WHEN pid IS NULL;
    CONTINUE WHEN public.is_virtual_player(pid);
    IF COALESCE(g.commission, 0) > 0 THEN
      UPDATE public.wallets SET balance=balance+refund_amount, updated_at=now() WHERE user_id=pid;
      INSERT INTO public.transactions(user_id, type, amount, status, game_id, admin_note, processed_at, processed_by)
      VALUES (pid, 'deposit', refund_amount, 'approved', g.id, 'Annulation admin - remboursement mise', now(), auth.uid());
      refunded_count := refunded_count + 1;
    END IF;
  END LOOP;
  -- Manala ny commission tena izy ihany (izay tena niditra tao amin'ny wallet admin)
  real_commission := round(COALESCE(g.stake,0) * 0.10) * refunded_count;
  IF real_commission > 0 THEN
    SELECT user_id INTO admin_user FROM public.user_roles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
    IF admin_user IS NOT NULL THEN
      UPDATE public.admin_wallets SET balance = GREATEST(0, balance - real_commission), updated_at = now()
      WHERE admin_id = admin_user;
    END IF;
  END IF;
  UPDATE public.games SET status='cancelled', winner_id=NULL, finished_at=now(), updated_at=now(),
    reveal_until=NULL, endgame_votes=NULL, cash_pool=0 WHERE id = g.id;
  RETURN jsonb_build_object('ok', true, 'refunded_players', refunded_count);
END $function$;