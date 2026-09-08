BEGIN;

ALTER TABLE public.info_notifications
  ADD COLUMN IF NOT EXISTS link TEXT;

COMMIT;