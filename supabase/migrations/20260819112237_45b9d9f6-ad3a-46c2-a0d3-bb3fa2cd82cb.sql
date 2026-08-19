CREATE TABLE IF NOT EXISTS public.app_internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.app_internal_config FROM anon, authenticated;
GRANT ALL ON public.app_internal_config TO service_role;
ALTER TABLE public.app_internal_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_internal_config(key, value)
VALUES ('push_hook_secret', 'ab5104106701af8653ce3942861bb1f9e2edd605b48ba7d80aa908baad937c6f')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.notify_push(
  _audience text,
  _user_id uuid,
  _title text,
  _body text,
  _url text DEFAULT '/',
  _tag text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  payload jsonb;
  secret text;
BEGIN
  SELECT value INTO secret FROM public.app_internal_config WHERE key = 'push_hook_secret';
  payload := jsonb_build_object(
    'audience', _audience,
    'user_id', _user_id,
    'title', _title,
    'body', _body,
    'url', _url,
    'tag', _tag
  );
  PERFORM extensions.http_post(
    url := 'https://taucobvazpwzzhmapekh.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', COALESCE(secret, '')),
    body := payload
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'notify_push failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_push(text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;