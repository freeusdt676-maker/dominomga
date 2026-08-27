CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, mvola_name, phone, birth_date, gender, selfie_url, password_plain, pin_plain, avatar_url, account_status, approved_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'mvola_name', 'Joueur'),
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, ''),
    NULLIF(NEW.raw_user_meta_data->>'birth_date','')::date,
    NULLIF(NEW.raw_user_meta_data->>'gender','')::public.gender,
    NULL,
    NULLIF(NEW.raw_user_meta_data->>'password_plain',''),
    NULLIF(NEW.raw_user_meta_data->>'pin_plain',''),
    NULL,
    'active'::public.account_status,
    now()
  );
  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 0);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'player');
  RETURN NEW;
END;
$function$;

ALTER TABLE public.profiles ALTER COLUMN account_status SET DEFAULT 'active'::public.account_status;

UPDATE public.profiles SET selfie_url = NULL, avatar_url = NULL WHERE selfie_url IS NOT NULL OR avatar_url IS NOT NULL;
UPDATE public.profile_change_requests SET proposed_selfie_url = NULL WHERE proposed_selfie_url IS NOT NULL;