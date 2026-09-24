BEGIN;

ALTER TABLE public.pinned_messages
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES public.info_users(id) ON DELETE CASCADE;

UPDATE public.pinned_messages
SET actor_user_id = pinned_by
WHERE actor_user_id IS NULL;

ALTER TABLE public.pinned_messages
  ALTER COLUMN actor_user_id SET NOT NULL;

ALTER TABLE public.pinned_messages
  DROP CONSTRAINT IF EXISTS pinned_messages_message_id_fkey;

CREATE TABLE IF NOT EXISTS public.pinned_message_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL,
  message_id UUID NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('pinned', 'unpinned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pinned_message_activity
  DROP CONSTRAINT IF EXISTS pinned_message_activity_message_id_fkey;

CREATE INDEX IF NOT EXISTS idx_pinned_message_activity_conversation
  ON public.pinned_message_activity(conversation_id, created_at ASC);

ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_message_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pinned_messages_insert_participant ON public.pinned_messages;
CREATE POLICY pinned_messages_insert_participant
  ON public.pinned_messages FOR INSERT
  WITH CHECK (auth.uid() = pinned_by AND auth.uid() = actor_user_id);

DROP POLICY IF EXISTS pinned_message_activity_select_participant ON public.pinned_message_activity;
CREATE POLICY pinned_message_activity_select_participant
  ON public.pinned_message_activity FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.direct_messages message
    WHERE message.id = message_id
      AND (auth.uid() = message.sender_id OR auth.uid() = message.recipient_id)
  ));

DROP POLICY IF EXISTS pinned_message_activity_insert_actor ON public.pinned_message_activity;
CREATE POLICY pinned_message_activity_insert_actor
  ON public.pinned_message_activity FOR INSERT
  WITH CHECK (
    auth.uid() = actor_user_id
    AND EXISTS (
      SELECT 1 FROM public.direct_messages message
      WHERE message.id = message_id
        AND (auth.uid() = message.sender_id OR auth.uid() = message.recipient_id)
    )
  );

GRANT SELECT, INSERT ON public.pinned_message_activity TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pinned_message_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_message_activity;
  END IF;
END $$;

COMMIT;