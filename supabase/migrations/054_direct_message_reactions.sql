BEGIN;

CREATE TABLE IF NOT EXISTS public.direct_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

ALTER TABLE public.direct_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS direct_message_reactions_select_participants ON public.direct_message_reactions;
CREATE POLICY direct_message_reactions_select_participants
  ON public.direct_message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.direct_messages message
      WHERE message.id = message_id
        AND (auth.uid() = message.sender_id OR auth.uid() = message.recipient_id)
    )
  );

DROP POLICY IF EXISTS direct_message_reactions_insert_own ON public.direct_message_reactions;
CREATE POLICY direct_message_reactions_insert_own
  ON public.direct_message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS direct_message_reactions_update_own ON public.direct_message_reactions;
CREATE POLICY direct_message_reactions_update_own
  ON public.direct_message_reactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS direct_message_reactions_delete_own ON public.direct_message_reactions;
CREATE POLICY direct_message_reactions_delete_own
  ON public.direct_message_reactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS direct_message_reactions_message_idx
  ON public.direct_message_reactions (message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_message_reactions TO authenticated;

COMMIT;
