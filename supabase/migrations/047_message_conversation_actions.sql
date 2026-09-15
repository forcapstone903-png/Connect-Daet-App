BEGIN;

ALTER TABLE public.message_conversation_settings
  ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_message_conversation_settings_visible
  ON public.message_conversation_settings(user_id, is_deleted, is_archived, updated_at DESC);

COMMIT;
