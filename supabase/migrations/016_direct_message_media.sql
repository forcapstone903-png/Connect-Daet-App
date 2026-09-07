BEGIN;

ALTER TABLE public.direct_messages
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT;

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_body_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_body_or_media_check
  CHECK (
    (body IS NOT NULL AND char_length(trim(body)) BETWEEN 1 AND 2000)
    OR media_url IS NOT NULL
  );

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_media_type_check
  CHECK (media_type IS NULL OR media_type IN ('image', 'video'));

COMMIT;
