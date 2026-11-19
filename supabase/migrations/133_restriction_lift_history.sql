BEGIN;

-- Retain each restriction record while allowing only one unlifted restriction per account.
ALTER TABLE public.admin_user_bans
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS lift_reason TEXT;

UPDATE public.admin_user_bans
   SET id = gen_random_uuid()
 WHERE id IS NULL;

ALTER TABLE public.admin_user_bans
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.admin_user_bans
  DROP CONSTRAINT IF EXISTS admin_user_bans_pkey;

ALTER TABLE public.admin_user_bans
  ADD CONSTRAINT admin_user_bans_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS admin_user_bans_one_unlifted_per_user_idx
  ON public.admin_user_bans (user_id)
  WHERE lifted_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_user_bans_user_history_idx
  ON public.admin_user_bans (user_id, banned_at DESC);

CREATE OR REPLACE FUNCTION public.create_account_restriction(
  p_user_id UUID,
  p_actor_id UUID,
  p_reason TEXT,
  p_duration_days INTEGER,
  p_ban_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_row public.info_users%ROWTYPE;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
  now_at TIMESTAMPTZ := clock_timestamp();
  expiration TIMESTAMPTZ;
  restriction_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_actor_id IS NULL OR NOT public.is_staff_in(p_actor_id, ARRAY['moderator']) THEN
    RAISE EXCEPTION 'An active moderator or administrator is required';
  END IF;
  IF p_user_id IS NULL
     OR p_user_id = p_actor_id
     OR cleaned_reason IS NULL
     OR length(cleaned_reason) > 1000
     OR p_ban_type IS NULL
     OR p_ban_type NOT IN ('posting', 'suspension')
     OR (p_duration_days IS NOT NULL AND (p_duration_days < 1 OR p_duration_days > 365)) THEN
    RAISE EXCEPTION 'A valid account restriction is required';
  END IF;

  SELECT * INTO target_row
    FROM public.info_users
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND OR target_row.account_deactivated_at IS NOT NULL THEN
    RAISE EXCEPTION 'This account is not eligible for restriction';
  END IF;
  IF lower(COALESCE(target_row.user_type, '')) IN ('admin', 'administrator', 'tourism_officer', 'moderator') THEN
    RAISE EXCEPTION 'Staff accounts cannot be restricted through community moderation';
  END IF;
  IF (p_ban_type = 'posting' AND target_row.status <> 'active')
     OR (p_ban_type = 'suspension' AND target_row.status NOT IN ('active', 'suspended')) THEN
    RAISE EXCEPTION 'This account status is not eligible for restriction';
  END IF;

  UPDATE public.admin_user_bans
     SET lifted_at = expires_at
   WHERE user_id = p_user_id
     AND lifted_at IS NULL
     AND expires_at IS NOT NULL
     AND expires_at <= now_at;

  IF EXISTS (
    SELECT 1
      FROM public.admin_user_bans
     WHERE user_id = p_user_id
       AND lifted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This account already has an active restriction';
  END IF;

  expiration := CASE
    WHEN p_duration_days IS NULL THEN NULL
    ELSE now_at + make_interval(days => p_duration_days)
  END;

  INSERT INTO public.admin_user_bans (
    user_id, reason, banned_by, banned_at, expires_at, lifted_by, lifted_at, ban_type
  )
  VALUES (
    p_user_id, cleaned_reason, p_actor_id, now_at, expiration, NULL, NULL, p_ban_type
  )
  RETURNING id INTO restriction_id;

  IF p_ban_type = 'suspension' THEN
    UPDATE public.info_users
       SET status = 'suspended',
           updated_at = now_at
     WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'id', restriction_id,
    'user_id', p_user_id,
    'ban_type', p_ban_type,
    'reason', cleaned_reason,
    'banned_at', now_at,
    'expires_at', expiration
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_account_restriction(UUID, UUID, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_account_restriction(UUID, UUID, TEXT, INTEGER, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.lift_account_restriction(
  p_user_id UUID,
  p_actor_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_row public.info_users%ROWTYPE;
  restriction_row public.admin_user_bans%ROWTYPE;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
  now_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_actor_id IS NULL OR NOT public.is_staff_in(p_actor_id, ARRAY['moderator']) THEN
    RAISE EXCEPTION 'An active moderator or administrator is required';
  END IF;
  IF p_user_id IS NULL OR cleaned_reason IS NULL OR length(cleaned_reason) > 1000 THEN
    RAISE EXCEPTION 'A valid lifting reason is required';
  END IF;

  SELECT * INTO target_row
    FROM public.info_users
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The account for this restriction no longer exists';
  END IF;
  IF target_row.account_deactivated_at IS NOT NULL
     OR target_row.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'This account cannot be restored while deactivated';
  END IF;

  SELECT * INTO restriction_row
    FROM public.admin_user_bans
   WHERE user_id = p_user_id
     AND lifted_at IS NULL
     AND (expires_at IS NULL OR expires_at > now_at)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account has no active restriction to lift';
  END IF;

  UPDATE public.admin_user_bans
     SET lifted_by = p_actor_id,
         lifted_at = now_at,
         lift_reason = cleaned_reason
   WHERE id = restriction_row.id
     AND lifted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This restriction has already been lifted';
  END IF;

  IF restriction_row.ban_type = 'suspension' THEN
    UPDATE public.info_users
       SET status = 'active',
           updated_at = now_at
     WHERE id = p_user_id
       AND account_deactivated_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The account could not be restored';
    END IF;
  END IF;

  INSERT INTO public.info_notifications (
    user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
  )
  VALUES (
    p_user_id,
    CASE WHEN restriction_row.ban_type = 'suspension' THEN 'Account suspension lifted' ELSE 'Posting ban lifted' END,
    CASE
      WHEN restriction_row.ban_type = 'suspension'
        THEN 'Your account suspension has been lifted. Your account is Active again. Reason: ' || cleaned_reason
      ELSE 'Your posting ban has been lifted. You can publish again. Reason: ' || cleaned_reason
    END,
    'success',
    FALSE,
    '/info/user/notifications',
    p_actor_id,
    now_at,
    now_at
  );

  INSERT INTO public.info_audit_log (
    user_id, action, table_name, record_id, changes, created_at
  )
  VALUES (
    p_actor_id,
    'lift-account-restriction',
    'admin_user_bans',
    restriction_row.id,
    jsonb_build_object(
      'userId', p_user_id,
      'restrictionType', COALESCE(restriction_row.ban_type, 'posting'),
      'restrictionReason', restriction_row.reason,
      'liftReason', cleaned_reason,
      'reviewerId', p_actor_id,
      'liftedAt', now_at,
      'accountStatus', CASE WHEN restriction_row.ban_type = 'suspension' THEN 'active' ELSE target_row.status END
    ),
    now_at
  );

  RETURN jsonb_build_object(
    'id', restriction_row.id,
    'user_id', p_user_id,
    'ban_type', COALESCE(restriction_row.ban_type, 'posting'),
    'restriction_reason', restriction_row.reason,
    'lifted_by', p_actor_id,
    'lifted_at', now_at,
    'lift_reason', cleaned_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lift_account_restriction(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lift_account_restriction(UUID, UUID, TEXT)
  TO service_role;

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
  restriction_result JSONB;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
  now_at TIMESTAMPTZ := clock_timestamp();
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
  IF p_decision IS NULL
     OR p_decision NOT IN ('approve-suspension', 'reject-account-report', 'escalate-account-review') THEN
    RAISE EXCEPTION 'Unsupported account moderation decision';
  END IF;
  IF p_decision = 'approve-suspension'
     AND p_duration_days IS NOT NULL
     AND (p_duration_days < 1 OR p_duration_days > 365) THEN
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
     AND NOT public.is_staff_in(p_reviewer_id, ARRAY[]::TEXT[]) THEN
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
    restriction_result := public.create_account_restriction(
      target_row.id, p_reviewer_id, cleaned_reason, p_duration_days, 'suspension'
    );
    expiration := (restriction_result ->> 'expires_at')::TIMESTAMPTZ;

    UPDATE public.info_moderation
       SET status = 'resolved',
           severity = CASE
             WHEN p_duration_days IS NULL THEN 'critical'
             WHEN p_duration_days <= 7 THEN 'low'
             WHEN p_duration_days <= 30 THEN 'medium'
             WHEN p_duration_days <= 90 THEN 'high'
             ELSE 'critical'
           END,
           resolution = CASE
             WHEN p_duration_days IS NULL THEN 'Suspension approved permanently: ' || cleaned_reason
             ELSE format('Suspension approved for %s day(s): %s', p_duration_days, cleaned_reason)
           END,
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
      CASE
        WHEN p_duration_days IS NULL THEN 'Your account has been suspended permanently. Reason: ' || cleaned_reason
        ELSE format('Your account has been suspended for %s day(s). Reason: %s', p_duration_days, cleaned_reason)
      END,
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
    'expires_at', expiration,
    'restriction_id', restriction_result ->> 'id'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_account_moderation_report(UUID, UUID, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_account_moderation_report(UUID, UUID, TEXT, TEXT, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.submit_user_moderation_appeal(
  p_user_id UUID,
  p_appeal_id UUID,
  p_reason TEXT,
  p_appeal_type TEXT,
  p_evidence_paths TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_row public.info_users%ROWTYPE;
  ban_row public.admin_user_bans%ROWTYPE;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
  now_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_user_id IS NULL OR p_appeal_id IS NULL
     OR p_appeal_type IS NULL
     OR p_appeal_type NOT IN ('posting_restriction', 'account_suspension')
     OR cleaned_reason IS NULL
     OR length(cleaned_reason) > 2000 THEN
    RAISE EXCEPTION 'A valid appeal reason and type are required';
  END IF;
  IF cardinality(COALESCE(p_evidence_paths, ARRAY[]::TEXT[])) > 3
     OR EXISTS (
       SELECT 1
         FROM unnest(COALESCE(p_evidence_paths, ARRAY[]::TEXT[])) AS evidence(path)
        WHERE evidence.path IS NULL
            OR evidence.path NOT LIKE (p_user_id::TEXT || '/' || p_appeal_id::TEXT || '/%')
     ) THEN
    RAISE EXCEPTION 'Appeal evidence paths are invalid';
  END IF;

  SELECT * INTO target_row
    FROM public.info_users
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND OR target_row.account_deactivated_at IS NOT NULL THEN
    RAISE EXCEPTION 'This account is not eligible to submit an appeal';
  END IF;

  SELECT * INTO ban_row
    FROM public.admin_user_bans
   WHERE user_id = p_user_id
     AND lifted_at IS NULL
     AND (expires_at IS NULL OR expires_at > now_at)
   ORDER BY banned_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no active restriction to appeal';
  END IF;

  IF p_appeal_type = 'account_suspension' THEN
    IF target_row.status <> 'suspended' OR ban_row.ban_type IS DISTINCT FROM 'suspension' THEN
      RAISE EXCEPTION 'There is no active account suspension to appeal';
    END IF;
  ELSIF target_row.status = 'suspended'
     OR COALESCE(ban_row.ban_type, 'posting') = 'suspension' THEN
    RAISE EXCEPTION 'There is no active posting restriction to appeal';
  END IF;

  INSERT INTO public.user_moderation_appeals (
    id, user_id, reason, appeal_type, evidence_paths, created_at
  )
  VALUES (
    p_appeal_id,
    p_user_id,
    cleaned_reason,
    p_appeal_type,
    COALESCE(p_evidence_paths, ARRAY[]::TEXT[]),
    now_at
  );

  RETURN jsonb_build_object(
    'id', p_appeal_id,
    'user_id', p_user_id,
    'reason', cleaned_reason,
    'appeal_type', p_appeal_type,
    'status', 'pending',
    'created_at', now_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_user_moderation_appeal(UUID, UUID, TEXT, TEXT, TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_user_moderation_appeal(UUID, UUID, TEXT, TEXT, TEXT[])
  TO service_role;

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
  duration_days INTEGER;
BEGIN
  duration_days := CASE p_severity
    WHEN 'low' THEN 7
    WHEN 'medium' THEN 30
    WHEN 'high' THEN 90
    WHEN 'critical' THEN NULL
    ELSE -1
  END;
  IF duration_days = -1 THEN
    RAISE EXCEPTION 'A valid suspension severity is required';
  END IF;

  RETURN public.decide_account_moderation_report(
    p_report_id,
    p_reviewer_id,
    'approve-suspension',
    p_reason,
    duration_days
  ) || jsonb_build_object('severity', p_severity);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_account_report_and_suspend(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_account_report_and_suspend(UUID, UUID, TEXT, TEXT)
  TO service_role;

COMMIT;
