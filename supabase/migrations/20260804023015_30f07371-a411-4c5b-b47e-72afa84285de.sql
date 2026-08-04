DO $migration$
DECLARE r record; definition text; marker_pos integer; header text; body text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND pg_get_functiondef(p.oid) LIKE '%2583%'
  LOOP
    definition:=pg_get_functiondef(r.oid);
    definition:=regexp_replace(definition,E'\\n[[:space:]]*IF[[:space:]]+(_pin|_admin_pin)[[:space:]]+(<>|IS DISTINCT FROM)[[:space:]]+''2583''[[:space:]]+THEN[[:space:]]+RAISE EXCEPTION ''[^'']+'';[[:space:]]+END IF;','', 'gi');
    EXECUTE definition;
  END LOOP;

  FOR r IN
    SELECT p.oid,p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('admin_cancel_domino_game','admin_cancel_ludo_game','admin_cancel_petanque_game')
  LOOP
    definition:=pg_get_functiondef(r.oid);
    definition:=replace(definition,'public.has_role(_admin_id,''admin'')','public.has_role(auth.uid(),''admin'')');
    definition:=replace(definition,', now(), _admin_id);',', now(), auth.uid());');
    definition:=replace(definition,',now(),_admin_id);',',now(),auth.uid());');
    EXECUTE definition;
  END LOOP;
END $migration$;