BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_app_settings (
  id TEXT PRIMARY KEY CHECK (
    id IN ('general', 'moderation', 'announcement')
  ),
  value JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(value) = 'object'),
  updated_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_app_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_app_settings TO service_role;

ALTER TABLE public.user_storage_objects
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS content_type TEXT;

COMMIT;
