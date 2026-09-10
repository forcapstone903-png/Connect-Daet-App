BEGIN;

ALTER TABLE public.info_notifications
  ADD COLUMN IF NOT EXISTS post_owner_id UUID;

COMMIT;
