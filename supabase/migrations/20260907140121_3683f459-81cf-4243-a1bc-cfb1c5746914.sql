ALTER TABLE public.virtual_players
  ADD COLUMN IF NOT EXISTS name_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_rename_at timestamptz NOT NULL DEFAULT (now() + (random() * interval '36 hours'));