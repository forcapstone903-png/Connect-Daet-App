BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'direct_messages'
      AND column_name = 'message_type'
  ) THEN
    ALTER TABLE public.direct_messages
      ALTER COLUMN message_type SET DEFAULT 'text';

    ALTER TABLE public.direct_messages
      DROP CONSTRAINT IF EXISTS direct_messages_message_type_check;

    ALTER TABLE public.direct_messages
      ADD CONSTRAINT direct_messages_message_type_check
      CHECK (message_type IN ('text', 'image', 'video', 'gif', 'sticker'));
  ELSE
    ALTER TABLE public.direct_messages
      ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';

    ALTER TABLE public.direct_messages
      DROP CONSTRAINT IF EXISTS direct_messages_message_type_check;

    ALTER TABLE public.direct_messages
      ADD CONSTRAINT direct_messages_message_type_check
      CHECK (message_type IN ('text', 'image', 'video', 'gif', 'sticker'));
  END IF;
END $$;

COMMIT;