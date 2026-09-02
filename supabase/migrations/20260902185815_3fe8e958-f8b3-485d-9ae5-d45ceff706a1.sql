CREATE OR REPLACE FUNCTION public.virtual_online_players()
RETURNS TABLE(name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT vp.name FROM public.virtual_players vp
  WHERE vp.active AND vp.online AND (vp.online_until IS NULL OR vp.online_until > now())
  ORDER BY vp.name;
$$;
GRANT EXECUTE ON FUNCTION public.virtual_online_players() TO authenticated, anon;