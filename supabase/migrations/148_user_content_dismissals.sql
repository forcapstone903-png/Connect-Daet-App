BEGIN;

CREATE TABLE IF NOT EXISTS public.user_content_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('person', 'story', 'place', 'event')),
  content_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content_type, content_id)
);

ALTER TABLE public.user_content_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_content_dismissals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_content_dismissals TO service_role;

COMMIT;
