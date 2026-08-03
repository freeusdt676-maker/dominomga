-- Fix role helper permissions used by RLS and server-side authorization.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- All admin SECURITY DEFINER routines must authorize the real caller, never a caller-supplied UUID.
DO $do$
DECLARE
  r record;
  ddl text;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_functiondef(p.oid) ~ 'has_role\(_admin_id'
  LOOP
    ddl := pg_get_functiondef(r.oid);
    ddl := replace(ddl, 'public.has_role(_admin_id, ''admin'')', 'public.has_role(auth.uid(), ''admin'')');
    ddl := replace(ddl, 'public.has_role(_admin_id, ''admin''::public.app_role)', 'public.has_role(auth.uid(), ''admin''::public.app_role)');
    ddl := replace(ddl, 'public.has_role(_admin_id, ''admin''::app_role)', 'public.has_role(auth.uid(), ''admin''::app_role)');
    EXECUTE ddl;
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role', r.nspname, r.proname, r.args);
  END LOOP;
END
$do$;

-- Remove unauthenticated access to every remaining SECURITY DEFINER routine by default.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', r.nspname, r.proname, r.args);
  END LOOP;
END
$do$;

-- Explicitly restore authenticated execution for application RPCs; RLS still scopes their data.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role', r.nspname, r.proname, r.args);
  END LOOP;
END
$do$;

-- Admin identity is private; authenticated non-admin callers must not receive it.
CREATE OR REPLACE FUNCTION public.get_admin_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE aid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT user_id INTO aid FROM public.user_roles WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  RETURN aid;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_id() TO authenticated, service_role;

-- Settlement remains idempotent and financially atomic. Special 40 wins are marked server-side in last_reason.
CREATE OR REPLACE FUNCTION public.settle_game(_game_id uuid, _winner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF g.is_tournament = true THEN
    UPDATE public.games SET status='finished', winner_id=_winner, finished_at=now(), updated_at=now(), cash_pool=0 WHERE id=g.id;
    UPDATE public.tournament_matches SET winner_id=_winner, finished_at=now() WHERE game_id=g.id AND winner_id IS NULL;
    RETURN jsonb_build_object('ok', true, 'tournament', true);
  END IF;

  target_score := CASE WHEN g.game_mode = 'd80' THEN 80 ELSE 120 END;
  winner_score := CASE
    WHEN _winner = g.player1_id THEN COALESCE(g.score_p1, 0)
    WHEN _winner = g.player2_id THEN COALESCE(g.score_p2, 0)
    WHEN _winner = g.player3_id THEN COALESCE(g.score_p3, 0)
    ELSE 0 END;
  special_win := COALESCE(g.last_reason, '') LIKE 'MANDRESY NY LALAO — 40%';

  IF winner_score < target_score AND NOT special_win THEN
    RAISE EXCEPTION 'domino_win_condition_not_reached';
  END IF;

  pot := COALESCE(g.cash_pool, 0);
  IF pot <= 0 THEN RAISE EXCEPTION 'empty_cash_pool'; END IF;

  UPDATE public.wallets SET balance=balance + pot, updated_at=now() WHERE user_id=_winner;
  IF NOT FOUND THEN RAISE EXCEPTION 'winner_wallet_missing'; END IF;

  INSERT INTO public.transactions(user_id,type,amount,status,game_id)
  SELECT _winner,'game_win',pot,'completed',g.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE game_id=g.id AND type='game_win' AND status='completed'
  );

  UPDATE public.games SET status='finished', winner_id=_winner, finished_at=now(), updated_at=now(), cash_pool=0 WHERE id=g.id;
  RETURN jsonb_build_object('ok', true, 'pot', pot, 'target_score', target_score, 'winner_score', winner_score, 'special_win', special_win);
END;
$$;
REVOKE ALL ON FUNCTION public.settle_game(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_game(uuid, uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_transactions_admin_processed
ON public.transactions (status, type, processed_at DESC);

-- Explicit table grants required by Data API; RLS remains the authorization boundary.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.wallets TO authenticated;
GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT SELECT, INSERT ON public.game_moves TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.profiles, public.wallets, public.transactions, public.games, public.game_moves, public.user_roles TO service_role;