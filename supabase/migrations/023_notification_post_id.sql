BEGIN;

ALTER TABLE public.info_notifications
  ADD COLUMN IF NOT EXISTS post_id UUID;

COMMIT;
