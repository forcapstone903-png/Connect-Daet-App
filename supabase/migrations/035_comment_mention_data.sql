BEGIN;

ALTER TABLE public.content_comments
  ADD COLUMN IF NOT EXISTS mention_data JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.info_comments
  ADD COLUMN IF NOT EXISTS mention_data JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';

COMMIT;
