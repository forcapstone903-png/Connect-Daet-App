BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_chat_messages_created_at_idx
  ON public.staff_chat_messages (created_at DESC);

ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_chat_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.staff_chat_messages TO service_role;

COMMIT;
