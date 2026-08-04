CREATE OR REPLACE FUNCTION public.domino_json_pips(_hand jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(sum(COALESCE((tile->>0)::integer,0) + COALESCE((tile->>1)::integer,0)),0)::integer
  FROM jsonb_array_elements(COALESCE(_hand,'[]'::jsonb)) tile;
$$;

CREATE OR REPLACE FUNCTION public.domino_finish_round(
  _game_id uuid,
  _winner uuid,
  _last_tile jsonb DEFAULT NULL,
  _blocked boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.games%ROWTYPE;
  caller uuid := auth.uid();
  caller_role text := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '');
  ids uuid[];
  pips integer[];
  winner_index integer;
  winner_hand jsonb;
  points integer := 0;
  new_p1 numeric;
  new_p2 numeric;
  new_p3 numeric;
  winner_score numeric;
  target_score integer;
  solo_win boolean;
  forty_win boolean;
  target_win boolean;
  double_six boolean;
  instant_win boolean;
  reason text;
  min_pips integer;
  min_count integer;
  i integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('domino-round:' || _game_id::text, 0));
  SELECT * INTO g FROM public.games WHERE id=_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'game_not_found'; END IF;
  IF g.status <> 'in_progress' THEN RAISE EXCEPTION 'invalid_game_status'; END IF;

  ids := CASE WHEN g.players_count=3
    THEN ARRAY[g.player1_id,g.player2_id,g.player3_id]
    ELSE ARRAY[g.player1_id,g.player2_id]
  END;
  IF NOT (_winner = ANY(ids)) THEN RAISE EXCEPTION 'invalid_winner'; END IF;
  IF caller_role <> 'service_role' AND NOT public.has_role(caller,'admin') AND caller <> _winner THEN
    RAISE EXCEPTION 'forbidden_caller';
  END IF;

  pips := ARRAY[
    public.domino_json_pips(g.player1_hand),
    public.domino_json_pips(g.player2_hand),
    public.domino_json_pips(g.player3_hand)
  ];
  winner_index := array_position(ids,_winner);
  winner_hand := CASE winner_index WHEN 1 THEN g.player1_hand WHEN 2 THEN g.player2_hand ELSE g.player3_hand END;

  IF _blocked THEN
    min_pips := LEAST(pips[1],pips[2],CASE WHEN g.players_count=3 THEN pips[3] ELSE 2147483647 END);
    min_count := 0;
    FOR i IN 1..array_length(ids,1) LOOP
      IF pips[i]=min_pips THEN min_count:=min_count+1; END IF;
      IF public.domino_hand_has_move(CASE i WHEN 1 THEN g.player1_hand WHEN 2 THEN g.player2_hand ELSE g.player3_hand END,g.board_state) THEN
        RAISE EXCEPTION 'game_not_blocked';
      END IF;
    END LOOP;
    IF min_count <> 1 THEN RAISE EXCEPTION 'blocked_tie'; END IF;
    IF pips[winner_index] <> min_pips THEN RAISE EXCEPTION 'wrong_blocked_winner'; END IF;
  ELSE
    IF jsonb_array_length(COALESCE(winner_hand,'[]'::jsonb)) <> 0 THEN RAISE EXCEPTION 'winner_hand_not_empty'; END IF;
  END IF;

  FOR i IN 1..array_length(ids,1) LOOP
    IF i <> winner_index THEN points:=points+pips[i]; END IF;
  END LOOP;

  new_p1 := COALESCE(g.score_p1,0) + CASE WHEN winner_index=1 THEN points ELSE 0 END;
  new_p2 := COALESCE(g.score_p2,0) + CASE WHEN winner_index=2 THEN points ELSE 0 END;
  new_p3 := COALESCE(g.score_p3,0) + CASE WHEN winner_index=3 THEN points ELSE 0 END;
  winner_score := CASE winner_index WHEN 1 THEN new_p1 WHEN 2 THEN new_p2 ELSE new_p3 END;
  target_score := CASE WHEN g.game_mode='d80' THEN 80 ELSE 120 END;
  target_win := winner_score >= target_score;
  forty_win := points >= 40;
  solo_win := winner_score >= 40
    AND (winner_index=1 OR new_p1=0)
    AND (winner_index=2 OR new_p2=0)
    AND (g.players_count<>3 OR winner_index=3 OR new_p3=0);
  double_six := _last_tile IS NOT NULL
    AND COALESCE((_last_tile->>0)::integer,-1)=6
    AND COALESCE((_last_tile->>1)::integer,-1)=6;
  instant_win := target_win OR forty_win OR solo_win;

  reason := CASE
    WHEN solo_win THEN 'MANDRESY NY LALAO — 40 MANDEHA IRERY'
    WHEN forty_win THEN 'MANDRESY NY LALAO — 40 INDRAY MAKA'
    WHEN target_win THEN 'MANDRESY NY LALAO — TONGA ' || target_score::text
    WHEN double_six THEN 'Tour vita — DOUBLE 6'
    WHEN _blocked THEN 'Blocage — +' || points::text || ' isa'
    ELSE 'Tour vita — +' || points::text || ' isa'
  END;

  UPDATE public.games
  SET score_p1=new_p1, score_p2=new_p2, score_p3=new_p3,
      current_turn=NULL, turn_started_at=NULL, passes=0,
      reveal_until=now()+interval '5 seconds', last_reason=reason, updated_at=now()
  WHERE id=g.id;

  RETURN jsonb_build_object(
    'ok',true,'points',points,'score_p1',new_p1,'score_p2',new_p2,'score_p3',new_p3,
    'winner_score',winner_score,'target',target_score,'target_win',target_win,
    'solo_win',solo_win,'forty_win',forty_win,'double_six',double_six,'instant_win',instant_win,'reason',reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.domino_json_pips(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.domino_json_pips(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.domino_finish_round(uuid,uuid,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.domino_finish_round(uuid,uuid,jsonb,boolean) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.spectator_list(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.spectator_get(text,uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_adjust_player_wallet(_user_id uuid, _admin_id uuid, _type transaction_type, _amount numeric, _pin text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cur numeric; newbal numeric; tx_id uuid; clean_note text; caller uuid:=auth.uid();
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _type NOT IN ('deposit','withdrawal') OR COALESCE(_amount,0)<=0 THEN RAISE EXCEPTION 'invalid_amount_or_type'; END IF;
  SELECT balance INTO cur FROM public.wallets WHERE user_id=_user_id FOR UPDATE;
  IF cur IS NULL THEN INSERT INTO public.wallets(user_id,balance) VALUES(_user_id,0); cur:=0; END IF;
  IF _type='withdrawal' AND cur<_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  newbal:=CASE WHEN _type='deposit' THEN cur+_amount ELSE cur-_amount END;
  clean_note:=COALESCE(NULLIF(trim(_note),''),'Réclamation administratif');
  PERFORM public.allow_wallet_mutation();
  UPDATE public.wallets SET balance=newbal,updated_at=now() WHERE user_id=_user_id;
  INSERT INTO public.transactions(user_id,type,amount,status,admin_note,processed_by,processed_at,mvola_reference)
  VALUES(_user_id,_type,_amount,'approved',clean_note,caller,now(),'RECLAMATION-ADMIN') RETURNING id INTO tx_id;
  INSERT INTO public.chat_messages(sender_id,recipient_id,content,is_admin_broadcast)
  VALUES(caller,_user_id,CASE WHEN _type='deposit' THEN 'Dépôt administratif +' ELSE 'Retrait administratif -' END||_amount::text||' Ar — '||clean_note,false);
  PERFORM public.log_audit('admin_adjust_player_wallet',jsonb_build_object('target_user',_user_id,'type',_type,'amount',_amount,'transaction_id',tx_id));
  RETURN jsonb_build_object('ok',true,'transaction_id',tx_id,'old_balance',cur,'new_balance',newbal);
END $$;

CREATE OR REPLACE FUNCTION public.admin_reset_user_balance(_user_id uuid,_admin_id uuid,_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE caller uuid:=auth.uid(); oldbal numeric;
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.allow_wallet_mutation();
  SELECT balance INTO oldbal FROM public.wallets WHERE user_id=_user_id FOR UPDATE;
  UPDATE public.wallets SET balance=0,updated_at=now() WHERE user_id=_user_id;
  PERFORM public.log_audit('admin_reset_user_balance',jsonb_build_object('target_user',_user_id,'old_balance',COALESCE(oldbal,0)));
  RETURN jsonb_build_object('ok',true,'old_balance',COALESCE(oldbal,0));
END $$;

CREATE OR REPLACE FUNCTION public.admin_reset_commission(_admin_id uuid,_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE caller uuid:=auth.uid(); oldbal numeric;
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT balance INTO oldbal FROM public.admin_wallets WHERE admin_id=caller FOR UPDATE;
  UPDATE public.admin_wallets SET balance=0,updated_at=now() WHERE admin_id=caller;
  PERFORM public.log_audit('admin_reset_commission',jsonb_build_object('old_balance',COALESCE(oldbal,0)));
  RETURN jsonb_build_object('ok',true,'old_balance',COALESCE(oldbal,0));
END $$;

REVOKE ALL ON FUNCTION public.admin_adjust_player_wallet(uuid,uuid,transaction_type,numeric,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reset_user_balance(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reset_commission(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_player_wallet(uuid,uuid,transaction_type,numeric,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_balance(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_commission(uuid,text) TO authenticated, service_role;