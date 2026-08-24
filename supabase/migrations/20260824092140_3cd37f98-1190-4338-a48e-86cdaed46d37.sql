ALTER TABLE public.crash_rounds REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crash_rounds;