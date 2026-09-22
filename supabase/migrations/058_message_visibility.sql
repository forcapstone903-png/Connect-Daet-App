BEGIN;

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS deleted_for UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_direct_messages_deleted_for
  ON public.direct_messages USING GIN (deleted_for);

COMMIT;