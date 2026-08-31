
ALTER TABLE public.virtual_players
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'expert',
  ADD COLUMN IF NOT EXISTS games_played integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wins integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.admin_list_virtual_players()
RETURNS TABLE(
  user_id uuid, name text, phone text, level text, active boolean, online boolean,
  status text, game_id uuid, games_played integer, wins integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    vp.user_id, vp.name, vp.phone, vp.level, vp.active, vp.online,
    CASE
      WHEN g.id IS NOT NULL AND g.status = 'in_progress' THEN 'en_partie'
      WHEN g.id IS NOT NULL AND g.status = 'waiting' THEN 'dans_un_lobby'
      WHEN vp.online THEN 'en_attente'
      ELSE 'offline'
    END AS status,
    g.id AS game_id,
    vp.games_played, vp.wins
  FROM public.virtual_players vp
  LEFT JOIN LATERAL (
    SELECT gg.id, gg.status::text
    FROM public.games gg
    WHERE gg.status IN ('waiting','in_progress')
      AND (gg.player1_id = vp.user_id OR gg.player2_id = vp.user_id OR gg.player3_id = vp.user_id)
    ORDER BY gg.created_at DESC
    LIMIT 1
  ) g ON true
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY vp.online DESC, vp.name;
$$;

REVOKE ALL ON FUNCTION public.admin_list_virtual_players() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_virtual_players() TO authenticated;

SELECT cron.unschedule('virtual-players-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'virtual-players-tick');

SELECT cron.schedule(
  'virtual-players-tick',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://taucobvazpwzzhmapekh.supabase.co/functions/v1/virtual-players',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $job$
);
