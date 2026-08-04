ALTER TABLE public.games ADD COLUMN IF NOT EXISTS pending_winner_id uuid;

CREATE OR REPLACE FUNCTION public.domino_finish_round(
  _game_id uuid,
  _winner uuid,
  _last_tile jsonb DEFAULT NULL,
  _blocked boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  g public.games%ROWTYPE; caller uuid:=auth.uid(); caller_role text:=COALESCE(auth.role(),current_setting('request.jwt.claim.role',true),'');
  ids uuid[]; pips integer[]; winner_index integer; winner_hand jsonb; points integer:=0;
  new_p1 numeric; new_p2 numeric; new_p3 numeric; winner_score numeric; target_score integer;
  solo_win boolean; forty_win boolean; target_win boolean; double_six boolean; instant_win boolean;
  reason text; min_pips integer; min_count integer; i integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('domino-round:'||_game_id::text,0));
  SELECT * INTO g FROM public.games WHERE id=_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'game_not_found'; END IF;
  IF g.status<>'in_progress' THEN RAISE EXCEPTION 'invalid_game_status'; END IF;
  ids:=CASE WHEN g.players_count=3 THEN ARRAY[g.player1_id,g.player2_id,g.player3_id] ELSE ARRAY[g.player1_id,g.player2_id] END;
  IF NOT (_winner=ANY(ids)) THEN RAISE EXCEPTION 'invalid_winner'; END IF;
  IF caller_role<>'service_role' AND NOT public.has_role(caller,'admin') AND caller<>_winner THEN RAISE EXCEPTION 'forbidden_caller'; END IF;
  pips:=ARRAY[public.domino_json_pips(g.player1_hand),public.domino_json_pips(g.player2_hand),public.domino_json_pips(g.player3_hand)];
  winner_index:=array_position(ids,_winner);
  winner_hand:=CASE winner_index WHEN 1 THEN g.player1_hand WHEN 2 THEN g.player2_hand ELSE g.player3_hand END;
  IF _blocked THEN
    min_pips:=LEAST(pips[1],pips[2],CASE WHEN g.players_count=3 THEN pips[3] ELSE 2147483647 END); min_count:=0;
    FOR i IN 1..array_length(ids,1) LOOP
      IF pips[i]=min_pips THEN min_count:=min_count+1; END IF;
      IF public.domino_hand_has_move(CASE i WHEN 1 THEN g.player1_hand WHEN 2 THEN g.player2_hand ELSE g.player3_hand END,g.board_state) THEN RAISE EXCEPTION 'game_not_blocked'; END IF;
    END LOOP;
    IF min_count<>1 THEN RAISE EXCEPTION 'blocked_tie'; END IF;
    IF pips[winner_index]<>min_pips THEN RAISE EXCEPTION 'wrong_blocked_winner'; END IF;
  ELSIF jsonb_array_length(COALESCE(winner_hand,'[]'::jsonb))<>0 THEN RAISE EXCEPTION 'winner_hand_not_empty'; END IF;
  FOR i IN 1..array_length(ids,1) LOOP IF i<>winner_index THEN points:=points+pips[i]; END IF; END LOOP;
  new_p1:=COALESCE(g.score_p1,0)+CASE WHEN winner_index=1 THEN points ELSE 0 END;
  new_p2:=COALESCE(g.score_p2,0)+CASE WHEN winner_index=2 THEN points ELSE 0 END;
  new_p3:=COALESCE(g.score_p3,0)+CASE WHEN winner_index=3 THEN points ELSE 0 END;
  winner_score:=CASE winner_index WHEN 1 THEN new_p1 WHEN 2 THEN new_p2 ELSE new_p3 END;
  target_score:=CASE WHEN g.game_mode='d80' THEN 80 ELSE 120 END;
  target_win:=winner_score>=target_score; forty_win:=points>=40;
  solo_win:=winner_score>=40 AND (winner_index=1 OR new_p1=0) AND (winner_index=2 OR new_p2=0) AND (g.players_count<>3 OR winner_index=3 OR new_p3=0);
  double_six:=_last_tile IS NOT NULL AND COALESCE((_last_tile->>0)::integer,-1)=6 AND COALESCE((_last_tile->>1)::integer,-1)=6;
  instant_win:=target_win OR forty_win OR solo_win;
  reason:=CASE WHEN solo_win THEN 'MANDRESY NY LALAO — 40 MANDEHA IRERY' WHEN forty_win THEN 'MANDRESY NY LALAO — 40 INDRAY MAKA' WHEN target_win THEN 'MANDRESY NY LALAO — TONGA '||target_score::text WHEN double_six THEN 'Tour vita — DOUBLE 6' WHEN _blocked THEN 'Blocage — +'||points::text||' isa' ELSE 'Tour vita — +'||points::text||' isa' END;
  UPDATE public.games SET score_p1=new_p1,score_p2=new_p2,score_p3=new_p3,current_turn=NULL,turn_started_at=NULL,passes=0,reveal_until=now()+interval '5 seconds',last_reason=reason,pending_winner_id=CASE WHEN instant_win THEN _winner ELSE NULL END,updated_at=now() WHERE id=g.id;
  RETURN jsonb_build_object('ok',true,'points',points,'score_p1',new_p1,'score_p2',new_p2,'score_p3',new_p3,'winner_score',winner_score,'target',target_score,'target_win',target_win,'solo_win',solo_win,'forty_win',forty_win,'double_six',double_six,'instant_win',instant_win,'reason',reason);
END $$;

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id,user_id,mvola_name,phone,birth_date,gender,avatar_url,last_seen,is_online,created_at,updated_at,account_status,selfie_url,approved_at,approved_by,player_number) ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (mvola_name,phone,avatar_url,last_seen,is_online,selfie_url,updated_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_clear_user_history(_user_id uuid,_admin_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE caller uuid:=auth.uid(); deleted_games int:=0; deleted_ludo int:=0; deleted_pet int:=0; deleted_msgs int:=0; deleted_lobby int:=0; deleted_tx int:=0; deleted_moves int:=0;
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller,'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  DELETE FROM public.game_moves gm USING public.games g WHERE gm.game_id=g.id AND g.status IN('finished','cancelled') AND (g.player1_id=_user_id OR g.player2_id=_user_id OR g.player3_id=_user_id); GET DIAGNOSTICS deleted_moves=ROW_COUNT;
  DELETE FROM public.games WHERE status IN('finished','cancelled') AND (player1_id=_user_id OR player2_id=_user_id OR player3_id=_user_id); GET DIAGNOSTICS deleted_games=ROW_COUNT;
  DELETE FROM public.ludo_games WHERE status IN('finished','cancelled') AND (player1_id=_user_id OR player2_id=_user_id OR player3_id=_user_id OR player4_id=_user_id); GET DIAGNOSTICS deleted_ludo=ROW_COUNT;
  DELETE FROM public.petanque_games WHERE status IN('finished','cancelled') AND (player1_id=_user_id OR player2_id=_user_id); GET DIAGNOSTICS deleted_pet=ROW_COUNT;
  DELETE FROM public.chat_messages WHERE sender_id=_user_id OR recipient_id=_user_id; GET DIAGNOSTICS deleted_msgs=ROW_COUNT;
  DELETE FROM public.lobby_messages WHERE sender_id=_user_id; GET DIAGNOSTICS deleted_lobby=ROW_COUNT;
  DELETE FROM public.transactions WHERE user_id=_user_id AND status IN('approved','rejected','completed'); GET DIAGNOSTICS deleted_tx=ROW_COUNT;
  PERFORM public.log_audit('admin_clear_user_history',jsonb_build_object('target_user',_user_id,'games',deleted_games,'ludo',deleted_ludo,'petanque',deleted_pet,'moves',deleted_moves,'chat_messages',deleted_msgs,'lobby_messages',deleted_lobby,'transactions',deleted_tx));
  RETURN jsonb_build_object('games',deleted_games,'ludo',deleted_ludo,'petanque',deleted_pet,'moves',deleted_moves,'chat_messages',deleted_msgs,'lobby_messages',deleted_lobby,'transactions',deleted_tx);
END $$;
REVOKE ALL ON FUNCTION public.admin_clear_user_history(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_user_history(uuid,text) TO authenticated,service_role;