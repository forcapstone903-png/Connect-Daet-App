BEGIN;

CREATE OR REPLACE FUNCTION public.decide_account_moderation_report(
  p_report_id UUID,
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
  report_row public.info_moderation%ROWTYPE;
  target_row public.info_users%ROWTYPE;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
  now_at TIMESTAMPTZ := NOW();
  expiration TIMESTAMPTZ;
  audit_action TEXT;
  audit_details JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_reviewer_id IS NULL OR NOT public.is_staff_in(p_reviewer_id, ARRAY['moderator']) THEN
    RAISE EXCEPTION 'An active moderator or administrator is required';
  END IF;
  IF cleaned_reason IS NULL OR length(cleaned_reason) > 1000 THEN
    RAISE EXCEPTION 'A decision reason is required';
  END IF;
  IF p_decision NOT IN ('approve-suspension', 'reject-account-report', 'escalate-account-review') THEN
    RAISE EXCEPTION 'Unsupported account moderation decision';
  END IF;
  IF p_decision = 'approve-suspension'
     AND (p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 365) THEN
    RAISE EXCEPTION 'Suspension duration must be between 1 and 365 days';
  END IF;

  SELECT * INTO report_row
    FROM public.info_moderation
   WHERE id = p_report_id
   FOR UPDATE;
  IF NOT FOUND OR report_row.status NOT IN ('pending', 'reviewing') THEN
    RAISE EXCEPTION 'This account report is no longer open';
  END IF;
  IF p_decision <> 'escalate-account-review'
     AND EXISTS (
       SELECT 1
         FROM public.info_audit_log
        WHERE action = 'escalate-account-review'
          AND table_name = 'info_moderation'
          AND record_id = p_report_id
     )
     AND NOT public.is_staff_in(p_reviewer_id, ARRAY[]::text[]) THEN
    RAISE EXCEPTION 'Only an administrator can decide an escalated account report';
  END IF;
  IF report_row.reported_item_table IS DISTINCT FROM 'info_users'
     OR report_row.reported_item_id IS DISTINCT FROM report_row.reported_user_id
     OR report_row.reported_user_id IS NULL THEN
    RAISE EXCEPTION 'This report does not target a user account';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.info_audit_log
     WHERE action = p_decision
       AND table_name = 'info_moderation'
       AND record_id = p_report_id
  ) THEN
    RAISE EXCEPTION 'This moderation decision has already been recorded';
  END IF;

  SELECT * INTO target_row
    FROM public.info_users
   WHERE id = report_row.reported_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The reported account no longer exists';
  END IF;
  IF lower(COALESCE(target_row.user_type, '')) IN ('admin', 'administrator', 'tourism_officer', 'moderator') THEN
    RAISE EXCEPTION 'Staff accounts cannot be moderated through community account reports';
  END IF;

  IF p_decision = 'approve-suspension' THEN
    expiration := now_at + make_interval(days => p_duration_days);
    INSERT INTO public.admin_user_bans (
      user_id, reason, banned_by, banned_at, expires_at, lifted_by, lifted_at, ban_type
    )
    VALUES (
      target_row.id, cleaned_reason, p_reviewer_id, now_at, expiration, NULL, NULL, 'suspension'
    )
    ON CONFLICT (user_id) DO UPDATE
       SET reason = EXCLUDED.reason,
           banned_by = EXCLUDED.banned_by,
           banned_at = EXCLUDED.banned_at,
           expires_at = EXCLUDED.expires_at,
           lifted_by = NULL,
           lifted_at = NULL,
           ban_type = 'suspension';

    UPDATE public.info_users
       SET status = 'suspended',
           updated_at = now_at
     WHERE id = target_row.id;

    UPDATE public.info_moderation
       SET status = 'resolved',
           severity = CASE
             WHEN p_duration_days <= 7 THEN 'low'
             WHEN p_duration_days <= 30 THEN 'medium'
             WHEN p_duration_days <= 90 THEN 'high'
             ELSE 'critical'
           END,
           resolution = format('Suspension approved for %s day(s): %s', p_duration_days, cleaned_reason),
           moderation_notes = cleaned_reason,
           assigned_to = p_reviewer_id,
           resolved_at = now_at,
           updated_at = now_at
     WHERE id = p_report_id;

    audit_action := 'approve-suspension';
    audit_details := jsonb_build_object(
      'userId', target_row.id,
      'decision', 'approved',
      'reason', cleaned_reason,
      'durationDays', p_duration_days,
      'expiresAt', expiration,
      'reviewedAt', now_at,
      'reviewerId', p_reviewer_id
    );

    INSERT INTO public.info_notifications (
      user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
    )
    VALUES (
      target_row.id,
      'Account suspended',
      format('Your account has been suspended for %s day(s). Reason: %s', p_duration_days, cleaned_reason),
      'account_suspension',
      FALSE,
      '/info/user/moderation-appeals?moderation_report=' || p_report_id::TEXT,
      p_reviewer_id,
      now_at,
      now_at
    )
    ON CONFLICT DO NOTHING;
  ELSIF p_decision = 'reject-account-report' THEN
    UPDATE public.info_moderation
       SET status = 'rejected',
           resolution = 'Report rejected: ' || cleaned_reason,
           moderation_notes = cleaned_reason,
           assigned_to = p_reviewer_id,
           resolved_at = now_at,
           updated_at = now_at
     WHERE id = p_report_id;

    audit_action := 'reject-account-report';
    audit_details := jsonb_build_object(
      'userId', target_row.id,
      'decision', 'rejected',
      'reason', cleaned_reason,
      'accountStatusChanged', FALSE,
      'reviewedAt', now_at,
      'reviewerId', p_reviewer_id
    );

    IF report_row.reported_by IS NOT NULL THEN
      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
      )
      VALUES (
        report_row.reported_by,
        'Account report reviewed',
        'The moderation team reviewed your account report and rejected it.',
        'report_update',
        FALSE,
        '/info/user/notifications?moderation_report=' || p_report_id::TEXT,
        p_reviewer_id,
        now_at,
        now_at
      )
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    UPDATE public.info_moderation
       SET status = 'reviewing',
           resolution = 'Escalated to administrator: ' || cleaned_reason,
           moderation_notes = cleaned_reason,
           assigned_to = p_reviewer_id,
           updated_at = now_at
     WHERE id = p_report_id;

    audit_action := 'escalate-account-review';
    audit_details := jsonb_build_object(
      'userId', target_row.id,
      'decision', 'escalated',
      'reason', cleaned_reason,
      'accountStatusChanged', FALSE,
      'destination', 'administrator',
      'escalatedAt', now_at,
      'reviewerId', p_reviewer_id
    );

    INSERT INTO public.info_notifications (
      user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
    )
    SELECT
      staff.id,
      'Account review escalated',
      'A moderator escalated an account report with evidence for administrator review.',
      'warning',
      FALSE,
      '/info/admin/moderation?tab=reports&reviewReportId=' || p_report_id::TEXT,
      p_reviewer_id,
      now_at,
      now_at
    FROM public.info_users AS staff
    WHERE staff.status = 'active'
      AND lower(staff.user_type) IN ('admin', 'administrator')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.info_audit_log (user_id, action, table_name, record_id, changes, created_at)
  VALUES (p_reviewer_id, audit_action, 'info_moderation', p_report_id, audit_details, now_at);

  RETURN jsonb_build_object(
    'report_id', p_report_id,
    'user_id', target_row.id,
    'decision', p_decision,
    'reviewer_id', p_reviewer_id,
    'reviewed_at', now_at,
    'reason', cleaned_reason,
    'duration_days', p_duration_days,
    'expires_at', expiration
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_account_moderation_report(UUID, UUID, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_account_moderation_report(UUID, UUID, TEXT, TEXT, INTEGER)
  TO service_role;

COMMIT;
