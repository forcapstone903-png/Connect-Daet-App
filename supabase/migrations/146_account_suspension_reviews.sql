BEGIN;

CREATE TABLE IF NOT EXISTS public.suspension_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  ban_id UUID NOT NULL REFERENCES public.admin_user_bans(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.info_moderation(id) ON DELETE SET NULL,
  original_suspending_user_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  original_suspending_party TEXT NOT NULL DEFAULT 'system'
    CHECK (original_suspending_party IN ('system', 'moderator', 'staff', 'community_report')),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  original_duration_days INTEGER CHECK (original_duration_days IS NULL OR original_duration_days > 0),
  original_expires_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'modified', 'needs_information', 'cancelled')),
  moderation_notes TEXT CHECK (char_length(moderation_notes) <= 2000),
  reviewed_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  has_user_appeal BOOLEAN NOT NULL DEFAULT FALSE,
  user_appeal_id UUID REFERENCES public.user_moderation_appeals(id) ON DELETE SET NULL,
  new_expires_at TIMESTAMPTZ,
  updated_duration_days INTEGER CHECK (updated_duration_days IS NULL OR updated_duration_days > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS suspension_reviews_status_created_idx
  ON public.suspension_reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS suspension_reviews_user_created_idx
  ON public.suspension_reviews(user_id, created_at DESC);

ALTER TABLE public.suspension_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.suspension_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.suspension_reviews TO service_role;

CREATE TABLE IF NOT EXISTS public.suspension_review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.suspension_reviews(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('uphold', 'lift', 'modify', 'request_info')),
  notes TEXT NOT NULL CHECK (char_length(btrim(notes)) BETWEEN 1 AND 2000),
  account_status_after TEXT NOT NULL CHECK (account_status_after IN ('active', 'suspended')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS suspension_review_history_review_idx
  ON public.suspension_review_history(review_id, recorded_at DESC);

ALTER TABLE public.suspension_review_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.suspension_review_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.suspension_review_history TO service_role;

CREATE OR REPLACE FUNCTION public.create_suspension_review_for_ban()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.ban_type IS DISTINCT FROM 'suspension'
     OR NEW.lifted_at IS NOT NULL
     OR (TG_OP = 'UPDATE' AND NEW.banned_at IS NOT DISTINCT FROM OLD.banned_at) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.suspension_reviews (
    user_id,
    ban_id,
    report_id,
    original_suspending_user_id,
    original_suspending_party,
    reason,
    original_duration_days,
    original_expires_at,
    suspended_at
  )
  VALUES (
    NEW.user_id,
    NEW.id,
    NULL,
    NEW.banned_by,
    'moderator',
    NEW.reason,
    CASE
      WHEN NEW.expires_at IS NULL THEN NULL
      ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (NEW.expires_at - NEW.banned_at)) / 86400)::INTEGER)
    END,
    NEW.expires_at,
    NEW.banned_at
  );

  INSERT INTO public.info_notifications (user_id, title, message, type, is_read, link)
  SELECT staff.id,
         'Account suspension review pending',
         'A suspended account is waiting for moderator review.',
         'warning',
         FALSE,
         '/info/admin/suspension-reviews'
    FROM public.info_users AS staff
   WHERE staff.id <> NEW.banned_by
     AND (public.is_admin(staff.id) OR public.is_moderator(staff.id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_create_suspension_review_for_ban ON public.admin_user_bans;
CREATE TRIGGER tr_create_suspension_review_for_ban
AFTER INSERT OR UPDATE ON public.admin_user_bans
FOR EACH ROW EXECUTE FUNCTION public.create_suspension_review_for_ban();

CREATE OR REPLACE FUNCTION public.link_resolved_account_report_to_suspension_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'resolved'
     OR OLD.status = 'resolved'
     OR NEW.reported_item_table IS DISTINCT FROM 'info_users'
     OR NEW.reported_user_id IS NULL
     OR NEW.resolution IS NULL
     OR NEW.resolution NOT LIKE 'Account suspended%' THEN
    RETURN NEW;
  END IF;

  UPDATE public.suspension_reviews AS review
     SET report_id = NEW.id,
         original_suspending_party = 'community_report',
         updated_at = NOW()
   WHERE review.id = (
     SELECT candidate.id
       FROM public.suspension_reviews AS candidate
      WHERE candidate.user_id = NEW.reported_user_id
        AND candidate.report_id IS NULL
        AND candidate.original_suspending_user_id IS NOT DISTINCT FROM NEW.assigned_to
        AND candidate.suspended_at >= COALESCE(NEW.resolved_at, NEW.updated_at) - INTERVAL '1 minute'
      ORDER BY candidate.created_at DESC
      LIMIT 1
   );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_link_resolved_account_report_to_suspension_review ON public.info_moderation;
CREATE TRIGGER tr_link_resolved_account_report_to_suspension_review
AFTER UPDATE OF status ON public.info_moderation
FOR EACH ROW EXECUTE FUNCTION public.link_resolved_account_report_to_suspension_review();

INSERT INTO public.suspension_reviews (
  user_id,
  ban_id,
  original_suspending_user_id,
  original_suspending_party,
  reason,
  original_duration_days,
  original_expires_at,
  suspended_at
)
SELECT
  ban.user_id,
  ban.id,
  ban.banned_by,
  'moderator',
  ban.reason,
  CASE
    WHEN ban.expires_at IS NULL THEN NULL
    ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (ban.expires_at - ban.banned_at)) / 86400)::INTEGER)
  END,
  ban.expires_at,
  ban.banned_at
FROM public.admin_user_bans AS ban
WHERE ban.ban_type = 'suspension'
  AND ban.lifted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
      FROM public.suspension_reviews AS review
     WHERE review.ban_id = ban.id
       AND review.suspended_at = ban.banned_at
  );

UPDATE public.suspension_reviews AS review
   SET user_appeal_id = appeal.id,
       has_user_appeal = TRUE
  FROM public.user_moderation_appeals AS appeal
 WHERE appeal.user_id = review.user_id
   AND appeal.status = 'pending'
   AND review.status IN ('pending', 'needs_information')
   AND review.user_appeal_id IS NULL
   AND EXISTS (
     SELECT 1
       FROM public.admin_user_bans AS ban
      WHERE ban.id = review.ban_id
        AND ban.ban_type = 'suspension'
        AND ban.lifted_at IS NULL
        AND (ban.expires_at IS NULL OR ban.expires_at > NOW())
   )
   AND review.id = (
     SELECT latest_review.id
       FROM public.suspension_reviews AS latest_review
      WHERE latest_review.user_id = review.user_id
        AND latest_review.status IN ('pending', 'needs_information')
      ORDER BY latest_review.created_at DESC, latest_review.id DESC
      LIMIT 1
   );

CREATE OR REPLACE FUNCTION public.link_suspension_appeal_to_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.suspension_reviews AS review
     SET user_appeal_id = NEW.id,
         has_user_appeal = TRUE,
         updated_at = NOW()
   WHERE review.id = (
     SELECT candidate.id
       FROM public.suspension_reviews AS candidate
       JOIN public.admin_user_bans AS ban ON ban.id = candidate.ban_id
      WHERE candidate.user_id = NEW.user_id
        AND candidate.status IN ('pending', 'needs_information')
        AND candidate.user_appeal_id IS NULL
        AND ban.ban_type = 'suspension'
        AND ban.lifted_at IS NULL
        AND (ban.expires_at IS NULL OR ban.expires_at > NOW())
      ORDER BY candidate.created_at DESC
      LIMIT 1
   );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_link_suspension_appeal_to_review ON public.user_moderation_appeals;
CREATE TRIGGER tr_link_suspension_appeal_to_review
AFTER INSERT ON public.user_moderation_appeals
FOR EACH ROW EXECUTE FUNCTION public.link_suspension_appeal_to_review();

CREATE OR REPLACE FUNCTION public.process_suspension_review(
  p_review_id UUID,
  p_reviewer_id UUID,
  p_decision TEXT,
  p_notes TEXT,
  p_new_duration_days INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  review_row public.suspension_reviews%ROWTYPE;
  ban_row public.admin_user_bans%ROWTYPE;
  cleaned_notes TEXT := NULLIF(BTRIM(p_notes), '');
  now_at TIMESTAMPTZ := NOW();
  resulting_status TEXT;
  resulting_account_status TEXT := 'suspended';
  resulting_expiration TIMESTAMPTZ;
  appeal_status TEXT;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Administrator service access is required';
  END IF;
  IF p_reviewer_id IS NULL
     OR (NOT public.is_admin(p_reviewer_id) AND NOT public.is_moderator(p_reviewer_id)) THEN
    RAISE EXCEPTION 'Only administrators and moderators can process suspension reviews';
  END IF;
  IF p_decision IS NULL
     OR p_decision NOT IN ('uphold', 'lift', 'modify', 'request_info')
     OR cleaned_notes IS NULL
     OR char_length(cleaned_notes) > 2000 THEN
    RAISE EXCEPTION 'A valid decision and review note are required';
  END IF;
  IF p_decision = 'modify'
     AND (p_new_duration_days IS NULL OR p_new_duration_days < 1 OR p_new_duration_days > 365) THEN
    RAISE EXCEPTION 'A revised duration between 1 and 365 days is required';
  END IF;

  SELECT *
    INTO review_row
    FROM public.suspension_reviews
   WHERE id = p_review_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This review case no longer exists';
  END IF;
  IF review_row.status NOT IN ('pending', 'needs_information') THEN
    RAISE EXCEPTION 'This review case is no longer available for a decision';
  END IF;
  IF review_row.original_suspending_user_id = p_reviewer_id THEN
    RAISE EXCEPTION 'The original suspending moderator cannot review this case';
  END IF;

  SELECT *
    INTO ban_row
    FROM public.admin_user_bans
   WHERE id = review_row.ban_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The original suspension record no longer exists';
  END IF;
  IF p_decision <> 'request_info'
     AND (ban_row.lifted_at IS NOT NULL OR (ban_row.expires_at IS NOT NULL AND ban_row.expires_at <= now_at)) THEN
    RAISE EXCEPTION 'The suspension is no longer active';
  END IF;

  CASE p_decision
    WHEN 'uphold' THEN
      resulting_status := 'rejected';
      appeal_status := 'rejected';
      notification_title := 'Account suspension upheld';
      notification_message := 'The moderator upheld your account suspension. Review note: ' || cleaned_notes;

    WHEN 'lift' THEN
      UPDATE public.admin_user_bans
         SET lifted_by = p_reviewer_id,
             lifted_at = now_at,
             updated_at = now_at
       WHERE id = review_row.ban_id;
      resulting_status := 'approved';
      resulting_account_status := 'active';
      appeal_status := 'approved';
      notification_title := 'Account suspension lifted';
      notification_message := 'Your account suspension has been lifted. Review note: ' || cleaned_notes;

    WHEN 'modify' THEN
      IF review_row.original_duration_days IS NOT NULL
         AND p_new_duration_days >= review_row.original_duration_days THEN
        RAISE EXCEPTION 'The revised suspension must be shorter than the original duration';
      END IF;
      resulting_expiration := now_at + make_interval(days => p_new_duration_days);
      UPDATE public.admin_user_bans
         SET expires_at = resulting_expiration,
             lifted_by = NULL,
             lifted_at = NULL,
             updated_at = now_at
       WHERE id = review_row.ban_id;
      resulting_status := 'modified';
      appeal_status := 'approved';
      notification_title := 'Account suspension modified';
      notification_message := 'Your suspension duration was reduced to '
        || p_new_duration_days || ' day(s), ending '
        || resulting_expiration::DATE || '. Review note: ' || cleaned_notes;

    WHEN 'request_info' THEN
      resulting_status := 'needs_information';
      notification_title := 'Additional information requested';
      notification_message := 'The moderation team needs more information about your suspension appeal. Review note: ' || cleaned_notes;
  END CASE;

  UPDATE public.suspension_reviews
     SET status = resulting_status,
         moderation_notes = CASE
           WHEN review_row.moderation_notes IS NULL THEN cleaned_notes
           ELSE LEFT(review_row.moderation_notes || E'\n\n' || cleaned_notes, 2000)
         END,
         reviewed_by = p_reviewer_id,
         reviewed_at = now_at,
         new_expires_at = CASE WHEN p_decision = 'modify' THEN resulting_expiration ELSE new_expires_at END,
         updated_duration_days = CASE WHEN p_decision = 'modify' THEN p_new_duration_days ELSE updated_duration_days END,
         updated_at = now_at
   WHERE id = p_review_id;

  INSERT INTO public.suspension_review_history (
    review_id, reviewer_id, decision, notes, account_status_after, recorded_at
  )
  VALUES (p_review_id, p_reviewer_id, p_decision, cleaned_notes, resulting_account_status, now_at);

  IF review_row.user_appeal_id IS NOT NULL AND p_decision <> 'request_info' THEN
    UPDATE public.user_moderation_appeals
       SET status = appeal_status,
           decision_notes = cleaned_notes,
           reviewed_by = p_reviewer_id,
           reviewed_at = now_at
     WHERE id = review_row.user_appeal_id
       AND status = 'pending';
  END IF;

  INSERT INTO public.info_notifications (user_id, title, message, type, is_read, link)
  VALUES (
    review_row.user_id,
    notification_title,
    notification_message,
    CASE WHEN p_decision = 'lift' THEN 'success' WHEN p_decision = 'modify' THEN 'info' ELSE 'warning' END,
    FALSE,
    '/info/user/moderation-appeals'
  );

  INSERT INTO public.info_audit_log (user_id, action, table_name, record_id, changes)
  VALUES (
    p_reviewer_id,
    'process_suspension_review',
    'suspension_reviews',
    p_review_id,
    jsonb_build_object(
      'decision', p_decision,
      'notes', cleaned_notes,
      'status', resulting_status,
      'new_duration_days', p_new_duration_days,
      'new_expires_at', resulting_expiration
    )
  );

  RETURN jsonb_build_object(
    'review_id', p_review_id,
    'status', resulting_status,
    'account_status', resulting_account_status,
    'new_expires_at', resulting_expiration
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_suspension_review(UUID, UUID, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_suspension_review(UUID, UUID, TEXT, TEXT, INTEGER)
  TO service_role;

COMMIT;
