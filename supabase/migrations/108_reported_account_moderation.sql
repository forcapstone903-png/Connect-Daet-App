BEGIN;

CREATE OR REPLACE FUNCTION public.approve_account_report_and_suspend(
  p_report_id UUID,
  p_reviewer_id UUID,
  p_reason TEXT,
  p_severity TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  report_row public.info_moderation%ROWTYPE;
  target_user_type TEXT;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
  duration_days INTEGER;
  proposed_expiration TIMESTAMPTZ;
  effective_expiration TIMESTAMPTZ;
  now_at TIMESTAMPTZ := NOW();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Administrator service access is required';
  END IF;
  IF p_reviewer_id IS NULL OR NOT public.is_moderator(p_reviewer_id) THEN
    RAISE EXCEPTION 'A moderator is required to approve account reports';
  END IF;
  IF cleaned_reason IS NULL OR length(cleaned_reason) > 1000
     OR p_severity IS NULL
     OR p_severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'A valid suspension reason and severity are required';
  END IF;

  SELECT * INTO report_row
    FROM public.info_moderation
   WHERE id = p_report_id
   FOR UPDATE;
  IF NOT FOUND OR report_row.status NOT IN ('pending', 'reviewing') THEN
    RAISE EXCEPTION 'This report is no longer open';
  END IF;
  IF report_row.reported_item_table IS DISTINCT FROM 'info_users'
     OR report_row.reported_item_id IS DISTINCT FROM report_row.reported_user_id
     OR report_row.reported_user_id IS NULL THEN
    RAISE EXCEPTION 'This report does not target a user account';
  END IF;

  SELECT user_type INTO target_user_type
    FROM public.info_users
   WHERE id = report_row.reported_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The reported account no longer exists';
  END IF;
  IF lower(COALESCE(target_user_type, '')) IN ('admin', 'administrator', 'tourism_officer', 'moderator') THEN
    RAISE EXCEPTION 'Staff accounts cannot be suspended through community reports';
  END IF;

  duration_days := CASE p_severity
    WHEN 'low' THEN 7
    WHEN 'medium' THEN 30
    WHEN 'high' THEN 90
    ELSE NULL
  END;
  proposed_expiration := CASE
    WHEN duration_days IS NULL THEN NULL
    ELSE now_at + make_interval(days => duration_days)
  END;

  INSERT INTO public.admin_user_bans AS existing_ban (
    user_id,
    reason,
    banned_by,
    banned_at,
    expires_at,
    lifted_by,
    lifted_at,
    ban_type
  )
  VALUES (
    report_row.reported_user_id,
    cleaned_reason,
    p_reviewer_id,
    now_at,
    proposed_expiration,
    NULL,
    NULL,
    'suspension'
  )
  ON CONFLICT (user_id) DO UPDATE
     SET reason = EXCLUDED.reason,
         banned_by = EXCLUDED.banned_by,
         banned_at = EXCLUDED.banned_at,
         expires_at = CASE
           WHEN existing_ban.lifted_at IS NULL
             AND (existing_ban.expires_at IS NULL OR existing_ban.expires_at > now_at)
             AND (
               existing_ban.expires_at IS NULL
               OR (EXCLUDED.expires_at IS NOT NULL AND existing_ban.expires_at > EXCLUDED.expires_at)
             )
           THEN existing_ban.expires_at
           ELSE EXCLUDED.expires_at
         END,
         lifted_by = NULL,
         lifted_at = NULL,
         ban_type = 'suspension'
  RETURNING expires_at INTO effective_expiration;

  UPDATE public.info_moderation
     SET severity = p_severity,
         status = 'resolved',
         resolution = CASE
           WHEN effective_expiration IS NULL THEN 'Account suspended permanently: ' || cleaned_reason
           ELSE 'Account suspended until ' || effective_expiration::DATE || ': ' || cleaned_reason
         END,
         moderation_notes = cleaned_reason,
         assigned_to = p_reviewer_id,
         resolved_at = now_at,
         updated_at = now_at
   WHERE id = p_report_id
     AND status IN ('pending', 'reviewing');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This report changed while it was being reviewed';
  END IF;

  INSERT INTO public.info_notifications (user_id, title, message, type, is_read, link)
  VALUES (
    report_row.reported_user_id,
    'Account suspended',
    CASE
      WHEN effective_expiration IS NULL THEN 'Your account has been suspended permanently. Reason: ' || cleaned_reason
      ELSE 'Your account has been suspended until ' || effective_expiration::DATE || '. Reason: ' || cleaned_reason
    END,
    'warning',
    FALSE,
    '/info/user/moderation-appeals'
  );

  INSERT INTO public.info_audit_log (user_id, action, table_name, record_id, changes)
  VALUES (
    p_reviewer_id,
    'approve-account-report',
    'admin_user_bans',
    report_row.reported_user_id,
    jsonb_build_object(
      'report_id', p_report_id,
      'reason', cleaned_reason,
      'severity', p_severity,
      'duration_days', duration_days,
      'expires_at', effective_expiration
    )
  );

  RETURN jsonb_build_object(
    'report_id', p_report_id,
    'user_id', report_row.reported_user_id,
    'severity', p_severity,
    'duration_days', duration_days,
    'expires_at', effective_expiration
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_account_report_and_suspend(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_account_report_and_suspend(UUID, UUID, TEXT, TEXT)
  TO service_role;

COMMIT;
