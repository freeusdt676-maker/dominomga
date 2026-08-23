ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_stake_check;
ALTER TABLE public.games ADD CONSTRAINT games_stake_check CHECK (stake >= 200 AND stake <= 100000);