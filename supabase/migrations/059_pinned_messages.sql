BEGIN;

CREATE TABLE IF NOT EXISTS public.pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL,
  message_id UUID NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_messages_conversation
  ON public.pinned_messages(conversation_id, pinned_at DESC);

ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pinned_messages_select_participant ON public.pinned_messages;
CREATE POLICY pinned_messages_select_participant
  ON public.pinned_messages FOR SELECT
  USING (auth.uid() = pinned_by OR EXISTS (
    SELECT 1 FROM public.direct_messages message
    WHERE message.id = message_id
      AND (auth.uid() = message.sender_id OR auth.uid() = message.recipient_id)
  ));

DROP POLICY IF EXISTS pinned_messages_insert_participant ON public.pinned_messages;
CREATE POLICY pinned_messages_insert_participant
  ON public.pinned_messages FOR INSERT
  WITH CHECK (auth.uid() = pinned_by);

DROP POLICY IF EXISTS pinned_messages_delete_pinner ON public.pinned_messages;
CREATE POLICY pinned_messages_delete_pinner
  ON public.pinned_messages FOR DELETE
  USING (auth.uid() = pinned_by OR EXISTS (
    SELECT 1 FROM public.direct_messages message
    WHERE message.id = message_id
      AND (auth.uid() = message.sender_id OR auth.uid() = message.recipient_id)
  ));

GRANT SELECT, INSERT, DELETE ON public.pinned_messages TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pinned_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages;
  END IF;
END $$;

COMMIT;