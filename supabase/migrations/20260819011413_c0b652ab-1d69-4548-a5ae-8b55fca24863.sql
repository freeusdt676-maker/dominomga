CREATE OR REPLACE FUNCTION public.domino_finish_round(_game_id uuid, _winner uuid, _last_tile jsonb DEFAULT NULL::jsonb, _blocked boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g public.games%ROWTYPE; caller uuid:=auth.uid(); caller_role text:=COALESCE(auth.role(),current_setting('request.jwt.claim.role',true),'');
  ids uuid[]; pips integer[]; winner_index integer; winner_hand jsonb; points integer:=0;
  new_p1 numeric; new_p2 numeric; new_p3 numeric; winner_score numeric; target_score integer; solo_threshold integer;
  solo_win boolean; forty_win boolean; target_win boolean; double_six boolean; date_win boolean; instant_win boolean;
  day_num integer; reason text; min_pips integer; min_count integer; i integer; settlement jsonb;
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

  FOR i IN 1..array_length(ids,1) LOOP
    IF i<>winner_index THEN points:=points+pips[i]; END IF;
  END LOOP;
  new_p1:=COALESCE(g.score_p1,0)+CASE WHEN winner_index=1 THEN points ELSE 0 END;
  new_p2:=COALESCE(g.score_p2,0)+CASE WHEN winner_index=2 THEN points ELSE 0 END;
  new_p3:=COALESCE(g.score_p3,0)+CASE WHEN winner_index=3 THEN points ELSE 0 END;
  winner_score:=CASE winner_index WHEN 1 THEN new_p1 WHEN 2 THEN new_p2 ELSE new_p3 END;
  target_score:=CASE WHEN g.game_mode='d80' THEN 80 ELSE 120 END;
  solo_threshold:=CASE WHEN g.game_mode='d80' THEN 40 ELSE 60 END;
  target_win:=winner_score>=target_score;
  forty_win:=points>=40;
  solo_win:=winner_score>=solo_threshold AND (winner_index=1 OR new_p1=0) AND (winner_index=2 OR new_p2=0) AND (g.players_count<>3 OR winner_index=3 OR new_p3=0);
  double_six:=_last_tile IS NOT NULL AND COALESCE((_last_tile->>0)::integer,-1)=6 AND COALESCE((_last_tile->>1)::integer,-1)=6;
  day_num:=EXTRACT(day FROM (now() AT TIME ZONE 'Indian/Antananarivo'))::integer;
  date_win:=points=day_num;
  instant_win:=target_win OR forty_win OR solo_win OR double_six OR date_win;
  reason:=CASE
    WHEN double_six THEN 'MANDRESY NY LALAO — MIALA DOUBLE 6'
    WHEN solo_win THEN 'MANDRESY NY LALAO — '||solo_threshold::text||' MANDEHA IRERY'
    WHEN forty_win THEN 'MANDRESY NY LALAO — 40 INDRAY MAKA'
    WHEN date_win THEN 'MANDRESY NY LALAO — DATINANDRO ('||day_num::text||' isa)'
    WHEN target_win THEN 'MANDRESY NY LALAO — TONGA '||target_score::text
    WHEN _blocked THEN 'Blocage — +'||points::text||' isa'
    ELSE 'Tour vita — +'||points::text||' isa' END;

  UPDATE public.games SET
    score_p1=new_p1, score_p2=new_p2, score_p3=new_p3,
    current_turn=NULL, turn_started_at=NULL, passes=0,
    reveal_until=CASE WHEN instant_win THEN now() ELSE now()+interval '5 seconds' END,
    last_reason=reason,
    pending_winner_id=CASE WHEN instant_win THEN _winner ELSE NULL END,
    updated_at=now()
  WHERE id=g.id;

  IF instant_win THEN
    settlement:=public.settle_game(_game_id,_winner);
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'points',points,'day_num',day_num,
    'score_p1',new_p1,'score_p2',new_p2,'score_p3',new_p3,
    'winner_score',winner_score,'target',target_score,
    'target_win',target_win,'solo_win',solo_win,'forty_win',forty_win,
    'double_six',double_six,'date_win',date_win,'instant_win',instant_win,
    'reason',reason,'settlement',settlement
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.domino_guard_instant_win()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ids uuid[]; scores numeric[]; target integer; solo_threshold integer; pc integer; i integer;
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
  solo_threshold := CASE WHEN NEW.game_mode = 'd80' THEN 40 ELSE 60 END;

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
    IF s >= solo_threshold AND others_zero THEN
      win_id := ids[i]; win_reason := 'MANDRESY NY LALAO — '||solo_threshold::text||' MANDEHA IRERY'; EXIT;
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
$function$;