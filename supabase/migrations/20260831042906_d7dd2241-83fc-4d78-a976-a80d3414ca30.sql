CREATE TABLE IF NOT EXISTS public.virtual_players (
  user_id uuid PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  online boolean NOT NULL DEFAULT false,
  online_until timestamptz,
  busy_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.virtual_players TO authenticated;
GRANT ALL ON public.virtual_players TO service_role;

ALTER TABLE public.virtual_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view virtual players" ON public.virtual_players;
CREATE POLICY "Admins can view virtual players"
ON public.virtual_players FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_virtual_players_updated_at ON public.virtual_players;
CREATE TRIGGER trg_virtual_players_updated_at
BEFORE UPDATE ON public.virtual_players
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_virtual_players_online ON public.virtual_players (online, active);

-- Fund a virtual wallet (system money, never a real player's money)
CREATE OR REPLACE FUNCTION public.virtual_topup(_user uuid, _min numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.virtual_players WHERE user_id = _user) THEN
    RAISE EXCEPTION 'not_virtual';
  END IF;
  PERFORM public.allow_wallet_mutation();
  UPDATE public.wallets SET balance = GREATEST(balance, _min), updated_at = now() WHERE user_id = _user;
END $$;
REVOKE ALL ON FUNCTION public.virtual_topup(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.virtual_topup(uuid, numeric) TO service_role;

-- Mark virtual players online/offline (mirrors the same fields real players use)
CREATE OR REPLACE FUNCTION public.virtual_set_online(_ids uuid[], _online boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles p
  SET is_online = _online,
      last_seen = CASE WHEN _online THEN now() ELSE p.last_seen END,
      updated_at = now()
  WHERE p.user_id = ANY(_ids)
    AND EXISTS (SELECT 1 FROM public.virtual_players v WHERE v.user_id = p.user_id);
END $$;
REVOKE ALL ON FUNCTION public.virtual_set_online(uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.virtual_set_online(uuid[], boolean) TO service_role;

-- Merged online list (real + virtual are indistinguishable to players)
CREATE OR REPLACE FUNCTION public.list_online_players()
RETURNS TABLE(user_id uuid, name text, phone_masked text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.mvola_name, public.mask_phone(p.phone)
  FROM public.profiles p
  WHERE p.is_online = true
    AND p.last_seen > now() - interval '3 minutes'
    AND p.account_status = 'active'
  ORDER BY p.mvola_name
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.list_online_players() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_online_players() TO authenticated;