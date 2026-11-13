BEGIN;

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';

ALTER TABLE public.direct_messages
  ALTER COLUMN message_type SET DEFAULT 'text';

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_message_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'video', 'gif', 'sticker'));

COMMIT;
