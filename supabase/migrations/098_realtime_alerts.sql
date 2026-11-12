-- 098: Real-time alert broadcasts and secured push delivery (Phase 3)
--
--   alert_categories   weather, traffic, emergency, ... (public, admin-editable)
--   alerts             one broadcast: draft -> scheduled -> sent -> (all clear)
--                      or cancelled; delivery and push counters
--   alert_templates    reusable wording for common situations
--   alert_preferences  which categories a registered user wants
--   push_subscriptions now also holds guest devices (user_id NULL) and the
--                      categories that device opted in to
--   info_notifications alert_id links each inbox copy to its alert, so
--                      "reach" = recipients who opened it (is_read)
--
-- Delivery: deliver_alert() writes every recipient's inbox row in one INSERT,
-- marks the alert sent, then makes ONE call to the push Edge Function, which
-- sends to users' and guests' devices and writes back sent/failed counts.
-- Scheduled alerts are picked up every minute by pg_cron (deliver_due_alerts).
--
-- SECURITY FIX: the push webhook (039/044) authenticated with the public anon
-- key, so anyone could call the Edge Function and push arbitrary text and
-- links to any user. Calls now carry a shared secret stored in Supabase Vault
-- and the function rejects requests without it. See docs/alerts.md (setup).

BEGIN;

-- ------------------------------------------------------------------
-- 1. Categories
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_categories (
  slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9_]{1,30}$'),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'bell',
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.alert_categories (slug, name, description, icon, sort_order) VALUES
  ('emergency', 'Emergency', 'Evacuations, fires, earthquakes and other immediate dangers', 'siren', 10),
  ('weather', 'Weather', 'Typhoon signals, heavy rain, flooding and storm surge', 'cloud-rain', 20),
  ('sea', 'Sea & Beach', 'High surf, rip currents and swimming or surfing advisories', 'waves', 30),
  ('traffic', 'Traffic & Roads', 'Road closures, re-routing and transport disruptions', 'traffic-cone', 40),
  ('utilities', 'Power & Water', 'Scheduled or unplanned power and water interruptions', 'zap', 50),
  ('health', 'Health', 'Public health advisories', 'heart-pulse', 60),
  ('event', 'Events', 'Festival schedules, crowd and venue advisories', 'calendar', 70)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------------
-- 2. Alerts
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 3 AND 2000),
  category TEXT NOT NULL REFERENCES public.alert_categories(slug) ON UPDATE CASCADE,
  severity TEXT NOT NULL DEFAULT 'advisory' CHECK (severity IN ('info', 'advisory', 'warning', 'critical')),
  affected_area TEXT NOT NULL DEFAULT '',
  barangays TEXT[] NOT NULL DEFAULT '{}',
  audience TEXT NOT NULL DEFAULT 'category' CHECK (audience IN ('all', 'category')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  all_clear_at TIMESTAMPTZ,
  all_clear_message TEXT,
  edited_after_send BOOLEAN NOT NULL DEFAULT FALSE,
  template_id UUID,
  recipients_inbox INTEGER NOT NULL DEFAULT 0,
  push_attempted INTEGER NOT NULL DEFAULT 0,
  push_sent INTEGER NOT NULL DEFAULT 0,
  push_failed INTEGER NOT NULL DEFAULT 0,
  push_removed INTEGER NOT NULL DEFAULT 0,
  guest_push_sent INTEGER NOT NULL DEFAULT 0,
  push_completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alerts_schedule_required CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL),
  CONSTRAINT alerts_expiry_after_send CHECK (expires_at IS NULL OR sent_at IS NULL OR expires_at > sent_at)
);

CREATE INDEX IF NOT EXISTS alerts_status_scheduled_idx ON public.alerts (status, scheduled_for);
CREATE INDEX IF NOT EXISTS alerts_sent_at_idx ON public.alerts (sent_at DESC) WHERE sent_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.alert_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 80),
  category TEXT NOT NULL REFERENCES public.alert_categories(slug) ON UPDATE CASCADE,
  severity TEXT NOT NULL DEFAULT 'advisory' CHECK (severity IN ('info', 'advisory', 'warning', 'critical')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 3 AND 2000),
  affected_area TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_template_id_fkey,
  ADD CONSTRAINT alerts_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.alert_templates(id) ON DELETE SET NULL;

INSERT INTO public.alert_templates (name, category, severity, title, message, affected_area) VALUES
  ('Typhoon signal raised', 'weather', 'warning',
   'Tropical Cyclone Wind Signal No. [X] raised over Camarines Norte',
   'PAGASA has raised Signal No. [X]. Secure loose objects, charge phones, and prepare a go-bag. Follow instructions from the MDRRMO. Avoid the beach and coastal roads.',
   'All of Daet'),
  ('High surf / rip currents', 'sea', 'warning',
   'High surf and rip currents at Bagasbas Beach',
   'Waves of [X] m expected today. Swimming is not allowed. Surfing is for experienced surfers only, with a buddy. Follow lifeguards and red flags.',
   'Bagasbas Beach'),
  ('Road closure', 'traffic', 'advisory',
   'Road closure: [road name]',
   '[Road] will be closed from [time] to [time] for [reason]. Please use [alternate route]. Expect heavier traffic nearby.',
   ''),
  ('Power interruption', 'utilities', 'advisory',
   'Scheduled power interruption on [date]',
   'CANORECO has announced a power interruption from [time] to [time] for maintenance. Affected: [areas].',
   ''),
  ('Evacuation order', 'emergency', 'critical',
   'Evacuation order for [area]',
   'Residents and visitors in [area] must evacuate now to [evacuation center]. Bring essentials only. For assistance call the MDRRMO hotline [number].',
   ''),
  ('Festival crowd advisory', 'event', 'info',
   '[Festival] crowd and parking advisory',
   'Expect large crowds around [venue] from [time]. Parking is available at [location]. Keep valuables secure and stay hydrated.',
   '')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.alert_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.info_users(id) ON DELETE CASCADE,
  categories TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inbox link and guest devices
ALTER TABLE public.info_notifications
  ADD COLUMN IF NOT EXISTS alert_id UUID REFERENCES public.alerts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS info_notifications_alert_id_idx
  ON public.info_notifications (alert_id, type) WHERE alert_id IS NOT NULL;

ALTER TABLE public.push_subscriptions
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS alert_categories TEXT[],
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS push_subscriptions_guest_idx
  ON public.push_subscriptions (created_at) WHERE user_id IS NULL;

-- ------------------------------------------------------------------
-- 3. Access
--    Public: categories and alerts that have been sent (including ones later
--    withdrawn, so a shared link explains what happened). Staff write through
--    the service-role API only.
-- ------------------------------------------------------------------
ALTER TABLE public.alert_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alert_categories_public_read ON public.alert_categories;
CREATE POLICY alert_categories_public_read ON public.alert_categories FOR SELECT USING (is_active);

DROP POLICY IF EXISTS alerts_public_read ON public.alerts;
CREATE POLICY alerts_public_read ON public.alerts FOR SELECT USING (sent_at IS NOT NULL);

DROP POLICY IF EXISTS alert_preferences_own ON public.alert_preferences;
CREATE POLICY alert_preferences_own ON public.alert_preferences FOR SELECT USING (auth.uid() = user_id);

REVOKE ALL ON public.alert_categories, public.alerts, public.alert_templates, public.alert_preferences FROM anon, authenticated;
GRANT SELECT ON public.alert_categories TO anon, authenticated;
-- Column-level grant: staff ids and delivery counters stay private.
GRANT SELECT (id, title, message, category, severity, affected_area, barangays, status, sent_at,
              expires_at, cancelled_at, cancel_reason, all_clear_at, all_clear_message,
              edited_after_send, updated_at)
  ON public.alerts TO anon, authenticated;
GRANT SELECT ON public.alert_preferences TO authenticated;
GRANT ALL ON public.alert_categories, public.alerts, public.alert_templates, public.alert_preferences TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
  END IF;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE '098: supabase_realtime publication not found; live alert updates disabled.';
END $$;

-- ------------------------------------------------------------------
-- 4. Secured call to the push Edge Function
--    Reads the function URL and shared secret from Supabase Vault:
--      select vault.create_secret('https://<ref>.supabase.co/functions/v1/push', 'push_function_url');
--      select vault.create_secret('<random 32+ chars>', 'push_webhook_secret');
--    Never raises: a push outage must not block saving notifications.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_push_dispatch(p_body jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'push_function_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL OR length(v_secret) < 32 THEN
    RAISE NOTICE 'Push dispatch skipped: push_function_url / push_webhook_secret are not set in Vault.';
    RETURN false;
  END IF;

  PERFORM net.http_post(
    v_url,
    p_body,
    '{}'::jsonb,
    jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    5000
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push dispatch failed: %', SQLERRM;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.request_push_dispatch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_push_dispatch(jsonb) TO service_role;

-- Replaces 044: same payload, but secret-authenticated and no hard-coded key.
CREATE OR REPLACE FUNCTION public.invoke_push_edge_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.request_push_dispatch(jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'url', NEW.url,
      'created_at', NEW.created_at
    )
  ));
  RETURN NEW;
END;
$$;

-- Replaces 043: alert inbox rows are pushed in one batch by deliver_alert,
-- so they must not also fan out one HTTP call per recipient.
CREATE OR REPLACE FUNCTION public.bridge_info_notification_to_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.alert_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, url, created_at)
  VALUES (
    NEW.user_id,
    NEW.title,
    NEW.message,
    COALESCE(NEW.link, '/user/notifications'),
    COALESCE(NEW.created_at, NOW())
  );

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------
-- 5. Delivery
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alert_inbox_title(p_severity text, p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_severity
    WHEN 'critical' THEN 'EMERGENCY: '
    WHEN 'warning' THEN 'Warning: '
    WHEN 'advisory' THEN 'Advisory: '
    ELSE ''
  END || p_title;
$$;

-- Sends one alert now. Only alerts in 'scheduled' are delivered, so a
-- double call (button + cron) cannot send twice.
CREATE OR REPLACE FUNCTION public.deliver_alert(p_alert_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alert public.alerts%ROWTYPE;
  v_count integer;
  v_push boolean;
BEGIN
  SELECT * INTO v_alert FROM public.alerts WHERE id = p_alert_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'alert_not_found';
  END IF;
  IF v_alert.status <> 'scheduled' THEN
    RETURN jsonb_build_object('delivered', false, 'reason', 'status_' || v_alert.status);
  END IF;
  -- A scheduled alert whose expiry has already passed is never sent.
  IF v_alert.expires_at IS NOT NULL AND v_alert.expires_at <= now() THEN
    UPDATE public.alerts
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Expired before its scheduled time.', updated_at = now()
    WHERE id = p_alert_id;
    RETURN jsonb_build_object('delivered', false, 'reason', 'expired');
  END IF;

  -- Recipients: every active account when audience = 'all'; otherwise those
  -- who never set preferences (default = all categories) or chose this one.
  INSERT INTO public.info_notifications (user_id, title, message, type, link, alert_id, is_read, created_at, updated_at)
  SELECT u.id,
         public.alert_inbox_title(v_alert.severity, v_alert.title),
         v_alert.message,
         'alert',
         '/info/visitor/alerts/' || v_alert.id,
         v_alert.id,
         false,
         now(),
         now()
  FROM public.info_users u
  LEFT JOIN public.alert_preferences p ON p.user_id = u.id
  WHERE u.status = 'active'
    AND (v_alert.audience = 'all' OR p.user_id IS NULL OR v_alert.category = ANY (p.categories));
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.alerts
  SET status = 'sent', sent_at = now(), recipients_inbox = v_count, updated_at = now()
  WHERE id = p_alert_id;

  v_push := public.request_push_dispatch(jsonb_build_object('mode', 'alert', 'kind', 'alert', 'alert_id', p_alert_id));

  RETURN jsonb_build_object('delivered', true, 'recipients', v_count, 'push_requested', v_push);
END;
$$;

CREATE OR REPLACE FUNCTION public.deliver_due_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.alerts
    WHERE status = 'scheduled' AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT 20
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.deliver_alert(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- "All clear": closes an active alert and tells the same recipients.
CREATE OR REPLACE FUNCTION public.mark_alert_all_clear(p_alert_id uuid, p_actor_id uuid, p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alert public.alerts%ROWTYPE;
  v_message text := NULLIF(left(trim(COALESCE(p_message, '')), 1000), '');
  v_count integer;
BEGIN
  SELECT * INTO v_alert FROM public.alerts WHERE id = p_alert_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'alert_not_found'; END IF;
  IF v_alert.status <> 'sent' OR v_alert.all_clear_at IS NOT NULL THEN
    RAISE EXCEPTION 'alert_not_active';
  END IF;

  UPDATE public.alerts
  SET all_clear_at = now(),
      all_clear_message = COALESCE(v_message, 'The situation has returned to normal.'),
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = p_alert_id;

  INSERT INTO public.info_notifications (user_id, title, message, type, link, alert_id, is_read, created_at, updated_at)
  SELECT DISTINCT n.user_id,
         'All clear: ' || v_alert.title,
         COALESCE(v_message, 'The situation has returned to normal.'),
         'alert_all_clear',
         '/info/visitor/alerts/' || v_alert.id,
         v_alert.id,
         false,
         now(),
         now()
  FROM public.info_notifications n
  WHERE n.alert_id = p_alert_id AND n.type = 'alert';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.request_push_dispatch(jsonb_build_object('mode', 'alert', 'kind', 'all_clear', 'alert_id', p_alert_id));

  RETURN jsonb_build_object('recipients', v_count);
END;
$$;

-- Delivery and reach numbers for the history table.
CREATE OR REPLACE FUNCTION public.get_alert_reach(p_alert_ids uuid[])
RETURNS TABLE (alert_id uuid, delivered integer, opened integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT n.alert_id,
         count(*)::integer AS delivered,
         count(*) FILTER (WHERE n.is_read)::integer AS opened
  FROM public.info_notifications n
  WHERE n.alert_id = ANY (p_alert_ids) AND n.type = 'alert'
  GROUP BY n.alert_id;
$$;

REVOKE ALL ON FUNCTION public.deliver_alert(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deliver_due_alerts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_alert_all_clear(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_alert_reach(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_alert(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deliver_due_alerts() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_alert_all_clear(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_alert_reach(uuid[]) TO service_role;

COMMIT;

-- ------------------------------------------------------------------
-- 6. Every-minute scheduler (outside the transaction: pg_cron may be absent
--    locally; scheduled alerts then go out via /info/api/cron/alerts or the
--    next time staff open the Alerts page).
-- ------------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'deliver-due-alerts';
  PERFORM cron.schedule('deliver-due-alerts', '* * * * *', 'SELECT public.deliver_due_alerts()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '098: pg_cron unavailable (%); use the cron API fallback for scheduled alerts.', SQLERRM;
END $$;
