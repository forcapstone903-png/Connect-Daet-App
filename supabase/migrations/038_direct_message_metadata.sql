BEGIN;

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
