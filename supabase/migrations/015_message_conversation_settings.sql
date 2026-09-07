BEGIN;

CREATE TABLE IF NOT EXISTS public.message_conversation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  other_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, other_user_id),
  CHECK (user_id <> other_user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_conversation_settings_user
  ON public.message_conversation_settings(user_id, is_archived, updated_at DESC);

ALTER TABLE public.message_conversation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_conversation_settings_select_own ON public.message_conversation_settings;
CREATE POLICY message_conversation_settings_select_own
  ON public.message_conversation_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS message_conversation_settings_insert_own ON public.message_conversation_settings;
CREATE POLICY message_conversation_settings_insert_own
  ON public.message_conversation_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_id <> other_user_id);

DROP POLICY IF EXISTS message_conversation_settings_update_own ON public.message_conversation_settings;
CREATE POLICY message_conversation_settings_update_own
  ON public.message_conversation_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND user_id <> other_user_id);

DROP POLICY IF EXISTS message_conversation_settings_delete_own ON public.message_conversation_settings;
CREATE POLICY message_conversation_settings_delete_own
  ON public.message_conversation_settings FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_conversation_settings TO authenticated;

COMMIT;
