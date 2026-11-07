BEGIN;

CREATE TABLE IF NOT EXISTS public.site_maintenance_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL DEFAULT 'We are currently performing scheduled maintenance. Please check back soon.',
  updated_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT site_maintenance_message_length CHECK (length(message) BETWEEN 1 AND 500)
);

INSERT INTO public.site_maintenance_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_maintenance_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_maintenance_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.site_maintenance_settings TO service_role;

COMMIT;
