DROP VIEW IF EXISTS public.profiles_public;

CREATE OR REPLACE FUNCTION public.get_public_profiles(_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  mvola_name text,
  avatar_url text,
  selfie_url text,
  is_online boolean,
  last_seen timestamptz,
  player_number integer,
  phone_masked text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.user_id, p.mvola_name, p.avatar_url, p.selfie_url, p.is_online, p.last_seen,
         p.player_number, public.mask_phone(p.phone)
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.user_id = ANY(_ids);
$$;

REVOKE ALL ON FUNCTION public.get_public_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO authenticated;