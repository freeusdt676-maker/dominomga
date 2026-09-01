INSERT INTO public.app_internal_config (key, value) VALUES ('bot_skill', '80') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_set_bot_skill(_level integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  IF _level NOT IN (50, 60, 70, 80, 100) THEN
    RAISE EXCEPTION 'invalid_level';
  END IF;
  INSERT INTO public.app_internal_config (key, value, updated_at)
  VALUES ('bot_skill', _level::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN true;
END;
$$;