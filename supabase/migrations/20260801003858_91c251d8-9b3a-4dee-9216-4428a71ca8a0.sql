CREATE INDEX IF NOT EXISTS idx_games_active_turn_deadline
ON public.games (turn_started_at)
WHERE status = 'in_progress' AND current_turn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_games_active_reveal_deadline
ON public.games (reveal_until)
WHERE status = 'in_progress' AND current_turn IS NULL AND reveal_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ludo_active_turn_deadline
ON public.ludo_games (turn_started_at)
WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_petanque_active_turn_deadline
ON public.petanque_games (turn_started_at)
WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_transactions_pending_created
ON public.transactions (created_at DESC)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_transactions_processed_type_date
ON public.transactions (type, processed_at DESC)
WHERE status IN ('approved', 'rejected', 'completed');

DO $$
BEGIN
  PERFORM cron.unschedule('domino-autoplay-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('ludo-autoplay-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'domino-autoplay-tick',
  '2 seconds',
  $job$
  SELECT net.http_post(
    url := 'https://taucobvazpwzzhmapekh.supabase.co/functions/v1/domino-autoplay',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.settings.anon_key', true)
    ),
    body := '{}'::jsonb
  );
  $job$
);

SELECT cron.schedule(
  'ludo-autoplay-tick',
  '2 seconds',
  $job$
  SELECT net.http_post(
    url := 'https://taucobvazpwzzhmapekh.supabase.co/functions/v1/ludo-autoplay',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.settings.anon_key', true)
    ),
    body := '{}'::jsonb
  );
  $job$
);