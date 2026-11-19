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
    'approved_permanent_ban',
    'reversed'
  ));

CREATE INDEX IF NOT EXISTS account_moderation_investigations_user_submitted_idx
  ON public.account_moderation_investigations (affected_user_id, submitted_at DESC);

REVOKE UPDATE, DELETE, TRUNCATE ON public.info_audit_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_info_users_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF v_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_type IS DISTINCT FROM OLD.user_type THEN
    RAISE EXCEPTION 'Roles can only be changed by an administrator from the Users page.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Account status changes must use the authorized review workflow.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.points IS DISTINCT FROM OLD.points
     AND NOT public.is_staff_in(auth.uid(), ARRAY[]::text[]) THEN
    RAISE EXCEPTION 'Only an administrator can change account points.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_account_oversight_action(
  p_admin_id UUID,
  p_action TEXT,
  p_user_id UUID DEFAULT NULL,
  p_investigation_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
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
  v_restriction public.admin_user_bans%ROWTYPE;
  v_original_decision public.moderation_decisions%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
  v_case_id UUID;
  v_investigation_id UUID := p_investigation_id;
  v_restriction_id UUID;
  v_decision_id UUID;
  v_duration INTEGER;
  v_expiration TIMESTAMPTZ;
  v_previous_status TEXT;
  v_new_status TEXT;
  v_investigation_status TEXT;
  v_decision_type TEXT;
  v_report_resolution TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_admin_id IS NULL OR NOT public.is_staff_in(p_admin_id, ARRAY['admin', 'administrator']) THEN
    RAISE EXCEPTION 'Only an active System Administrator can manage account oversight';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) > 5000 THEN
    RAISE EXCEPTION 'A detailed reason is required';
  END IF;
  IF p_action NOT IN (
    'approve_permanent_ban',
    'reject_permanent_ban',
    'approve_exceptional_suspension',
    'lift_suspension',
    'reverse_decision'
  ) THEN
    RAISE EXCEPTION 'Unsupported administrator account action';
  END IF;

  IF p_action IN (
    'approve_permanent_ban',
    'reject_permanent_ban',
    'approve_exceptional_suspension'
  ) THEN
    IF p_investigation_id IS NULL THEN
      RAISE EXCEPTION 'An escalated investigation is required';
    END IF;

    SELECT * INTO v_investigation
      FROM public.account_moderation_investigations
     WHERE id = v_investigation_id
     FOR UPDATE;
    IF NOT FOUND OR v_investigation.status <> 'pending_administrator_review' THEN
      RAISE EXCEPTION 'This case is no longer pending administrator review';
    END IF;

    SELECT * INTO v_recommendation
      FROM public.account_moderation_recommendations
     WHERE investigation_id = v_investigation.id;
    IF NOT FOUND OR v_recommendation.recommendation <> 'recommend_permanent_ban' THEN
      RAISE EXCEPTION 'This escalated case is not a permanent ban request';
    END IF;

    SELECT * INTO v_report
      FROM public.info_moderation
     WHERE id = v_investigation.report_id
     FOR UPDATE;
    IF NOT FOUND OR v_report.reported_user_id IS DISTINCT FROM v_investigation.affected_user_id THEN
      RAISE EXCEPTION 'The investigation report is no longer available';
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

    v_case_id := v_report.id;
    v_previous_status := v_target.status;

    IF p_action = 'reject_permanent_ban' THEN
      v_new_status := v_previous_status;
      v_investigation_status := 'pending_tourism_officer_review';
      v_decision_type := 'PERMANENT_BAN_REJECTED';
      v_report_resolution := 'Permanent ban request returned to Tourism Officer: ' || v_reason;

      UPDATE public.account_moderation_investigations
         SET status = v_investigation_status,
             reviewed_by = p_admin_id,
             reviewed_at = v_now,
             review_notes = v_reason,
             updated_at = v_now
       WHERE id = v_investigation.id;

      UPDATE public.info_moderation
         SET status = 'reviewing',
             resolution = v_report_resolution,
             moderation_notes = v_reason,
             resolved_at = NULL,
             updated_at = v_now
       WHERE id = v_report.id;

      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
      )
      SELECT staff.id,
             'Permanent ban request returned',
             'The System Administrator returned an escalated permanent ban request for further Tourism Officer review: ' || v_reason,
             'warning',
             FALSE,
             '/info/admin/suspension-cases?case=' || v_investigation.id::TEXT,
             p_admin_id,
             v_now,
             v_now
        FROM public.info_users AS staff
       WHERE staff.status = 'active'
         AND lower(staff.user_type) = 'tourism_officer';
    ELSE
      IF p_action = 'approve_exceptional_suspension'
         AND (p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 365) THEN
        RAISE EXCEPTION 'Suspension duration must be between 1 and 365 days';
      END IF;
      IF p_action = 'approve_permanent_ban' AND p_duration_days IS NOT NULL THEN
        RAISE EXCEPTION 'A duration is not valid for a permanent ban';
      END IF;

      UPDATE public.admin_user_bans
         SET lifted_at = expires_at,
             lift_reason = 'Automatically lifted after restriction expiration'
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

      IF p_action = 'approve_permanent_ban' THEN
        v_decision_type := 'PERMANENT_BAN_APPROVED';
        v_investigation_status := 'approved_permanent_ban';
        v_new_status := 'banned';
        v_report_resolution := 'Permanent ban approved by administrator: ' || v_reason;
        v_duration := NULL;
        v_expiration := NULL;

        INSERT INTO public.admin_user_bans (
          user_id, reason, banned_by, banned_at, expires_at, lifted_by, lifted_at, ban_type
        )
        VALUES (v_target.id, v_reason, p_admin_id, v_now, NULL, NULL, NULL, 'permanent')
        RETURNING id INTO v_restriction_id;
      ELSE
        v_decision_type := 'EXCEPTIONAL_SUSPENSION_APPROVED';
        v_investigation_status := 'approved_suspension';
        v_new_status := 'suspended';
        v_report_resolution := format('Exceptional suspension approved for %s day(s): %s', p_duration_days, v_reason);
        v_duration := p_duration_days;
        v_expiration := v_now + make_interval(days => p_duration_days);

        INSERT INTO public.admin_user_bans (
          user_id, reason, banned_by, banned_at, expires_at, lifted_by, lifted_at, ban_type
        )
        VALUES (v_target.id, v_reason, p_admin_id, v_now, v_expiration, NULL, NULL, 'suspension')
        RETURNING id INTO v_restriction_id;
      END IF;

      UPDATE public.info_users
         SET status = v_new_status,
             updated_at = v_now
       WHERE id = v_target.id;

      UPDATE public.account_moderation_investigations
         SET status = v_investigation_status,
             reviewed_by = p_admin_id,
             reviewed_at = v_now,
             review_notes = v_reason,
             updated_at = v_now
       WHERE id = v_investigation.id;

      UPDATE public.info_moderation
         SET status = 'resolved',
             resolution = v_report_resolution,
             moderation_notes = v_reason,
             assigned_to = p_admin_id,
             resolved_at = v_now,
             updated_at = v_now
       WHERE id = v_report.id;

      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
      )
      VALUES (
        v_target.id,
        CASE WHEN p_action = 'approve_permanent_ban' THEN 'Account permanently banned' ELSE 'Account suspended' END,
        CASE
          WHEN p_action = 'approve_permanent_ban'
            THEN 'Your Daet Connect account has been permanently banned following an administrative review. Reason: ' || v_reason
          ELSE format('Your account has been suspended for %s day(s) following an administrative review. Reason: %s', p_duration_days, v_reason)
        END,
        'account_suspension',
        FALSE,
        '/info/user/moderation-appeals?moderation_report=' || v_report.id::TEXT,
        p_admin_id,
        v_now,
        v_now
      );
    END IF;
  ELSE
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'A user account is required';
    END IF;
    SELECT * INTO v_target
      FROM public.info_users
     WHERE id = p_user_id
     FOR UPDATE;
    IF NOT FOUND OR v_target.account_deactivated_at IS NOT NULL THEN
      RAISE EXCEPTION 'The account is not eligible for administrator action';
    END IF;
    IF lower(COALESCE(v_target.user_type, '')) IN ('admin', 'administrator', 'tourism_officer', 'moderator') THEN
      RAISE EXCEPTION 'Staff accounts cannot be actioned through Account Oversight';
    END IF;
    v_previous_status := v_target.status;

    SELECT investigation.id, investigation.report_id
      INTO v_investigation_id, v_case_id
      FROM public.account_moderation_investigations AS investigation
     WHERE investigation.affected_user_id = p_user_id
     ORDER BY investigation.submitted_at DESC
     LIMIT 1;

    IF p_action = 'lift_suspension' THEN
      IF v_target.status <> 'suspended' THEN
        RAISE EXCEPTION 'Only a suspended account can have its suspension lifted';
      END IF;
      SELECT * INTO v_restriction
        FROM public.admin_user_bans
       WHERE user_id = p_user_id
         AND ban_type = 'suspension'
         AND lifted_at IS NULL
         AND (expires_at IS NULL OR expires_at > v_now)
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No active suspension was found for this account';
      END IF;

      UPDATE public.admin_user_bans
         SET lifted_by = p_admin_id,
             lifted_at = v_now,
             lift_reason = v_reason
       WHERE id = v_restriction.id
         AND lifted_at IS NULL;
      v_restriction_id := v_restriction.id;

      IF EXISTS (
        SELECT 1
          FROM public.admin_user_bans
         WHERE user_id = p_user_id
           AND id <> v_restriction.id
           AND lifted_at IS NULL
           AND (expires_at IS NULL OR expires_at > v_now)
           AND ban_type IN ('suspension', 'permanent')
      ) THEN
        SELECT CASE WHEN ban_type = 'permanent' THEN 'banned' ELSE 'suspended' END
          INTO v_new_status
          FROM public.admin_user_bans
         WHERE user_id = p_user_id
           AND id <> v_restriction.id
           AND lifted_at IS NULL
           AND (expires_at IS NULL OR expires_at > v_now)
           AND ban_type IN ('suspension', 'permanent')
         ORDER BY CASE WHEN ban_type = 'permanent' THEN 0 ELSE 1 END, banned_at DESC
         LIMIT 1;
      ELSE
        v_new_status := 'active';
      END IF;
      v_decision_type := 'SUSPENSION_LIFTED';
      v_duration := NULL;
      v_expiration := NULL;

      UPDATE public.info_users
         SET status = v_new_status,
             updated_at = v_now
       WHERE id = p_user_id;

      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
      )
      VALUES (
        p_user_id,
        'Account suspension lifted',
        'An administrator lifted your account suspension. Reason: ' || v_reason,
        'success',
        FALSE,
        '/info/user/notifications',
        p_admin_id,
        v_now,
        v_now
      );
    ELSE
      IF p_investigation_id IS NULL THEN
        RAISE EXCEPTION 'The original case is required to reverse a moderation decision';
      END IF;
      SELECT * INTO v_investigation
        FROM public.account_moderation_investigations
       WHERE id = v_investigation_id
         AND affected_user_id = p_user_id
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The original moderation case was not found';
      END IF;

      SELECT * INTO v_original_decision
        FROM public.moderation_decisions
       WHERE investigation_id = v_investigation_id
         AND affected_user_id = p_user_id
         AND decision_type IN (
           'SUSPENSION_APPROVED',
           'EXCEPTIONAL_SUSPENSION_APPROVED',
           'PERMANENT_BAN_APPROVED'
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public.moderation_decisions AS reversal
            WHERE reversal.original_decision_id = moderation_decisions.id
         )
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No reversible suspension or ban decision was found';
      END IF;

      SELECT * INTO v_restriction
        FROM public.admin_user_bans
       WHERE user_id = p_user_id
         AND lifted_at IS NULL
         AND (
           (v_original_decision.new_status = 'banned' AND ban_type = 'permanent')
           OR (v_original_decision.new_status = 'suspended' AND ban_type = 'suspension')
         )
       ORDER BY banned_at DESC
       LIMIT 1
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The restriction for this decision is no longer active';
      END IF;

      UPDATE public.admin_user_bans
         SET lifted_by = p_admin_id,
             lifted_at = v_now,
             lift_reason = v_reason,
             reversed_by = p_admin_id,
             reversed_at = v_now,
             reversal_reason = v_reason
       WHERE id = v_restriction.id;
      v_restriction_id := v_restriction.id;

      v_new_status := COALESCE(v_original_decision.previous_status, 'active');
      IF EXISTS (
        SELECT 1
          FROM public.admin_user_bans
         WHERE user_id = p_user_id
           AND id <> v_restriction.id
           AND lifted_at IS NULL
           AND (expires_at IS NULL OR expires_at > v_now)
           AND ban_type = 'permanent'
      ) THEN
        v_new_status := 'banned';
      ELSIF EXISTS (
        SELECT 1
          FROM public.admin_user_bans
         WHERE user_id = p_user_id
           AND id <> v_restriction.id
           AND lifted_at IS NULL
           AND (expires_at IS NULL OR expires_at > v_now)
           AND ban_type = 'suspension'
      ) THEN
        v_new_status := 'suspended';
      END IF;

      UPDATE public.info_users
         SET status = v_new_status,
             updated_at = v_now
       WHERE id = p_user_id;

      UPDATE public.account_moderation_investigations
         SET status = 'reversed',
             reviewed_by = p_admin_id,
             reviewed_at = v_now,
             review_notes = v_reason,
             updated_at = v_now
       WHERE id = v_investigation.id;
      v_investigation_status := 'reversed';

      v_case_id := v_investigation.report_id;
      v_decision_type := CASE
        WHEN v_original_decision.new_status = 'banned' THEN 'PERMANENT_BAN_REVERSED'
        ELSE 'SUSPENSION_REVERSED'
      END;
      v_duration := NULL;
      v_expiration := NULL;

      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
      )
      VALUES (
        p_user_id,
        CASE WHEN v_new_status = 'banned' THEN 'Moderation decision reversed' ELSE 'Account restriction reversed' END,
        'An administrator reversed a prior moderation decision. Your account status is now ' ||
          upper(v_new_status) || '. Reason: ' || v_reason,
        'success',
        FALSE,
        '/info/user/notifications',
        p_admin_id,
        v_now,
        v_now
      );
    END IF;
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
    original_decision_id,
    created_at
  )
  VALUES (
    v_case_id,
    v_investigation_id,
    v_target.id,
    p_admin_id,
    'admin',
    v_decision_type,
    v_report.report_type,
    v_reason,
    v_reason,
    v_previous_status,
    v_new_status,
    v_duration,
    CASE WHEN v_decision_type IN ('PERMANENT_BAN_APPROVED', 'EXCEPTIONAL_SUSPENSION_APPROVED') THEN v_now ELSE NULL END,
    v_expiration,
    CASE WHEN p_action = 'reverse_decision' THEN v_original_decision.id ELSE NULL END,
    v_now
  )
  RETURNING id INTO v_decision_id;

  INSERT INTO public.info_audit_log (
    user_id, action, table_name, record_id, changes, created_at
  )
  VALUES (
    p_admin_id,
    lower(v_decision_type),
    CASE WHEN v_restriction_id IS NOT NULL THEN 'admin_user_bans' ELSE 'account_moderation_investigations' END,
    COALESCE(v_restriction_id, v_investigation_id),
    jsonb_build_object(
      'previousStatus', v_previous_status,
      'newStatus', v_new_status,
      'action', p_action,
      'administratorId', p_admin_id,
      'timestamp', v_now,
      'reason', v_reason,
      'relatedCaseId', v_case_id,
      'investigationId', v_investigation_id,
      'decisionId', v_decision_id,
      'originalDecisionId', CASE WHEN p_action = 'reverse_decision' THEN v_original_decision.id ELSE NULL END,
      'durationDays', v_duration,
      'expiresAt', v_expiration
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'decision_id', v_decision_id,
    'case_id', v_case_id,
    'investigation_id', v_investigation_id,
    'user_id', v_target.id,
    'action', p_action,
    'decision_type', v_decision_type,
    'review_status', v_investigation_status,
    'previous_status', v_previous_status,
    'new_status', v_new_status,
    'duration_days', v_duration,
    'expires_at', v_expiration,
    'reviewed_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_account_oversight_action(UUID, TEXT, UUID, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_account_oversight_action(UUID, TEXT, UUID, UUID, TEXT, INTEGER)
  TO service_role;

DO $$
DECLARE
  v_oid OID;
  v_function_count INTEGER;
  v_definition TEXT;
  v_old TEXT := E'ELSIF p_decision IN (''approve_permanent_ban'', ''reject_permanent_ban'') THEN\n    IF NOT public.is_staff_in(p_reviewer_id, ARRAY[''admin'']) THEN';
  v_new TEXT := E'ELSIF p_decision IN (''approve_permanent_ban'', ''reject_permanent_ban'') THEN\n    RAISE EXCEPTION ''Administrator decisions must use the Account Oversight workflow'';\n    IF NOT public.is_staff_in(p_reviewer_id, ARRAY[''admin'']) THEN';
BEGIN
  SELECT count(*) INTO v_function_count
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'review_account_investigation';
  IF v_function_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one public.review_account_investigation function';
  END IF;

  SELECT p.oid INTO v_oid
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'review_account_investigation';

  v_definition := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  IF position(v_new IN v_definition) = 0 THEN
    IF (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'Expected one administrator decision branch in review_account_investigation';
    END IF;
    EXECUTE replace(v_definition, v_old, v_new);
  END IF;
END $$;

COMMIT;
