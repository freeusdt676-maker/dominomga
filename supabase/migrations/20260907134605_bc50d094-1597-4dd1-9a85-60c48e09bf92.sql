CREATE OR REPLACE FUNCTION public.admin_set_bot_skill(_level integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  IF _level NOT IN (40, 50, 60, 70, 80, 90, 100) THEN
    RAISE EXCEPTION 'invalid_level';
  END IF;
  INSERT INTO public.app_internal_config (key, value, updated_at)
  VALUES ('bot_skill', _level::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN true;
END;
$function$;