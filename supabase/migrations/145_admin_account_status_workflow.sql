BEGIN;

ALTER TABLE public.info_notifications
  ADD COLUMN IF NOT EXISTS moderation_decision_id UUID
    REFERENCES public.moderation_decisions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS info_notifications_moderation_decision_id_idx
  ON public.info_notifications (moderation_decision_id)
  WHERE moderation_decision_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_user_account_is_active()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.info_users AS account
     WHERE account.id = auth.uid()
       AND account.status = 'active'
       AND account.deletion_requested_at IS NULL
       AND account.account_deactivated_at IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.admin_user_bans AS restriction
          WHERE restriction.user_id = account.id
            AND restriction.ban_type IN ('suspension', 'permanent')
            AND restriction.lifted_at IS NULL
            AND (restriction.expires_at IS NULL OR restriction.expires_at > now())
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_account_can_read()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.info_users AS account
     WHERE account.id = auth.uid()
       AND account.status IN ('active', 'pending', 'suspended')
       AND account.deletion_requested_at IS NULL
       AND account.account_deactivated_at IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.admin_user_bans AS restriction
          WHERE restriction.user_id = account.id
            AND restriction.ban_type = 'permanent'
            AND restriction.lifted_at IS NULL
            AND (restriction.expires_at IS NULL OR restriction.expires_at > now())
       )
       AND (
         account.status = 'suspended'
         OR NOT EXISTS (
           SELECT 1
             FROM public.admin_user_bans AS restriction
            WHERE restriction.user_id = account.id
              AND restriction.ban_type = 'suspension'
              AND restriction.lifted_at IS NULL
              AND (restriction.expires_at IS NULL OR restriction.expires_at > now())
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_account_is_active() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_account_can_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_account_is_active() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_account_can_read() TO authenticated, service_role;

DO $$
DECLARE
  v_table RECORD;
  v_select_predicate TEXT;
  v_update_predicate TEXT;
BEGIN
  FOR v_table IN
    SELECT relation.relname
      FROM pg_class AS relation
      JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
     WHERE schema.nspname = 'public'
       AND relation.relkind IN ('r', 'p')
       AND relation.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS account_active_required ON public.%I', v_table.relname);
    EXECUTE format('DROP POLICY IF EXISTS account_status_read_access ON public.%I', v_table.relname);
    EXECUTE format('DROP POLICY IF EXISTS account_status_active_insert ON public.%I', v_table.relname);
    EXECUTE format('DROP POLICY IF EXISTS account_status_active_update ON public.%I', v_table.relname);
    EXECUTE format('DROP POLICY IF EXISTS account_status_active_delete ON public.%I', v_table.relname);

    v_select_predicate := 'public.current_user_account_is_active()';
    v_update_predicate := 'public.current_user_account_is_active()';
    IF v_table.relname = 'info_users' THEN
      v_select_predicate := '(public.current_user_account_is_active() OR (public.current_user_account_can_read() AND id = auth.uid()))';
      v_update_predicate := '(public.current_user_account_is_active() OR (public.current_user_account_can_read() AND id = auth.uid()))';
    ELSIF v_table.relname = 'profiles' THEN
      v_select_predicate := '(public.current_user_account_is_active() OR (public.current_user_account_can_read() AND user_id = auth.uid()))';
      v_update_predicate := '(public.current_user_account_is_active() OR (public.current_user_account_can_read() AND user_id = auth.uid()))';
    ELSIF v_table.relname = 'info_notifications' THEN
      v_select_predicate := '(public.current_user_account_is_active() OR (public.current_user_account_can_read() AND user_id = auth.uid()))';
      v_update_predicate := '(public.current_user_account_is_active() OR (public.current_user_account_can_read() AND user_id = auth.uid()))';
    ELSIF v_table.relname = 'admin_user_bans' THEN
      v_select_predicate := '(public.current_user_account_is_active() OR (public.current_user_account_can_read() AND user_id = auth.uid() AND ban_type = ''suspension''))';
    ELSIF v_table.relname = 'user_moderation_appeals' THEN
      v_select_predicate := '(public.current_user_account_is_active() OR (public.current_user_account_can_read() AND user_id = auth.uid()))';
    ELSIF v_table.relname IN ('info_tourist_spots', 'info_events', 'info_announcements', 'alerts') THEN
      v_select_predicate := 'public.current_user_account_can_read()';
    END IF;

    EXECUTE format(
      'CREATE POLICY account_status_read_access ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)',
      v_table.relname,
      v_select_predicate
    );
    EXECUTE format(
      'CREATE POLICY account_status_active_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.current_user_account_is_active())',
      v_table.relname
    );
    EXECUTE format(
      'CREATE POLICY account_status_active_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      v_table.relname,
      v_update_predicate,
      v_update_predicate
    );
    EXECUTE format(
      'CREATE POLICY account_status_active_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.current_user_account_is_active())',
      v_table.relname
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  p_admin_id UUID,
  p_user_id UUID,
  p_new_status TEXT,
  p_reason TEXT DEFAULT NULL,
  p_duration_days INTEGER DEFAULT NULL,
  p_report_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.info_users%ROWTYPE;
  v_report public.info_moderation%ROWTYPE;
  v_restriction public.admin_user_bans%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
  v_previous_status TEXT;
  v_decision_type TEXT;
  v_decision_id UUID;
  v_restriction_id UUID;
  v_expiration TIMESTAMPTZ;
  v_case_id UUID := p_report_id;
  v_actor_role TEXT;
  v_message TEXT;
  v_title TEXT;
  v_notification_type TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'An active administrator or moderator is required';
  ELSIF public.is_staff_in(p_admin_id, ARRAY['admin', 'administrator']) THEN
    v_actor_role := 'admin';
  ELSIF public.is_staff_in(p_admin_id, ARRAY['moderator']) THEN
    v_actor_role := 'moderator';
  ELSE
    RAISE EXCEPTION 'Only an active System Administrator or Moderator can manage account status';
  END IF;
  IF p_user_id IS NULL OR p_new_status IS NULL
     OR p_new_status NOT IN ('active', 'pending', 'suspended', 'banned') THEN
    RAISE EXCEPTION 'Select a supported account status and user';
  END IF;
  IF p_duration_days IS NOT NULL AND p_new_status <> 'suspended' THEN
    RAISE EXCEPTION 'A duration is only valid for a temporary suspension';
  END IF;
  IF p_new_status = 'suspended'
     AND (p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 365) THEN
    RAISE EXCEPTION 'Suspension duration must be between 1 and 365 days';
  END IF;
  IF v_actor_role = 'moderator' AND p_new_status NOT IN ('suspended', 'banned') THEN
    RAISE EXCEPTION 'Moderators can only apply a reasoned suspension or permanent ban';
  END IF;

  SELECT * INTO v_target
    FROM public.info_users
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND OR v_target.account_deactivated_at IS NOT NULL
     OR v_target.deletion_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'The account is not eligible for administrator action';
  END IF;
  IF lower(COALESCE(v_target.user_type, '')) IN ('admin', 'administrator', 'tourism_officer', 'moderator') THEN
    RAISE EXCEPTION 'Staff account status must be managed through staff administration';
  END IF;

  v_previous_status := v_target.status;
  IF v_previous_status = p_new_status THEN
    RAISE EXCEPTION 'The account already has this status';
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 5000 THEN
    RAISE EXCEPTION 'The moderation reason is too long';
  END IF;
  IF p_new_status IN ('suspended', 'banned') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'A moderation reason is required';
  END IF;

  IF p_report_id IS NOT NULL THEN
    SELECT * INTO v_report
      FROM public.info_moderation
     WHERE id = p_report_id
       AND reported_user_id = p_user_id
     FOR UPDATE;
    IF NOT FOUND OR v_report.status NOT IN ('open', 'pending', 'reviewing') THEN
      RAISE EXCEPTION 'Select an open report for this account';
    END IF;
    IF v_reason IS NULL THEN
      v_reason := COALESCE(
        NULLIF(BTRIM(v_report.reason), ''),
        'Related ' || COALESCE(NULLIF(BTRIM(v_report.report_type), ''), 'account') || ' report under review'
      );
    END IF;
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A moderation reason or related open report is required';
  END IF;

  IF p_new_status IN ('pending', 'suspended')
     AND v_previous_status = 'banned' THEN
    RAISE EXCEPTION 'A permanent ban must be reversed before changing this account status';
  END IF;
  IF p_new_status = 'pending'
     AND v_previous_status = 'suspended' THEN
    RAISE EXCEPTION 'An active suspension must be lifted before placing the account under review';
  END IF;
  IF p_new_status IN ('pending', 'suspended')
     AND EXISTS (
       SELECT 1
         FROM public.admin_user_bans AS existing
        WHERE existing.user_id = p_user_id
          AND existing.ban_type IN ('suspension', 'permanent')
          AND existing.lifted_at IS NULL
          AND (existing.expires_at IS NULL OR existing.expires_at > v_now)
     ) THEN
    RAISE EXCEPTION 'An active account restriction must be lifted before applying this status';
  END IF;
  IF p_new_status = 'banned'
     AND EXISTS (
       SELECT 1
         FROM public.admin_user_bans AS existing
        WHERE existing.user_id = p_user_id
          AND existing.ban_type = 'permanent'
          AND existing.lifted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'This account already has an active permanent ban';
  END IF;

  IF p_new_status = 'suspended' THEN
    UPDATE public.admin_user_bans
       SET lifted_at = expires_at,
           lift_reason = 'Expired restriction cleared before a new administrator suspension',
           expiration_processed_at = COALESCE(expiration_processed_at, v_now)
     WHERE user_id = p_user_id
       AND ban_type = 'suspension'
       AND lifted_at IS NULL
       AND expires_at IS NOT NULL
       AND expires_at <= v_now;

    v_expiration := v_now + make_interval(days => p_duration_days);
    INSERT INTO public.admin_user_bans (
      user_id, reason, banned_by, banned_at, expires_at, lifted_by, lifted_at, ban_type
    )
    VALUES (p_user_id, v_reason, p_admin_id, v_now, v_expiration, NULL, NULL, 'suspension')
    RETURNING id INTO v_restriction_id;
    v_decision_type := 'EXCEPTIONAL_SUSPENSION_APPROVED';
  ELSIF p_new_status = 'banned' THEN
    UPDATE public.admin_user_bans
       SET lifted_by = p_admin_id,
           lifted_at = CASE WHEN expires_at IS NOT NULL AND expires_at <= v_now THEN expires_at ELSE v_now END,
           lift_reason = 'Superseded by an administrator permanent ban',
           expiration_processed_at = CASE
             WHEN expires_at IS NOT NULL AND expires_at <= v_now THEN COALESCE(expiration_processed_at, v_now)
             ELSE expiration_processed_at
           END,
           reversed_by = p_admin_id,
           reversed_at = v_now,
           reversal_reason = v_reason
     WHERE user_id = p_user_id
       AND ban_type = 'suspension'
       AND lifted_at IS NULL;

    INSERT INTO public.admin_user_bans (
      user_id, reason, banned_by, banned_at, expires_at, lifted_by, lifted_at, ban_type
    )
    VALUES (p_user_id, v_reason, p_admin_id, v_now, NULL, NULL, NULL, 'permanent')
    RETURNING id INTO v_restriction_id;
    v_decision_type := 'PERMANENT_BAN_APPROVED';
  ELSIF p_new_status = 'active' THEN
    UPDATE public.admin_user_bans
       SET lifted_by = p_admin_id,
           lifted_at = v_now,
           lift_reason = v_reason,
           reversed_by = CASE WHEN ban_type = 'permanent' THEN p_admin_id ELSE reversed_by END,
           reversed_at = CASE WHEN ban_type = 'permanent' THEN v_now ELSE reversed_at END,
           reversal_reason = CASE WHEN ban_type = 'permanent' THEN v_reason ELSE reversal_reason END
     WHERE user_id = p_user_id
       AND ban_type IN ('suspension', 'permanent')
       AND lifted_at IS NULL;

    SELECT id INTO v_restriction_id
      FROM public.admin_user_bans
     WHERE user_id = p_user_id
       AND lifted_by = p_admin_id
       AND lifted_at = v_now
       AND ban_type IN ('suspension', 'permanent')
     ORDER BY banned_at DESC
     LIMIT 1;

    v_decision_type := CASE
      WHEN v_previous_status = 'banned' THEN 'PERMANENT_BAN_REVERSED'
      WHEN v_previous_status = 'suspended' THEN 'SUSPENSION_LIFTED'
      ELSE 'ACCOUNT_RESTORED'
    END;
  ELSE
    v_decision_type := 'ACCOUNT_REVIEW_PENDING';
  END IF;

  UPDATE public.info_users
     SET status = p_new_status,
         updated_at = v_now
   WHERE id = p_user_id;

  IF p_report_id IS NOT NULL THEN
    IF p_new_status = 'pending' THEN
      UPDATE public.info_moderation
         SET status = 'reviewing',
             assigned_to = p_admin_id,
             updated_at = v_now
       WHERE id = p_report_id;
    ELSE
      UPDATE public.info_moderation
         SET status = 'resolved',
             resolution = 'Administrator account status set to ' || p_new_status || ': ' || v_reason,
             moderation_notes = v_reason,
             assigned_to = p_admin_id,
             resolved_at = v_now,
             updated_at = v_now
       WHERE id = p_report_id;
    END IF;
  END IF;

  INSERT INTO public.moderation_decisions (
    case_id, affected_user_id, reviewer_id, reviewer_role, decision_type,
    violation_category, reason, reviewer_remarks, previous_status, new_status,
    suspension_duration_days, effective_at, expires_at, created_at
  )
  VALUES (
    v_case_id, p_user_id, p_admin_id, v_actor_role, v_decision_type,
    v_report.report_type, v_reason, v_reason, v_previous_status, p_new_status,
    CASE WHEN p_new_status = 'suspended' THEN p_duration_days ELSE NULL END,
    CASE WHEN p_new_status IN ('suspended', 'banned') THEN v_now ELSE NULL END,
    v_expiration,
    v_now
  )
  RETURNING id INTO v_decision_id;

  IF p_new_status = 'pending' THEN
    v_title := 'Account under review';
    v_message := 'Your account has been reported and is currently under review by the administration. No final decision has been made yet.';
    v_notification_type := 'warning';
  ELSIF p_new_status = 'suspended' THEN
    v_title := 'Account temporarily suspended';
    v_message := format(
      'Your account has been temporarily suspended due to a violation of our community guidelines.%sReason: %s%sDuration: %s%sSuspension Ends: %s%sYou will regain access to your account once the suspension period has ended.',
      E'\n\n', v_reason, E'\n',
      CASE
        WHEN p_duration_days >= 30 AND p_duration_days % 30 = 0 THEN format(
          '%s month%s',
          p_duration_days / 30,
          CASE WHEN p_duration_days / 30 = 1 THEN '' ELSE 's' END
        )
        WHEN p_duration_days >= 30 THEN format(
          '%s month%s and %s day%s',
          p_duration_days / 30,
          CASE WHEN p_duration_days / 30 = 1 THEN '' ELSE 's' END,
          p_duration_days % 30,
          CASE WHEN p_duration_days % 30 = 1 THEN '' ELSE 's' END
        )
        ELSE format('%s day%s', p_duration_days, CASE WHEN p_duration_days = 1 THEN '' ELSE 's' END)
      END,
      E'\n',
      to_char(v_expiration AT TIME ZONE 'Asia/Manila', 'FMMonth DD, YYYY HH12:MI AM'),
      E'\n\n'
    );
    v_notification_type := 'account_suspension';
  ELSIF p_new_status = 'banned' THEN
    v_title := 'Account permanently banned';
    v_message := 'Your account has been permanently banned due to a violation of our community guidelines.' || E'\n\nReason: ' || v_reason || E'\n\nYour account access has been permanently restricted. If you believe this decision was made incorrectly, you may submit an appeal through the available support channel.';
    v_notification_type := 'account_suspension';
  ELSE
    v_title := 'Account restored';
    v_message := 'Your account is now active again. You can access and use your account normally.';
    v_notification_type := 'success';
  END IF;

  INSERT INTO public.info_notifications (
    user_id, title, message, type, is_read, link, actor_id,
    moderation_decision_id, created_at, updated_at
  )
  VALUES (
    p_user_id, v_title, v_message, v_notification_type, FALSE,
    '/info/user/moderation-details/' || v_decision_id::TEXT,
    p_admin_id, v_decision_id, v_now, v_now
  );

  INSERT INTO public.info_audit_log (
    user_id, action, table_name, record_id, changes, created_at
  )
  VALUES (
    p_admin_id,
    lower(v_decision_type),
    CASE WHEN v_restriction_id IS NOT NULL THEN 'admin_user_bans' ELSE 'info_users' END,
    COALESCE(v_restriction_id, p_user_id),
    jsonb_build_object(
      'affectedUserId', p_user_id,
      'actorId', p_admin_id,
      'actorRole', v_actor_role,
      'previousStatus', v_previous_status,
      'newStatus', p_new_status,
      'action', v_decision_type,
      'reason', v_reason,
      'timestamp', v_now,
      'durationDays', CASE WHEN p_new_status = 'suspended' THEN p_duration_days ELSE NULL END,
      'suspensionExpiresAt', v_expiration,
      'relatedReportId', p_report_id,
      'moderationDecisionId', v_decision_id
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'decision_id', v_decision_id,
    'restriction_id', v_restriction_id,
    'user_id', p_user_id,
    'action', v_decision_type,
    'previous_status', v_previous_status,
    'new_status', p_new_status,
    'duration_days', CASE WHEN p_new_status = 'suspended' THEN p_duration_days ELSE NULL END,
    'expires_at', v_expiration,
    'effective_at', v_now,
    'case_id', p_report_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_account_status(UUID, UUID, TEXT, TEXT, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(UUID, UUID, TEXT, TEXT, INTEGER, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.process_expired_admin_suspensions(p_limit INTEGER DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ban public.admin_user_bans%ROWTYPE;
  v_account public.info_users%ROWTYPE;
  v_original_decision public.moderation_decisions%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_new_status TEXT;
  v_decision_id UUID;
  v_processed INTEGER := 0;
  v_restored INTEGER := 0;
  v_preserved INTEGER := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;

  FOR v_ban IN
    SELECT ban.*
      FROM public.admin_user_bans AS ban
     WHERE ban.ban_type = 'suspension'
       AND ban.lifted_at IS NULL
       AND ban.expires_at IS NOT NULL
       AND ban.expires_at <= v_now
       AND ban.expiration_processed_at IS NULL
       AND ban.expiration_review_required_at IS NULL
       AND EXISTS (
         SELECT 1
           FROM public.moderation_decisions AS decision
          WHERE decision.affected_user_id = ban.user_id
            AND decision.decision_type = 'EXCEPTIONAL_SUSPENSION_APPROVED'
            AND decision.investigation_id IS NULL
            AND decision.effective_at = ban.banned_at
            AND decision.expires_at = ban.expires_at
       )
     ORDER BY ban.expires_at, ban.id
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_account
      FROM public.info_users
     WHERE id = v_ban.user_id
     FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.admin_user_bans
         SET expiration_review_required_at = v_now
       WHERE id = v_ban.id;
      CONTINUE;
    END IF;

    SELECT CASE
      WHEN bool_or(other.ban_type = 'permanent') THEN 'banned'
      WHEN bool_or(other.ban_type = 'suspension') THEN 'suspended'
      ELSE NULL
    END
      INTO v_new_status
      FROM public.admin_user_bans AS other
     WHERE other.user_id = v_ban.user_id
       AND other.id <> v_ban.id
       AND other.lifted_at IS NULL
       AND (other.expires_at IS NULL OR other.expires_at > v_now)
       AND other.ban_type IN ('permanent', 'suspension');

    IF v_new_status IS NULL THEN
      v_new_status := CASE
        WHEN v_account.status = 'suspended' THEN 'active'
        ELSE v_account.status
      END;
    END IF;

    UPDATE public.admin_user_bans
       SET lifted_at = v_ban.expires_at,
           lift_reason = 'Temporary suspension expired automatically',
           expiration_processed_at = v_now
     WHERE id = v_ban.id
       AND lifted_at IS NULL
       AND expiration_processed_at IS NULL;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.info_users
       SET status = v_new_status,
           updated_at = v_now
     WHERE id = v_ban.user_id
       AND status IS DISTINCT FROM v_new_status;

    SELECT decision.* INTO v_original_decision
      FROM public.moderation_decisions AS decision
     WHERE decision.affected_user_id = v_ban.user_id
       AND decision.decision_type = 'EXCEPTIONAL_SUSPENSION_APPROVED'
       AND decision.investigation_id IS NULL
       AND decision.effective_at = v_ban.banned_at
       AND decision.expires_at = v_ban.expires_at
     ORDER BY decision.created_at DESC
     LIMIT 1
     FOR UPDATE;

    INSERT INTO public.moderation_decisions (
      case_id, investigation_id, affected_user_id, reviewer_id, reviewer_role,
      decision_type, violation_category, reason, reviewer_remarks, previous_status,
      new_status, suspension_duration_days, effective_at, expires_at,
      original_decision_id, created_at
    )
    VALUES (
      v_original_decision.case_id, NULL, v_ban.user_id, NULL, 'system',
      'SUSPENSION_EXPIRED', v_original_decision.violation_category,
      'Temporary suspension expired at its approved expiration time',
      'Automatic expiration processing', v_account.status, v_new_status,
      v_original_decision.suspension_duration_days, v_ban.expires_at,
      v_ban.expires_at, v_original_decision.id, v_now
    )
    RETURNING id INTO v_decision_id;

    INSERT INTO public.info_notifications (
      user_id, title, message, type, is_read, link, moderation_decision_id, created_at, updated_at
    )
    VALUES (
      v_ban.user_id,
      CASE WHEN v_new_status = 'active' THEN 'Account suspension lifted' ELSE 'Suspension period ended' END,
      CASE WHEN v_new_status = 'active'
        THEN 'Your account suspension has expired. Your account is now active again.'
        ELSE 'Your suspension period has ended, but another active restriction remains on your account.'
      END,
      'success',
      FALSE,
      '/info/user/moderation-details/' || v_decision_id::TEXT,
      v_decision_id,
      v_now,
      v_now
    );

    INSERT INTO public.info_audit_log (
      user_id, action, table_name, record_id, changes, created_at
    )
    VALUES (
      NULL, 'suspension-expired', 'admin_user_bans', v_ban.id,
      jsonb_build_object(
        'affectedUserId', v_ban.user_id,
        'previousStatus', v_account.status,
        'newStatus', v_new_status,
        'action', 'automatic-suspension-expiration',
        'timestamp', v_now,
        'reason', 'Temporary suspension expired automatically',
        'relatedReportId', v_original_decision.case_id,
        'moderationDecisionId', v_decision_id,
        'expiresAt', v_ban.expires_at
      ),
      v_now
    );

    v_processed := v_processed + 1;
    IF v_new_status = 'active' THEN
      v_restored := v_restored + 1;
    ELSE
      v_preserved := v_preserved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'restored', v_restored,
    'preserved', v_preserved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_expired_admin_suspensions(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_expired_admin_suspensions(INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.notify_moderation_decision_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ban public.admin_user_bans%ROWTYPE;
  v_username TEXT;
BEGIN
  IF NEW.decision_type NOT IN (
    'ACCOUNT_REVIEW_PENDING',
    'SUSPENSION_APPROVED',
    'EXCEPTIONAL_SUSPENSION_APPROVED',
    'PERMANENT_BAN_APPROVED',
    'SUSPENSION_LIFTED',
    'SUSPENSION_REVERSED',
    'PERMANENT_BAN_REVERSED',
    'SUSPENSION_DURATION_REDUCED',
    'SUSPENSION_EXPIRED',
    'ACCOUNT_RESTORED'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_username
    FROM public.info_users
   WHERE id = NEW.affected_user_id;

  IF NEW.decision_type = 'ACCOUNT_REVIEW_PENDING' THEN
    PERFORM public.enqueue_moderation_email(
      'decision:' || NEW.id::TEXT,
      NEW.affected_user_id,
      'account_review_pending',
      jsonb_build_object('username', v_username)
    );
  ELSIF NEW.decision_type IN ('SUSPENSION_APPROVED', 'EXCEPTIONAL_SUSPENSION_APPROVED') THEN
    SELECT * INTO v_ban
      FROM public.admin_user_bans
     WHERE user_id = NEW.affected_user_id
       AND ban_type = 'suspension'
       AND expires_at = NEW.expires_at
     ORDER BY banned_at DESC
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    PERFORM public.enqueue_moderation_email(
      'decision:' || NEW.id::TEXT,
      NEW.affected_user_id,
      'account_suspension',
      jsonb_build_object(
        'username', v_username,
        'reason', NEW.reason,
        'guideline', NEW.violation_category,
        'startAt', NEW.effective_at,
        'expiresAt', NEW.expires_at,
        'caseReference', v_ban.id
      )
    );
  ELSIF NEW.decision_type = 'PERMANENT_BAN_APPROVED' THEN
    SELECT * INTO v_ban
      FROM public.admin_user_bans
     WHERE user_id = NEW.affected_user_id
       AND ban_type = 'permanent'
       AND banned_at = NEW.effective_at
     ORDER BY banned_at DESC
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    PERFORM public.enqueue_moderation_email(
      'decision:' || NEW.id::TEXT,
      NEW.affected_user_id,
      'permanent_ban',
      jsonb_build_object(
        'username', v_username,
        'reason', NEW.reason,
        'guideline', NEW.violation_category,
        'startAt', NEW.effective_at,
        'caseReference', v_ban.id
      )
    );
  ELSIF NEW.decision_type = 'SUSPENSION_DURATION_REDUCED' THEN
    PERFORM public.enqueue_moderation_email(
      'decision:' || NEW.id::TEXT,
      NEW.affected_user_id,
      'account_suspension_duration_changed',
      jsonb_build_object(
        'username', v_username,
        'reason', NEW.reason,
        'guideline', NEW.violation_category,
        'startAt', NEW.effective_at,
        'expiresAt', NEW.expires_at
      )
    );
  ELSIF NEW.decision_type = 'PERMANENT_BAN_REVERSED' THEN
    PERFORM public.enqueue_moderation_email(
      'decision:' || NEW.id::TEXT,
      NEW.affected_user_id,
      'permanent_ban_reversed',
      jsonb_build_object('username', v_username, 'newStatus', NEW.new_status)
    );
  ELSIF NEW.decision_type IN ('SUSPENSION_LIFTED', 'SUSPENSION_EXPIRED')
        AND NEW.new_status IS DISTINCT FROM 'active' THEN
    PERFORM public.enqueue_moderation_email(
      'decision:' || NEW.id::TEXT,
      NEW.affected_user_id,
      'account_suspension_expired_restricted',
      jsonb_build_object('username', v_username, 'newStatus', NEW.new_status)
    );
  ELSIF NEW.new_status = 'active' THEN
    PERFORM public.enqueue_moderation_email(
      'decision:' || NEW.id::TEXT,
      NEW.affected_user_id,
      'account_suspension_lifted',
      jsonb_build_object('username', v_username, 'newStatus', NEW.new_status)
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
