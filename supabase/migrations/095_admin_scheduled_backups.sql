BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_backup_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  retention_days INTEGER NOT NULL DEFAULT 7 CHECK (retention_days BETWEEN 1 AND 365),
  include_media BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.admin_backup_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_backup_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_backup_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_backup_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.admin_backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
  scheduled_for DATE,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  storage_path TEXT,
  media_object_count INTEGER NOT NULL DEFAULT 0 CHECK (media_object_count >= 0),
  total_bytes BIGINT NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  CHECK ((trigger_type = 'scheduled' AND scheduled_for IS NOT NULL) OR trigger_type = 'manual')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_backup_runs_scheduled_for
  ON public.admin_backup_runs (scheduled_for)
  WHERE scheduled_for IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_backup_runs_single_running
  ON public.admin_backup_runs (status)
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_admin_backup_runs_started_at
  ON public.admin_backup_runs (started_at DESC);

ALTER TABLE public.admin_backup_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_backup_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_backup_runs TO service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('admin-backups', 'admin-backups', FALSE),
  ('profile-media', 'profile-media', TRUE),
  ('blogs', 'blogs', TRUE),
  ('events', 'events', TRUE),
  ('tourist-spots', 'tourist-spots', TRUE)
ON CONFLICT (id) DO NOTHING;

COMMIT;
