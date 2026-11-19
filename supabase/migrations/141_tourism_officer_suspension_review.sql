BEGIN;

ALTER TABLE public.account_moderation_investigations
  DROP CONSTRAINT IF EXISTS account_moderation_investigations_status_check;

ALTER TABLE public.account_moderation_investigations
  ADD CONSTRAINT account_moderation_investigations_status_check
  CHECK (status IN (
    'pending_tourism_officer_review',
    'approved_suspension',
    'rejected',
    'returned',
    'reviewed',
    'pending_administrator_review',
    'approved_permanent_ban'
  ));

ALTER TABLE public.moderation_decisions
  ADD COLUMN IF NOT EXISTS investigation_id UUID
    REFERENCES public.account_moderation_investigations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS account_moderation_investigations_officer_queue_idx
  ON public.account_moderation_investigations (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS moderation_decisions_investigation_idx
  ON public.moderation_decisions (investigation_id, created_at DESC);

DROP POLICY IF EXISTS moderation_decisions_staff_select ON public.moderation_decisions;
CREATE POLICY moderation_decisions_staff_select
  ON public.moderation_decisions
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff_in(
      auth.uid(),
      ARRAY['admin', 'administrator', 'moderator', 'tourism_officer']
    )
  );
GRANT SELECT ON TABLE public.moderation_decisions TO authenticated;

CREATE OR REPLACE FUNCTION public.review_account_investigation(
  p_investigation_id UUID,
  p_reviewer_id UUID,
  p_decision TEXT,
  p_reason TEXT,
  p_duration_days INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_investigation public.account_moderation_investigations%ROWTYPE;
  v_recommendation public.account_moderation_recommendations%ROWTYPE;
  v_report public.info_moderation%ROWTYPE;
  v_target public.info_users%ROWTYPE;
  v_restriction JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
  v_previous_status TEXT;
  v_new_status TEXT;
  v_decision_type TEXT;
  v_review_status TEXT;
  v_duration INTEGER;
  v_expiration TIMESTAMPTZ;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) > 5000 THEN
    RAISE EXCEPTION 'A written decision reason is required';
  END IF;

  SELECT * INTO v_investigation
    FROM public.account_moderation_investigations
   WHERE id = p_investigation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investigation not found';
  END IF;

  SELECT * INTO v_recommendation
    FROM public.account_moderation_recommendations
   WHERE investigation_id = v_investigation.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investigation recommendation not found';
  END IF;

  SELECT * INTO v_report
    FROM public.info_moderation
   WHERE id = v_investigation.report_id
   FOR UPDATE;
  IF NOT FOUND OR v_report.reported_user_id IS DISTINCT FROM v_investigation.affected_user_id THEN
    RAISE EXCEPTION 'Investigation report is no longer available';
  END IF;

  SELECT * INTO v_target
    FROM public.info_users
   WHERE id = v_investigation.affected_user_id
   FOR UPDATE;
  IF NOT FOUND OR v_target.account_deactivated_at IS NOT NULL THEN
    RAISE EXCEPTION 'The reported account is not eligible for review';
  END IF;
  IF lower(COALESCE(v_target.user_type, '')) IN ('admin', 'administrator', 'tourism_officer', 'moderator') THEN
    RAISE EXCEPTION 'Staff accounts cannot be actioned through community reports';
  END IF;

  v_previous_status := v_target.status;

  IF p_decision IN ('approve_suspension', 'reject_recommendation', 'return_for_investigation', 'escalate_to_administrator') THEN
    IF NOT public.is_staff_in(p_reviewer_id, ARRAY['tourism_officer']) THEN
      RAISE EXCEPTION 'Only an active Tourism Officer can review this case';
    END IF;
    IF v_investigation.status <> 'pending_tourism_officer_review' THEN
      RAISE EXCEPTION 'This case is no longer pending Tourism Officer review';
    END IF;

    IF p_decision = 'approve_suspension' THEN
      IF v_recommendation.recommendation <> 'recommend_temporary_suspension' THEN
        RAISE EXCEPTION 'Only a temporary suspension recommendation can be approved here';
      END IF;
      IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 365 THEN
        RAISE EXCEPTION 'Suspension duration must be between 1 and 365 days';
      END IF;

      v_restriction := public.create_account_restriction(
        v_target.id,
        p_reviewer_id,
        v_reason,
        p_duration_days,
        'suspension'
      );
      v_duration := p_duration_days;
      v_expiration := (v_restriction ->> 'expires_at')::TIMESTAMPTZ;
      IF v_expiration IS NULL OR v_expiration <= v_now THEN
        RAISE EXCEPTION 'The suspension expiration date is invalid';
      END IF;
      v_review_status := 'approved_suspension';
      v_decision_type := 'SUSPENSION_APPROVED';
      v_new_status := 'suspended';

      UPDATE public.info_moderation
         SET status = 'resolved',
             resolution = format('Suspension approved for %s day(s): %s', v_duration, v_reason),
             moderation_notes = v_reason,
             assigned_to = p_reviewer_id,
             resolved_at = v_now,
             updated_at = v_now
       WHERE id = v_report.id;

      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
      )
      VALUES (
        v_target.id,
        'Account suspended',
        format('Your account has been suspended for %s day(s). Reason: %s', v_duration, v_reason),
        'account_suspension',
        FALSE,
        '/info/user/moderation-appeals?moderation_report=' || v_report.id::TEXT,
        p_reviewer_id,
        v_now,
        v_now
      );
    ELSIF p_decision = 'reject_recommendation' THEN
      v_review_status := 'rejected';
      v_decision_type := 'RECOMMENDATION_REJECTED';
      v_new_status := v_previous_status;

      UPDATE public.info_moderation
         SET status = 'rejected',
             resolution = 'Recommendation rejected: ' || v_reason,
             moderation_notes = v_reason,
             assigned_to = p_reviewer_id,
             resolved_at = v_now,
             updated_at = v_now
       WHERE id = v_report.id;
    ELSIF p_decision = 'return_for_investigation' THEN
      v_review_status := 'returned';
      v_decision_type := 'RETURNED_FOR_INVESTIGATION';
      v_new_status := v_previous_status;

      UPDATE public.info_moderation
         SET status = 'pending',
             resolution = 'Returned for investigation: ' || v_reason,
             moderation_notes = v_reason,
             assigned_to = v_investigation.moderator_id,
             resolved_at = NULL,
             updated_at = v_now
       WHERE id = v_report.id;

      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
      )
      VALUES (
        v_investigation.moderator_id,
        'Investigation returned',
        'The Tourism Officer returned your account investigation with instructions: ' || v_reason,
        'warning',
        FALSE,
        '/info/admin/moderation?tab=reports&reviewReportId=' || v_report.id::TEXT,
        p_reviewer_id,
        v_now,
        v_now
      );
    ELSE
      IF v_recommendation.recommendation <> 'recommend_permanent_ban' THEN
        RAISE EXCEPTION 'Only permanent ban recommendations can be escalated for final authorization';
      END IF;
      v_review_status := 'pending_administrator_review';
      v_decision_type := 'ESCALATED_TO_ADMINISTRATOR';
      v_new_status := v_previous_status;
    END IF;

    UPDATE public.account_moderation_investigations
       SET status = v_review_status,
           reviewed_by = p_reviewer_id,
           reviewed_at = v_now,
           review_notes = v_reason,
           updated_at = v_now
     WHERE id = v_investigation.id;

    IF p_decision = 'escalate_to_administrator' THEN
      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
      )
      SELECT
        staff.id,
        'Permanent ban request escalated',
        'A Tourism Officer escalated a complete account investigation for final administrator authorization.',
        'warning',
        FALSE,
        '/info/admin/suspension-cases?case=' || v_investigation.id::TEXT,
        p_reviewer_id,
        v_now,
        v_now
      FROM public.info_users AS staff
      WHERE staff.status = 'active'
        AND lower(staff.user_type) IN ('admin', 'administrator');
    END IF;

  ELSIF p_decision IN ('approve_permanent_ban', 'reject_permanent_ban') THEN
    IF NOT public.is_staff_in(p_reviewer_id, ARRAY['admin']) THEN
      RAISE EXCEPTION 'Only an active System Administrator can decide a permanent ban';
    END IF;
    IF v_investigation.status <> 'pending_administrator_review'
       OR v_recommendation.recommendation <> 'recommend_permanent_ban' THEN
      RAISE EXCEPTION 'This permanent ban request is not pending administrator review';
    END IF;

    IF p_decision = 'approve_permanent_ban' THEN
      UPDATE public.admin_user_bans
         SET lifted_at = expires_at
       WHERE user_id = v_target.id
         AND lifted_at IS NULL
         AND expires_at IS NOT NULL
         AND expires_at <= v_now;

      IF EXISTS (
        SELECT 1
          FROM public.admin_user_bans
         WHERE user_id = v_target.id
           AND lifted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'This account already has an active restriction';
      END IF;

      INSERT INTO public.admin_user_bans (
        user_id, reason, banned_by, banned_at, expires_at, lifted_by, lifted_at, ban_type
      )
      VALUES (
        v_target.id, v_reason, p_reviewer_id, v_now, NULL, NULL, NULL, 'permanent'
      );
      UPDATE public.info_users
         SET status = 'suspended',
             updated_at = v_now
       WHERE id = v_target.id;

      v_review_status := 'approved_permanent_ban';
      v_decision_type := 'PERMANENT_BAN_APPROVED';
      v_new_status := 'suspended';

      UPDATE public.info_moderation
         SET status = 'resolved',
             resolution = 'Permanent ban approved by administrator: ' || v_reason,
             moderation_notes = v_reason,
             assigned_to = p_reviewer_id,
             resolved_at = v_now,
             updated_at = v_now
       WHERE id = v_report.id;

      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
      )
      VALUES (
        v_target.id,
        'Account permanently suspended',
        'Your account has been permanently suspended. Reason: ' || v_reason,
        'account_suspension',
        FALSE,
        '/info/user/moderation-appeals?moderation_report=' || v_report.id::TEXT,
        p_reviewer_id,
        v_now,
        v_now
      );
    ELSE
      v_review_status := 'rejected';
      v_decision_type := 'PERMANENT_BAN_REJECTED';
      v_new_status := v_previous_status;

      UPDATE public.info_moderation
         SET status = 'rejected',
             resolution = 'Permanent ban request rejected by administrator: ' || v_reason,
             moderation_notes = v_reason,
             assigned_to = p_reviewer_id,
             resolved_at = v_now,
             updated_at = v_now
       WHERE id = v_report.id;
    END IF;

    UPDATE public.account_moderation_investigations
       SET status = v_review_status,
           reviewed_by = p_reviewer_id,
           reviewed_at = v_now,
           review_notes = v_reason,
           updated_at = v_now
     WHERE id = v_investigation.id;
  ELSE
    RAISE EXCEPTION 'Unsupported investigation decision';
  END IF;

  INSERT INTO public.moderation_decisions (
    case_id,
    investigation_id,
    affected_user_id,
    reviewer_id,
    reviewer_role,
    decision_type,
    violation_category,
    reason,
    reviewer_remarks,
    previous_status,
    new_status,
    suspension_duration_days,
    effective_at,
    expires_at,
    created_at
  )
  VALUES (
    v_report.id,
    v_investigation.id,
    v_target.id,
    p_reviewer_id,
    CASE
      WHEN p_decision IN ('approve_permanent_ban', 'reject_permanent_ban') THEN 'admin'
      ELSE 'tourism_officer'
    END,
    v_decision_type,
    v_report.report_type,
    v_reason,
    v_investigation.assessment,
    v_previous_status,
    v_new_status,
    v_duration,
    CASE WHEN p_decision IN ('approve_suspension', 'approve_permanent_ban') THEN v_now ELSE NULL END,
    v_expiration,
    v_now
  );

  INSERT INTO public.info_audit_log (
    user_id, action, table_name, record_id, changes, created_at
  )
  VALUES (
    p_reviewer_id,
    lower(v_decision_type),
    'account_moderation_investigations',
    v_investigation.id,
    jsonb_build_object(
      'reportId', v_report.id,
      'decision', p_decision,
      'reviewerRole', CASE
        WHEN p_decision IN ('approve_permanent_ban', 'reject_permanent_ban') THEN 'admin'
        ELSE 'tourism_officer'
      END,
      'reason', v_reason,
      'previousStatus', v_previous_status,
      'newStatus', v_new_status,
      'durationDays', v_duration,
      'expiresAt', v_expiration,
      'reviewedAt', v_now
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'investigation_id', v_investigation.id,
    'report_id', v_report.id,
    'user_id', v_target.id,
    'decision', p_decision,
    'review_status', v_review_status,
    'reviewer_id', p_reviewer_id,
    'previous_status', v_previous_status,
    'new_status', v_new_status,
    'duration_days', v_duration,
    'expires_at', v_expiration,
    'reviewed_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_account_investigation(UUID, UUID, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_account_investigation(UUID, UUID, TEXT, TEXT, INTEGER)
  TO service_role;

COMMIT;
