SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'storage-cleanup-daily';
SELECT cron.schedule(
  'storage-cleanup-daily',
  '20 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://taucobvazpwzzhmapekh.supabase.co/functions/v1/storage-cleanup',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);