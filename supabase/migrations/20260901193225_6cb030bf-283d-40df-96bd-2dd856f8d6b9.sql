-- Fafana ny log cron efa nangona (12 GB!) — io no antony niraiketana ny base.
TRUNCATE cron.job_run_details;

-- Fanadiovana mandeha ho azy isan'andro: tazony 24h farany ihany ny log.
SELECT cron.unschedule('purge-cron-logs-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-cron-logs-daily');
SELECT cron.schedule(
  'purge-cron-logs-daily',
  '15 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '1 day'$$
);