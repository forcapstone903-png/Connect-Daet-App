BEGIN;

ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO public.forum_categories (name, description)
VALUES
  ('General', 'General community discussions'),
  ('Local Tips', 'Local recommendations and travel tips'),
  ('Travel Q&A', 'Questions about visiting Daet'),
  ('Safety', 'Travel and community safety'),
  ('Announcements', 'Community announcements'),
  ('Community', 'Community conversations')
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS forum_threads_pinned_activity_idx
  ON public.forum_threads (pinned DESC, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS info_blogs_public_schedule_idx
  ON public.info_blogs (published_at DESC)
  WHERE status = 'published' AND approval_status = 'approved';

UPDATE public.forum_threads AS threads
   SET category_id = categories.id
  FROM public.forum_categories AS categories
 WHERE threads.category_id IS NULL
   AND categories.name = 'General';

CREATE OR REPLACE FUNCTION public.assign_default_forum_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    SELECT id INTO NEW.category_id
      FROM public.forum_categories
     WHERE name = 'General'
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_assign_default_forum_category ON public.forum_threads;
CREATE TRIGGER tr_assign_default_forum_category
BEFORE INSERT ON public.forum_threads
FOR EACH ROW EXECUTE FUNCTION public.assign_default_forum_category();

CREATE TABLE IF NOT EXISTS public.admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE RESTRICT,
  recipient_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Announcement',
  body TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'delivered'
    CHECK (status IN ('scheduled', 'sending', 'delivered', 'failed')),
  delivery_error TEXT,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_messages_schedule_idx
  ON public.admin_messages (status, scheduled_for)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS admin_messages_recipient_idx
  ON public.admin_messages (recipient_user_id, created_at DESC);

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_messages_select_admin
  ON public.admin_messages FOR SELECT
  USING (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()));

ALTER TABLE public.info_notifications
  ADD COLUMN IF NOT EXISTS admin_message_id UUID
    REFERENCES public.admin_messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS info_notifications_admin_message_id_idx
  ON public.info_notifications (admin_message_id)
  WHERE admin_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_admin_message_read_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_read IS TRUE AND OLD.is_read IS DISTINCT FROM TRUE AND NEW.admin_message_id IS NOT NULL THEN
    UPDATE public.admin_messages
       SET read_at = COALESCE(NEW.updated_at, NOW()),
           updated_at = NOW()
     WHERE id = NEW.admin_message_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_admin_message_read_receipt ON public.info_notifications;
CREATE TRIGGER tr_sync_admin_message_read_receipt
AFTER UPDATE OF is_read ON public.info_notifications
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_message_read_receipt();

CREATE OR REPLACE FUNCTION public.claim_due_admin_messages(p_limit INTEGER DEFAULT 100)
RETURNS SETOF public.admin_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id
      FROM public.admin_messages
     WHERE status = 'scheduled'
       AND scheduled_for <= NOW()
     ORDER BY scheduled_for
     LIMIT GREATEST(1, LEAST(p_limit, 500))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.admin_messages AS messages
     SET status = 'sending',
         updated_at = NOW()
    FROM due
   WHERE messages.id = due.id
  RETURNING messages.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_admin_messages(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_admin_messages(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.register_for_event(p_event_id UUID, p_user_id UUID)
RETURNS public.event_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_row public.info_events;
  registration_row public.event_registrations;
BEGIN
  SELECT * INTO event_row
    FROM public.info_events
   WHERE id = p_event_id
     AND status = 'published'
     AND approval_status = 'approved'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This event is not available for registration.';
  END IF;

  IF event_row.max_attendees IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.event_registrations
        WHERE event_id = p_event_id
          AND user_id = p_user_id
          AND status = 'confirmed'
     )
     AND (SELECT count(*) FROM public.event_registrations
           WHERE event_id = p_event_id AND status = 'confirmed') >= event_row.max_attendees THEN
    RAISE EXCEPTION 'This event has reached its registration capacity.';
  END IF;

  INSERT INTO public.event_registrations (event_id, user_id, status)
  VALUES (p_event_id, p_user_id, 'confirmed')
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET status = 'confirmed', updated_at = NOW()
  RETURNING * INTO registration_row;
  RETURN registration_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_event_registration(p_event_id UUID, p_user_id UUID)
RETURNS public.event_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  registration_row public.event_registrations;
BEGIN
  UPDATE public.event_registrations
     SET status = 'cancelled',
         updated_at = NOW()
   WHERE event_id = p_event_id
     AND user_id = p_user_id
  RETURNING * INTO registration_row;
  RETURN registration_row;
END;
$$;

REVOKE ALL ON FUNCTION public.register_for_event(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_event_registration(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_event(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_event_registration(UUID, UUID) TO service_role;

CREATE TABLE IF NOT EXISTS public.event_reminder_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.info_events(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  sent_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'not_configured')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_reminder_deliveries_event_idx
  ON public.event_reminder_deliveries (event_id, created_at DESC);

ALTER TABLE public.event_reminder_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_reminder_deliveries_select_admin
  ON public.event_reminder_deliveries FOR SELECT
  USING (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()));

CREATE TABLE IF NOT EXISTS public.admin_user_bans (
  user_id UUID PRIMARY KEY REFERENCES public.info_users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  banned_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE RESTRICT,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lifted_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  lifted_at TIMESTAMPTZ
);

ALTER TABLE public.admin_user_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_user_bans_select_admin
  ON public.admin_user_bans FOR SELECT
  USING (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()));

CREATE OR REPLACE FUNCTION public.reject_content_from_banned_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL
     OR public.is_admin(current_user_id)
     OR public.is_moderator(current_user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('info_blogs', 'forum_threads')
     AND to_jsonb(NEW)->>'status' = 'draft' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.admin_user_bans
     WHERE user_id = current_user_id
       AND lifted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This account is currently restricted from publishing content.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'info_blogs',
    'info_events',
    'info_user_posts',
    'forum_threads',
    'forum_replies',
    'info_comments',
    'content_comments'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tr_reject_banned_content ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER tr_reject_banned_content BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_content_from_banned_user()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "info_moderation_insert_auth" ON public.info_moderation;
CREATE POLICY info_moderation_insert_own
  ON public.info_moderation FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND reported_by = auth.uid());

DROP POLICY IF EXISTS "forum_categories_select_public" ON public.forum_categories;
CREATE POLICY forum_categories_select_public
  ON public.forum_categories FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "info_blogs_select_public" ON public.info_blogs;
CREATE POLICY "info_blogs_select_public" ON public.info_blogs
FOR SELECT
USING (
  (
    (status = 'published' AND approval_status = 'approved'
      AND (published_at IS NULL OR published_at <= NOW()))
    OR created_by = auth.uid()
    OR public.is_admin(auth.uid())
  )
  AND public.can_view_account_content(created_by)
);

COMMIT;
