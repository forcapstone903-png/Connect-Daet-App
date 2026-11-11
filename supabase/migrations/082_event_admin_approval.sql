BEGIN;

ALTER TABLE public.info_events
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DO $$
BEGIN
  ALTER TABLE public.info_events
    ADD CONSTRAINT info_events_approval_status_check
    CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

UPDATE public.info_events
SET approval_status = CASE WHEN status = 'published' THEN 'approved' ELSE 'draft' END,
    submitted_at = CASE WHEN status = 'published' THEN COALESCE(published_at, created_at) ELSE NULL END
WHERE submitted_at IS NULL
  AND reviewed_at IS NULL
  AND rejection_reason IS NULL;

CREATE TABLE IF NOT EXISTS public.event_moderation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.info_events(id) ON DELETE SET NULL,
  event_title TEXT NOT NULL,
  event_author_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS info_events_approval_status_submitted_at_idx
  ON public.info_events (approval_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS event_moderation_history_created_at_idx
  ON public.event_moderation_history (created_at DESC);

ALTER TABLE public.event_moderation_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_moderation_history FROM anon, authenticated;
GRANT ALL ON public.event_moderation_history TO service_role;

DROP POLICY IF EXISTS info_events_select_public ON public.info_events;
CREATE POLICY info_events_select_public
  ON public.info_events FOR SELECT
  USING (
    (
      (status = 'published' AND approval_status = 'approved')
      OR auth.uid() = created_by
      OR public.is_admin(auth.uid())
    )
    AND public.can_view_account_content(created_by)
  );

DROP POLICY IF EXISTS info_events_insert_own_or_admin ON public.info_events;
CREATE POLICY info_events_insert_own_or_admin
  ON public.info_events FOR INSERT
  WITH CHECK (
    (
      auth.uid() IS NOT NULL
      AND created_by = auth.uid()
      AND status = 'draft'
      AND approval_status IN ('draft', 'pending')
    )
    OR public.is_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.guard_user_event_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Only the event owner or an administrator can edit this event';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'Event approval fields can only be changed by an administrator';
  END IF;

  IF OLD.approval_status = 'approved' AND (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.venue IS DISTINCT FROM OLD.venue
    OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.start_time IS DISTINCT FROM OLD.start_time
    OR NEW.end_time IS DISTINCT FROM OLD.end_time
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.organizer IS DISTINCT FROM OLD.organizer
    OR NEW.is_free IS DISTINCT FROM OLD.is_free
    OR NEW.ticket_price IS DISTINCT FROM OLD.ticket_price
    OR NEW.featured_image IS DISTINCT FROM OLD.featured_image
    OR NEW.images IS DISTINCT FROM OLD.images
    OR NEW.videos IS DISTINCT FROM OLD.videos
  ) THEN
    NEW.status := 'draft';
    NEW.approval_status := 'pending';
    NEW.submitted_at := NOW();
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.rejection_reason := NULL;
    NEW.published_at := NULL;
  ELSIF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    NEW.status := 'draft';
    NEW.published_at := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS info_events_guard_user_moderation ON public.info_events;
CREATE TRIGGER info_events_guard_user_moderation
  BEFORE UPDATE ON public.info_events
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_user_event_moderation();

CREATE OR REPLACE FUNCTION public.moderate_info_event(
  p_event_id UUID,
  p_reviewer_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  event_row public.info_events%ROWTYPE;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Administrator service access is required';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid moderation decision';
  END IF;

  IF p_reviewer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.info_users
    WHERE id = p_reviewer_id AND user_type IN ('admin', 'administrator')
  ) THEN
    RAISE EXCEPTION 'The reviewer must be an administrator';
  END IF;

  IF p_decision = 'rejected' AND cleaned_reason IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;
  IF length(cleaned_reason) > 1000 THEN
    RAISE EXCEPTION 'Rejection reasons must be 1,000 characters or fewer';
  END IF;

  SELECT * INTO event_row
  FROM public.info_events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF event_row.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Event is no longer pending approval';
  END IF;

  UPDATE public.info_events
  SET approval_status = p_decision,
      status = CASE WHEN p_decision = 'approved' THEN 'published' ELSE 'draft' END,
      published_at = CASE WHEN p_decision = 'approved' THEN NOW() ELSE NULL END,
      reviewed_at = NOW(),
      reviewed_by = p_reviewer_id,
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN cleaned_reason ELSE NULL END,
      updated_at = NOW()
  WHERE id = p_event_id
  RETURNING * INTO event_row;

  INSERT INTO public.event_moderation_history (
    event_id, event_title, event_author_id, reviewed_by, action, reason
  )
  VALUES (
    event_row.id, event_row.title, event_row.created_by, p_reviewer_id,
    p_decision, CASE WHEN p_decision = 'rejected' THEN cleaned_reason ELSE NULL END
  );

  IF event_row.created_by IS NOT NULL THEN
    INSERT INTO public.info_notifications (user_id, title, message, type, is_read, created_at, updated_at)
    VALUES (
      event_row.created_by,
      CASE WHEN p_decision = 'approved' THEN 'Event approved' ELSE 'Event rejected' END,
      CASE
        WHEN p_decision = 'approved'
          THEN format('Your event "%s" was approved and is now public.', event_row.title)
        ELSE format('Your event "%s" was rejected. Reason: %s', event_row.title, cleaned_reason)
      END,
      'info', FALSE, NOW(), NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'id', event_row.id,
    'created_by', event_row.created_by,
    'title', event_row.title,
    'approval_status', event_row.approval_status,
    'status', event_row.status,
    'submitted_at', event_row.submitted_at,
    'reviewed_at', event_row.reviewed_at,
    'reviewed_by', event_row.reviewed_by,
    'rejection_reason', event_row.rejection_reason,
    'published_at', event_row.published_at
  );
END
$$;

REVOKE ALL ON FUNCTION public.moderate_info_event(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_info_event(UUID, UUID, TEXT, TEXT) TO service_role;

COMMIT;
