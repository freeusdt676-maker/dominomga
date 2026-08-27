CREATE OR REPLACE FUNCTION public.lobby_admin_sender_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.sender_id
  FROM public.lobby_messages m
  JOIN public.user_roles r ON r.user_id = m.sender_id AND r.role = 'admin';
$$;
REVOKE ALL ON FUNCTION public.lobby_admin_sender_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lobby_admin_sender_ids() TO authenticated, service_role;