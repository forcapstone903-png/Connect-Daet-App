BEGIN;

ALTER TABLE public.admin_user_bans
  ADD COLUMN IF NOT EXISTS expiration_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expiration_review_required_at TIMESTAMPTZ;

ALTER TABLE public.user_moderation_appeals
  ADD COLUMN IF NOT EXISTS restriction_id UUID REFERENCES public.admin_user_bans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS explanation TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();

ALTER TABLE public.user_moderation_appeals
  DROP CONSTRAINT IF EXISTS user_moderation_appeals_status_check,
  DROP CONSTRAINT IF EXISTS user_moderation_appeals_appeal_type_check;

ALTER TABLE public.user_moderation_appeals
  ADD CONSTRAINT user_moderation_appeals_status_check
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'more_information_required')),
  ADD CONSTRAINT user_moderation_appeals_appeal_type_check
    CHECK (appeal_type IN ('posting_restriction', 'account_suspension', 'permanent_ban'));

DROP INDEX IF EXISTS public.user_moderation_appeals_one_pending_idx;
CREATE UNIQUE INDEX user_moderation_appeals_one_open_idx
  ON public.user_moderation_appeals (user_id)
  WHERE status IN ('pending', 'under_review', 'more_information_required');

CREATE INDEX IF NOT EXISTS admin_user_bans_expiration_due_idx
  ON public.admin_user_bans (expires_at, id)
  WHERE ban_type = 'suspension'
    AND lifted_at IS NULL
    AND expiration_processed_at IS NULL
    AND expiration_review_required_at IS NULL;

CREATE TABLE IF NOT EXISTS public.moderation_appeal_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id UUID NOT NULL REFERENCES public.user_moderation_appeals(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  reviewer_role TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  previous_expires_at TIMESTAMPTZ,
  new_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.moderation_appeal_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_appeal_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.moderation_appeal_reviews TO authenticated;
GRANT ALL ON TABLE public.moderation_appeal_reviews TO service_role;

CREATE POLICY moderation_appeal_reviews_staff_select
  ON public.moderation_appeal_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_moderator(auth.uid()));

CREATE TABLE IF NOT EXISTS public.moderation_email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key TEXT NOT NULL UNIQUE,
  recipient_user_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS moderation_email_outbox_pending_idx
  ON public.moderation_email_outbox (available_at, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.moderation_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_email_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.moderation_email_outbox TO service_role;

CREATE TABLE IF NOT EXISTS public.account_appeal_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restriction_id UUID NOT NULL REFERENCES public.admin_user_bans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  appeal_id UUID REFERENCES public.user_moderation_appeals(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.account_appeal_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_appeal_access_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.account_appeal_access_requests TO service_role;

CREATE INDEX IF NOT EXISTS account_appeal_access_requests_rate_limit_idx
  ON public.account_appeal_access_requests (restriction_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.account_appeal_access_rate_limits (
  request_fingerprint TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 1)
);

ALTER TABLE public.account_appeal_access_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_appeal_access_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.account_appeal_access_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_moderation_email(
  p_dedupe_key TEXT,
  p_user_id UUID,
  p_event_type TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF NULLIF(BTRIM(p_dedupe_key), '') IS NULL OR p_user_id IS NULL
     OR p_event_type NOT IN (
       'account_warning',
       'account_suspension',
       'account_suspension_lifted',
       'account_suspension_expired_restricted',
       'account_suspension_duration_changed',
       'permanent_ban',
       'permanent_ban_reversed',
       'appeal_decision',
       'appeal_more_information'
     ) THEN
    RAISE EXCEPTION 'A valid moderation email event is required';
  END IF;

  INSERT INTO public.moderation_email_outbox (
    dedupe_key, recipient_user_id, event_type, payload
  )
  VALUES (
    p_dedupe_key, p_user_id, p_event_type, COALESCE(p_payload, '{}'::JSONB)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_moderation_email(TEXT, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_moderation_email(TEXT, UUID, TEXT, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_moderation_email_outbox(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  outbox_id UUID,
  event_type TEXT,
  recipient_email TEXT,
  payload JSONB,
  attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT outbox.id
      FROM public.moderation_email_outbox AS outbox
     WHERE outbox.attempts < 8
       AND outbox.available_at <= clock_timestamp()
       AND (
         outbox.status = 'pending'
         OR (outbox.status = 'processing' AND outbox.lease_until <= clock_timestamp())
       )
     ORDER BY outbox.available_at, outbox.created_at
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
     FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.moderation_email_outbox AS outbox
       SET status = 'processing',
           attempts = outbox.attempts + 1,
           lease_until = clock_timestamp() + INTERVAL '10 minutes',
           last_error = NULL
      FROM candidates
     WHERE outbox.id = candidates.id
     RETURNING outbox.id, outbox.event_type, outbox.recipient_user_id,
               outbox.payload, outbox.attempts
  )
  SELECT claimed.id,
         claimed.event_type,
         account.email,
         claimed.payload,
         claimed.attempts
    FROM claimed
    LEFT JOIN public.info_users AS account ON account.id = claimed.recipient_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_moderation_email_outbox(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_moderation_email_outbox(INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finish_moderation_email_outbox(
  p_outbox_id UUID,
  p_sent BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempts INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_outbox_id IS NULL OR p_sent IS NULL THEN
    RAISE EXCEPTION 'A valid email delivery result is required';
  END IF;

  SELECT attempts INTO v_attempts
    FROM public.moderation_email_outbox
   WHERE id = p_outbox_id
     AND status = 'processing'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This email delivery is no longer claimed';
  END IF;

  UPDATE public.moderation_email_outbox
     SET status = CASE
           WHEN p_sent THEN 'sent'
           WHEN v_attempts >= 8 THEN 'failed'
           ELSE 'pending'
         END,
         available_at = CASE
           WHEN p_sent OR v_attempts >= 8 THEN available_at
           ELSE clock_timestamp() + make_interval(mins => LEAST(v_attempts * 5, 60))
         END,
         lease_until = NULL,
         last_error = CASE WHEN p_sent THEN NULL ELSE LEFT(COALESCE(p_error, 'Delivery failed'), 500) END,
         sent_at = CASE WHEN p_sent THEN clock_timestamp() ELSE NULL END
   WHERE id = p_outbox_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_moderation_email_outbox(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_moderation_email_outbox(UUID, BOOLEAN, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.process_expired_account_suspensions(p_limit INTEGER DEFAULT 100)
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
  v_other_status TEXT;
  v_new_status TEXT;
  v_expired INTEGER := 0;
  v_restored INTEGER := 0;
  v_preserved INTEGER := 0;
  v_review_required INTEGER := 0;
  v_decision_id UUID;
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
      v_review_required := v_review_required + 1;
      CONTINUE;
    END IF;

    SELECT decision.* INTO v_original_decision
      FROM public.moderation_decisions AS decision
      JOIN public.account_moderation_investigations AS investigation
        ON investigation.id = decision.investigation_id
       AND investigation.report_id = decision.case_id
       AND investigation.affected_user_id = decision.affected_user_id
     WHERE decision.affected_user_id = v_ban.user_id
       AND decision.decision_type IN ('SUSPENSION_APPROVED', 'EXCEPTIONAL_SUSPENSION_APPROVED')
       AND decision.new_status = 'suspended'
       AND (
         decision.expires_at = v_ban.expires_at
         OR EXISTS (
           SELECT 1
             FROM public.moderation_decisions AS duration_change
            WHERE duration_change.original_decision_id = decision.id
              AND duration_change.decision_type = 'SUSPENSION_DURATION_REDUCED'
              AND duration_change.expires_at = v_ban.expires_at
         )
       )
       AND investigation.status = 'approved_suspension'
     ORDER BY decision.created_at DESC
     LIMIT 1
     FOR UPDATE OF decision;

    IF NOT FOUND THEN
      UPDATE public.admin_user_bans
         SET expiration_review_required_at = v_now
       WHERE id = v_ban.id;
      INSERT INTO public.info_audit_log (
        user_id, action, table_name, record_id, changes, created_at
      )
      VALUES (
        NULL,
        'suspension-expiration-review-required',
        'admin_user_bans',
        v_ban.id,
        jsonb_build_object(
          'userId', v_ban.user_id,
          'previousStatus', v_account.status,
          'newStatus', v_account.status,
          'expiresAt', v_ban.expires_at,
          'reason', 'No matching approved suspension case was found'
        ),
        v_now
      );
      INSERT INTO public.info_notifications (
        user_id, title, message, type, is_read, link, created_at, updated_at
      )
      SELECT staff.id,
             'Suspension expiration needs review',
             'An expired account suspension could not be matched to an approved investigation. Account status was not changed.',
             'warning',
             FALSE,
             '/info/admin/account-oversight',
             v_now,
             v_now
        FROM public.info_users AS staff
       WHERE staff.status = 'active'
         AND lower(staff.user_type) IN ('admin', 'administrator');
      v_review_required := v_review_required + 1;
      CONTINUE;
    END IF;

    SELECT CASE
             WHEN bool_or(other.ban_type = 'permanent') THEN 'banned'
             WHEN bool_or(other.ban_type = 'suspension') THEN 'suspended'
             ELSE NULL
           END
      INTO v_other_status
      FROM public.admin_user_bans AS other
     WHERE other.user_id = v_ban.user_id
       AND other.id <> v_ban.id
       AND other.lifted_at IS NULL
       AND (other.expires_at IS NULL OR other.expires_at > v_now)
       AND other.ban_type IN ('permanent', 'suspension');

    IF v_other_status IS NOT NULL THEN
      v_new_status := v_other_status;
    ELSIF v_account.status = 'suspended' THEN
      v_new_status := 'active';
    ELSE
      v_new_status := v_account.status;
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

    INSERT INTO public.moderation_decisions (
      case_id,
      investigation_id,
      affected_user_id,
      reviewer_id,
      reviewer_role,
      decision_type,
      violation_category,
      reason,
      previous_status,
      new_status,
      suspension_duration_days,
      effective_at,
      expires_at,
      original_decision_id,
      created_at
    )
    VALUES (
      v_original_decision.case_id,
      v_original_decision.investigation_id,
      v_ban.user_id,
      NULL,
      'system',
      'SUSPENSION_EXPIRED',
      v_original_decision.violation_category,
      'Temporary suspension expired at its approved expiration time',
      v_account.status,
      v_new_status,
      v_original_decision.suspension_duration_days,
      v_ban.expires_at,
      v_ban.expires_at,
      v_original_decision.id,
      v_now
    )
    RETURNING id INTO v_decision_id;

    INSERT INTO public.info_notifications (
      user_id, title, message, type, is_read, link, created_at, updated_at
    )
    VALUES (
      v_ban.user_id,
      CASE WHEN v_new_status = 'active' THEN 'Account suspension lifted' ELSE 'Suspension period ended' END,
      CASE
        WHEN v_new_status = 'active'
          THEN 'Your account suspension expired and your account has been restored to Active.'
        ELSE 'Your suspension period expired, but another active account restriction remains. Your account status is ' ||
          upper(v_new_status) || '.'
      END,
      CASE WHEN v_new_status = 'active' THEN 'success' ELSE 'warning' END,
      FALSE,
      '/info/user/notifications',
      v_now,
      v_now
    );

    INSERT INTO public.info_audit_log (
      user_id, action, table_name, record_id, changes, created_at
    )
    VALUES (
      NULL,
      'suspension-expired-automatically',
      'admin_user_bans',
      v_ban.id,
      jsonb_build_object(
        'userId', v_ban.user_id,
        'previousStatus', v_account.status,
        'newStatus', v_new_status,
        'action', 'automatic_expiration',
        'expirationTimestamp', v_ban.expires_at,
        'processedAt', v_now,
        'relatedCaseId', v_original_decision.case_id,
        'investigationId', v_original_decision.investigation_id,
        'decisionId', v_decision_id,
        'otherAccountRestriction', v_other_status IS NOT NULL
      ),
      v_now
    );

    PERFORM public.enqueue_moderation_email(
      'suspension-expired:' || v_ban.id::TEXT,
      v_ban.user_id,
      CASE WHEN v_new_status = 'active'
        THEN 'account_suspension_lifted'
        ELSE 'account_suspension_expired_restricted'
      END,
      jsonb_build_object(
        'username', v_account.username,
        'reason', v_ban.reason,
        'guideline', v_original_decision.violation_category,
        'startAt', v_ban.banned_at,
        'expiresAt', v_ban.expires_at,
        'caseReference', v_ban.id,
        'newStatus', v_new_status
      )
    );

    v_expired := v_expired + 1;
    IF v_new_status = 'active' AND v_account.status = 'suspended' THEN
      v_restored := v_restored + 1;
    ELSE
      v_preserved := v_preserved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'expired', v_expired,
    'restored', v_restored,
    'statusPreserved', v_preserved,
    'reviewRequired', v_review_required,
    'processedAt', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_expired_account_suspensions(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_expired_account_suspensions(INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_banned_account_appeal_access_request(
  p_restriction_id UUID,
  p_email TEXT,
  p_request_fingerprint TEXT,
  p_token_hash TEXT,
  p_token_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ban public.admin_user_bans%ROWTYPE;
  v_account public.info_users%ROWTYPE;
  v_appeal_id UUID;
  v_request_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_attempt_count INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_restriction_id IS NULL OR NULLIF(BTRIM(p_email), '') IS NULL
     OR p_request_fingerprint IS NULL OR length(p_request_fingerprint) <> 64
     OR p_token_hash IS NULL OR length(p_token_hash) <> 64
     OR p_token_expires_at IS NULL
     OR p_token_expires_at <= v_now OR p_token_expires_at > v_now + INTERVAL '45 minutes' THEN
    RAISE EXCEPTION 'A valid appeal access request is required';
  END IF;

  DELETE FROM public.account_appeal_access_rate_limits
   WHERE window_started_at < v_now - INTERVAL '1 day';
  INSERT INTO public.account_appeal_access_rate_limits (
    request_fingerprint, window_started_at, attempt_count
  )
  VALUES (p_request_fingerprint, v_now, 1)
  ON CONFLICT (request_fingerprint) DO UPDATE
     SET window_started_at = CASE
           WHEN account_appeal_access_rate_limits.window_started_at <= v_now - INTERVAL '1 hour' THEN v_now
           ELSE account_appeal_access_rate_limits.window_started_at
         END,
         attempt_count = CASE
           WHEN account_appeal_access_rate_limits.window_started_at <= v_now - INTERVAL '1 hour' THEN 1
           ELSE account_appeal_access_rate_limits.attempt_count + 1
         END
  RETURNING attempt_count INTO v_attempt_count;
  IF v_attempt_count > 6 THEN
    RETURN jsonb_build_object('accepted', FALSE);
  END IF;

  SELECT * INTO v_ban
    FROM public.admin_user_bans
   WHERE id = p_restriction_id
     AND ban_type = 'permanent'
     AND lifted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', FALSE);
  END IF;

  SELECT * INTO v_account
    FROM public.info_users
   WHERE id = v_ban.user_id
     AND status = 'banned'
     AND account_deactivated_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR v_account.email IS NULL
     OR lower(BTRIM(v_account.email)) IS DISTINCT FROM lower(BTRIM(p_email)) THEN
    RETURN jsonb_build_object('accepted', FALSE);
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.account_appeal_access_requests AS existing
     WHERE existing.restriction_id = p_restriction_id
       AND existing.created_at > v_now - INTERVAL '15 minutes'
  ) THEN
    RETURN jsonb_build_object('accepted', FALSE);
  END IF;

  SELECT id INTO v_appeal_id
    FROM public.user_moderation_appeals
   WHERE restriction_id = p_restriction_id
     AND status = 'more_information_required'
   ORDER BY created_at DESC
   LIMIT 1;

  INSERT INTO public.account_appeal_access_requests (
    restriction_id, user_id, appeal_id, token_hash, expires_at
  )
  VALUES (
    p_restriction_id, v_ban.user_id, v_appeal_id, p_token_hash, p_token_expires_at
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'accepted', TRUE,
    'request_id', v_request_id,
    'user_id', v_ban.user_id,
    'appeal_id', v_appeal_id,
    'email', v_account.email,
    'restriction_id', v_ban.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_banned_account_appeal_access_request(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_banned_account_appeal_access_request(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION public.submit_user_moderation_appeal_v2(
  p_user_id UUID,
  p_appeal_id UUID,
  p_restriction_id UUID,
  p_reason TEXT,
  p_explanation TEXT,
  p_appeal_type TEXT,
  p_evidence_paths TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_access_token_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account public.info_users%ROWTYPE;
  v_ban public.admin_user_bans%ROWTYPE;
  v_access public.account_appeal_access_requests%ROWTYPE;
  v_existing public.user_moderation_appeals%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_explanation TEXT := NULLIF(BTRIM(p_explanation), '');
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_user_id IS NULL OR p_appeal_id IS NULL OR p_restriction_id IS NULL
     OR p_appeal_type IS NULL
     OR p_appeal_type NOT IN ('posting_restriction', 'account_suspension', 'permanent_ban')
     OR v_reason IS NULL OR char_length(v_reason) > 2000
     OR v_explanation IS NULL OR char_length(v_explanation) > 5000
     OR cardinality(COALESCE(p_evidence_paths, ARRAY[]::TEXT[])) > 3
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(p_evidence_paths, ARRAY[]::TEXT[])) AS evidence(path)
        WHERE evidence.path IS NULL
           OR evidence.path NOT LIKE (p_user_id::TEXT || '/' || p_appeal_id::TEXT || '/%')
     ) THEN
    RAISE EXCEPTION 'A valid appeal reason, explanation, and evidence are required';
  END IF;

  SELECT * INTO v_account
    FROM public.info_users
   WHERE id = p_user_id
     AND account_deactivated_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account is not eligible to submit an appeal';
  END IF;

  SELECT * INTO v_ban
    FROM public.admin_user_bans
   WHERE id = p_restriction_id
     AND user_id = p_user_id
   FOR UPDATE;
  IF NOT FOUND OR v_ban.lifted_at IS NOT NULL
     OR (v_ban.expires_at IS NOT NULL AND v_ban.expires_at <= v_now) THEN
    RAISE EXCEPTION 'There is no active restriction matching this case reference';
  END IF;
  IF (p_appeal_type = 'account_suspension'
      AND (v_account.status <> 'suspended' OR v_ban.ban_type <> 'suspension'))
     OR (p_appeal_type = 'permanent_ban'
      AND (v_account.status <> 'banned' OR v_ban.ban_type <> 'permanent'))
     OR (p_appeal_type = 'posting_restriction'
      AND (v_account.status IN ('suspended', 'banned') OR v_ban.ban_type <> 'posting')) THEN
    RAISE EXCEPTION 'This case reference does not match an appealable restriction';
  END IF;

  IF p_access_token_hash IS NOT NULL THEN
    SELECT * INTO v_access
      FROM public.account_appeal_access_requests
     WHERE restriction_id = p_restriction_id
       AND user_id = p_user_id
       AND token_hash = p_access_token_hash
       AND consumed_at IS NULL
       AND expires_at > v_now
     FOR UPDATE;
    IF NOT FOUND OR v_ban.ban_type <> 'permanent' OR v_account.status <> 'banned' THEN
      RAISE EXCEPTION 'This appeal access link is invalid or expired';
    END IF;
    IF v_access.appeal_id IS NOT NULL AND v_access.appeal_id <> p_appeal_id THEN
      RAISE EXCEPTION 'This appeal access link does not match the appeal';
    END IF;
  END IF;

  IF v_access.appeal_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.user_moderation_appeals
     WHERE id = v_access.appeal_id
       AND user_id = p_user_id
       AND restriction_id = p_restriction_id
       AND status = 'more_information_required'
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This appeal is no longer waiting for additional information';
    END IF;
  ELSIF p_access_token_hash IS NULL THEN
    SELECT * INTO v_existing
      FROM public.user_moderation_appeals
     WHERE id = p_appeal_id
       AND user_id = p_user_id
       AND restriction_id = p_restriction_id
       AND status = 'more_information_required'
     FOR UPDATE;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.appeal_type <> p_appeal_type THEN
      RAISE EXCEPTION 'This appeal link does not match the appeal type';
    END IF;
    IF cardinality(COALESCE(v_existing.evidence_paths, ARRAY[]::TEXT[]))
       + cardinality(COALESCE(p_evidence_paths, ARRAY[]::TEXT[])) > 3 THEN
      RAISE EXCEPTION 'No more than three evidence files can be submitted per appeal';
    END IF;
    UPDATE public.user_moderation_appeals
       SET explanation = concat_ws(E'\n\n', NULLIF(explanation, ''), v_explanation),
           evidence_paths = COALESCE(evidence_paths, ARRAY[]::TEXT[]) || COALESCE(p_evidence_paths, ARRAY[]::TEXT[]),
           status = 'pending',
           decision_notes = NULL,
           reviewed_by = NULL,
           reviewed_at = NULL,
           updated_at = v_now
     WHERE id = v_existing.id;
    p_appeal_id := v_existing.id;
  ELSE
    INSERT INTO public.user_moderation_appeals (
      id, user_id, restriction_id, reason, explanation, appeal_type, evidence_paths, status, created_at
    )
    VALUES (
      p_appeal_id, p_user_id, p_restriction_id, v_reason, v_explanation,
      p_appeal_type, COALESCE(p_evidence_paths, ARRAY[]::TEXT[]), 'pending', v_now
    );
  END IF;

  IF p_access_token_hash IS NOT NULL THEN
    UPDATE public.account_appeal_access_requests
       SET consumed_at = v_now
     WHERE id = v_access.id
       AND consumed_at IS NULL;
  END IF;

  INSERT INTO public.info_notifications (
    user_id, title, message, type, is_read, link, created_at, updated_at
  )
  SELECT staff.id,
         'Account appeal submitted',
         'A user submitted an account restriction appeal that requires staff review.',
         'warning',
         FALSE,
         '/info/admin/moderation?tab=reports#appeals',
         v_now,
         v_now
    FROM public.info_users AS staff
   WHERE staff.status = 'active'
     AND lower(staff.user_type) IN ('admin', 'administrator', 'moderator', 'tourism_officer');

  INSERT INTO public.info_audit_log (
    user_id, action, table_name, record_id, changes, created_at
  )
  VALUES (
    p_user_id,
    CASE WHEN v_existing.id IS NULL THEN 'submit-user-appeal' ELSE 'respond-user-appeal' END,
    'user_moderation_appeals',
    p_appeal_id,
    jsonb_build_object(
      'restrictionId', p_restriction_id,
      'appealType', p_appeal_type,
      'status', 'pending',
      'submittedAt', v_now,
      'evidenceCount', cardinality(COALESCE(p_evidence_paths, ARRAY[]::TEXT[]))
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'id', p_appeal_id,
    'user_id', p_user_id,
    'restriction_id', p_restriction_id,
    'appeal_type', p_appeal_type,
    'status', 'pending',
    'created_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_user_moderation_appeal_v2(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT[], TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_user_moderation_appeal_v2(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT[], TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.review_user_moderation_appeal_v2(
  p_appeal_id UUID,
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
  v_appeal public.user_moderation_appeals%ROWTYPE;
  v_ban public.admin_user_bans%ROWTYPE;
  v_account public.info_users%ROWTYPE;
  v_original_decision public.moderation_decisions%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
  v_old_expires TIMESTAMPTZ;
  v_new_expires TIMESTAMPTZ;
  v_previous_status TEXT;
  v_new_status TEXT;
  v_review_status TEXT;
  v_email_event TEXT;
  v_decision_id UUID;
  v_account_restored BOOLEAN := FALSE;
  v_restriction_active BOOLEAN := FALSE;
  v_reviewer_role TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_reviewer_id IS NULL
     OR NOT public.is_staff_in(p_reviewer_id, ARRAY['moderator', 'tourism_officer', 'admin', 'administrator']) THEN
    RAISE EXCEPTION 'An active authorized staff reviewer is required';
  END IF;
  IF p_decision IS NULL
     OR p_decision NOT IN ('start_review', 'approve', 'reject', 'reduce_suspension', 'request_more_information')
     OR v_reason IS NULL OR char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'A valid appeal decision and reason are required';
  END IF;
  IF (p_decision = 'reduce_suspension'
      AND (p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 365))
     OR (p_decision <> 'reduce_suspension' AND p_duration_days IS NOT NULL) THEN
    RAISE EXCEPTION 'A valid reduced suspension duration is required only for duration changes';
  END IF;

  SELECT * INTO v_appeal
    FROM public.user_moderation_appeals
   WHERE id = p_appeal_id
   FOR UPDATE;
  IF NOT FOUND OR v_appeal.status NOT IN ('pending', 'under_review', 'more_information_required') THEN
    RAISE EXCEPTION 'This appeal is no longer open';
  END IF;

  SELECT * INTO v_ban
    FROM public.admin_user_bans
   WHERE id = v_appeal.restriction_id
     AND user_id = v_appeal.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The restriction for this appeal is no longer available';
  END IF;
  IF v_ban.banned_by = p_reviewer_id THEN
    RAISE EXCEPTION 'The original decision-maker cannot review this appeal';
  END IF;
  IF v_appeal.appeal_type = 'permanent_ban'
     AND p_decision IN ('approve', 'reject', 'reduce_suspension')
     AND NOT public.is_staff_in(p_reviewer_id, ARRAY['admin', 'administrator']) THEN
    RAISE EXCEPTION 'Only a System Administrator can decide a permanent ban appeal';
  END IF;
  IF v_appeal.appeal_type <> 'account_suspension' AND p_decision = 'reduce_suspension' THEN
    RAISE EXCEPTION 'Only an account suspension appeal can reduce suspension duration';
  END IF;
  IF p_decision = 'reduce_suspension' AND v_ban.ban_type <> 'suspension' THEN
    RAISE EXCEPTION 'Only a temporary suspension can have its duration reduced';
  END IF;

  SELECT * INTO v_account
    FROM public.info_users
   WHERE id = v_appeal.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The account for this appeal no longer exists';
  END IF;

  v_reviewer_role := lower((SELECT user_type FROM public.info_users WHERE id = p_reviewer_id));
  v_previous_status := v_account.status;
  v_new_status := v_account.status;
  v_review_status := v_appeal.status;
  v_old_expires := v_ban.expires_at;
  v_new_expires := v_ban.expires_at;

  SELECT decision.* INTO v_original_decision
    FROM public.moderation_decisions AS decision
   WHERE decision.affected_user_id = v_appeal.user_id
     AND decision.decision_type IN ('SUSPENSION_APPROVED', 'EXCEPTIONAL_SUSPENSION_APPROVED', 'PERMANENT_BAN_APPROVED')
     AND decision.new_status IN ('suspended', 'banned')
     AND decision.reviewer_id = v_ban.banned_by
     AND decision.effective_at = v_ban.banned_at
   ORDER BY decision.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF p_decision = 'start_review' THEN
    v_review_status := 'under_review';
  ELSIF p_decision = 'request_more_information' THEN
    v_review_status := 'more_information_required';
    v_email_event := 'appeal_more_information';
  ELSIF p_decision = 'reject' THEN
    v_review_status := 'rejected';
    v_email_event := 'appeal_decision';
  ELSIF p_decision = 'reduce_suspension' THEN
    IF v_ban.lifted_at IS NOT NULL OR v_ban.expires_at IS NULL OR v_ban.expires_at <= v_now THEN
      RAISE EXCEPTION 'The suspension is no longer active';
    END IF;
    IF p_duration_days >= CEIL(EXTRACT(EPOCH FROM (v_ban.expires_at - v_now)) / 86400.0)::INTEGER THEN
      RAISE EXCEPTION 'The new duration must be shorter than the remaining suspension';
    END IF;
    v_new_expires := v_now + make_interval(days => p_duration_days);
    UPDATE public.admin_user_bans
       SET expires_at = v_new_expires
     WHERE id = v_ban.id
       AND lifted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The suspension is no longer active';
    END IF;
    v_review_status := 'approved';
    v_email_event := NULL;
  ELSE
    IF v_ban.ban_type = 'permanent' AND v_account.status = 'banned'
       AND NOT public.is_staff_in(p_reviewer_id, ARRAY['admin', 'administrator']) THEN
      RAISE EXCEPTION 'Only a System Administrator can approve a permanent ban appeal';
    END IF;

    UPDATE public.admin_user_bans
       SET lifted_by = p_reviewer_id,
           lifted_at = v_now,
           lift_reason = v_reason
     WHERE id = v_ban.id
       AND lifted_at IS NULL
       AND (expires_at IS NULL OR expires_at > v_now);
    v_restriction_active := FOUND;

    SELECT CASE
             WHEN bool_or(other.ban_type = 'permanent') THEN 'banned'
             WHEN bool_or(other.ban_type = 'suspension') THEN 'suspended'
             ELSE NULL
           END
      INTO v_new_status
      FROM public.admin_user_bans AS other
     WHERE other.user_id = v_appeal.user_id
       AND other.id <> v_ban.id
       AND other.lifted_at IS NULL
       AND (other.expires_at IS NULL OR other.expires_at > v_now)
       AND other.ban_type IN ('permanent', 'suspension');

    IF v_new_status IS NULL THEN
      v_new_status := CASE
        WHEN v_account.status IN ('suspended', 'banned') THEN 'active'
        ELSE v_account.status
      END;
    END IF;
    IF v_new_status IS DISTINCT FROM v_account.status
       AND v_account.account_deactivated_at IS NULL THEN
      UPDATE public.info_users
         SET status = v_new_status,
             updated_at = v_now
       WHERE id = v_appeal.user_id;
      v_account_restored := v_new_status = 'active';
    END IF;
    v_review_status := 'approved';
    v_email_event := 'appeal_decision';
  END IF;

  UPDATE public.user_moderation_appeals
     SET status = v_review_status,
         decision_notes = v_reason,
         reviewed_by = p_reviewer_id,
         reviewed_at = v_now,
         updated_at = v_now
   WHERE id = v_appeal.id;

  INSERT INTO public.moderation_appeal_reviews (
    appeal_id, reviewer_id, reviewer_role, decision, reason,
    previous_status, new_status, previous_expires_at, new_expires_at, created_at
  )
  VALUES (
    v_appeal.id, p_reviewer_id, v_reviewer_role, p_decision, v_reason,
    v_appeal.status, v_review_status, v_old_expires, v_new_expires, v_now
  );

  INSERT INTO public.moderation_decisions (
    case_id, investigation_id, affected_user_id, reviewer_id, reviewer_role,
    decision_type, violation_category, reason, previous_status, new_status,
    suspension_duration_days, effective_at, expires_at, original_decision_id, created_at
  )
  VALUES (
    v_original_decision.case_id,
    v_original_decision.investigation_id,
    v_appeal.user_id,
    p_reviewer_id,
    v_reviewer_role,
    CASE p_decision
      WHEN 'approve' THEN 'APPEAL_APPROVED'
      WHEN 'reject' THEN 'APPEAL_REJECTED'
      WHEN 'reduce_suspension' THEN 'SUSPENSION_DURATION_REDUCED'
      WHEN 'request_more_information' THEN 'APPEAL_MORE_INFORMATION_REQUESTED'
      ELSE 'APPEAL_UNDER_REVIEW'
    END,
    v_original_decision.violation_category,
    v_reason,
    v_previous_status,
    v_new_status,
    CASE WHEN p_decision = 'reduce_suspension' THEN p_duration_days ELSE NULL END,
    CASE WHEN p_decision = 'reduce_suspension' THEN v_now ELSE NULL END,
    v_new_expires,
    v_original_decision.id,
    v_now
  )
  RETURNING id INTO v_decision_id;

  INSERT INTO public.info_notifications (
    user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
  )
  VALUES (
    v_appeal.user_id,
    CASE
      WHEN p_decision = 'request_more_information' THEN 'More appeal information requested'
      WHEN p_decision = 'reduce_suspension' THEN 'Suspension duration reduced'
      WHEN p_decision = 'approve' THEN 'Appeal approved'
      WHEN p_decision = 'reject' THEN 'Appeal rejected'
      ELSE 'Appeal under review'
    END,
    CASE
      WHEN p_decision = 'request_more_information' THEN 'Please provide additional information for your appeal: ' || v_reason
      WHEN p_decision = 'reduce_suspension' THEN format('Your suspension duration was reduced. The new expiration time is %s.', v_new_expires)
      WHEN p_decision = 'approve' AND v_new_status = 'active' THEN 'Your appeal was approved and your account restriction was lifted.'
      WHEN p_decision = 'approve' THEN 'Your appeal was approved. Another active restriction remains, so your account status is ' || upper(v_new_status) || '.'
      WHEN p_decision = 'reject' THEN 'Your appeal was rejected. The existing account restriction remains in effect.'
      ELSE 'A staff member has started reviewing your appeal.'
    END,
    CASE WHEN p_decision IN ('approve', 'reduce_suspension') THEN 'success' ELSE 'warning' END,
    FALSE,
    '/info/user/moderation-appeals',
    p_reviewer_id,
    v_now,
    v_now
  );

  INSERT INTO public.info_audit_log (
    user_id, action, table_name, record_id, changes, created_at
  )
  VALUES (
    p_reviewer_id,
    'moderation-appeal-' || p_decision,
    'user_moderation_appeals',
    v_appeal.id,
    jsonb_build_object(
      'appealId', v_appeal.id,
      'restrictionId', v_ban.id,
      'reviewerId', p_reviewer_id,
      'reviewerRole', v_reviewer_role,
      'decision', p_decision,
      'reason', v_reason,
      'previousStatus', v_previous_status,
      'newStatus', v_new_status,
      'previousAppealStatus', v_appeal.status,
      'newAppealStatus', v_review_status,
      'previousExpiresAt', v_old_expires,
      'newExpiresAt', v_new_expires,
      'accountRestored', v_account_restored,
      'restrictionLifted', v_restriction_active,
      'timestamp', v_now
    ),
    v_now
  );

  IF v_email_event IS NOT NULL AND v_email_event <> 'appeal_decision' THEN
    PERFORM public.enqueue_moderation_email(
      'appeal:' || v_appeal.id::TEXT || ':' || v_decision_id::TEXT,
      v_appeal.user_id,
      v_email_event,
      jsonb_build_object(
        'appealType', v_appeal.appeal_type,
        'decision', p_decision,
        'newStatus', v_new_status,
        'expiresAt', v_new_expires,
        'reason', CASE WHEN p_decision = 'request_more_information' THEN v_reason ELSE NULL END,
        'caseReference', v_ban.id
      )
    );
  ELSIF v_email_event = 'appeal_decision' THEN
    PERFORM public.enqueue_moderation_email(
      'appeal:' || v_appeal.id::TEXT || ':' || v_decision_id::TEXT,
      v_appeal.user_id,
      'appeal_decision',
      jsonb_build_object(
        'appealType', v_appeal.appeal_type,
        'decision', p_decision,
        'newStatus', v_new_status,
        'accountRestored', v_account_restored,
        'caseReference', v_ban.id,
        'reason', v_reason
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_appeal.id,
    'status', v_review_status,
    'appeal_type', v_appeal.appeal_type,
    'user_id', v_appeal.user_id,
    'reviewer_id', p_reviewer_id,
    'reviewed_at', v_now,
    'decision_notes', v_reason,
    'account_restored', v_account_restored,
    'restriction_lifted', v_restriction_active,
    'expires_at', v_new_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_user_moderation_appeal_v2(UUID, UUID, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_user_moderation_appeal_v2(UUID, UUID, TEXT, TEXT, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.review_user_moderation_appeal(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_moderators_of_account_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.reported_item_table IS DISTINCT FROM 'info_users'
     OR NEW.reported_item_id IS DISTINCT FROM NEW.reported_user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.info_notifications (
    user_id, title, message, type, is_read, link, created_at, updated_at
  )
  SELECT staff.id,
         'New account investigation assigned',
         'A new account report is ready for moderator investigation.',
         'moderation',
         FALSE,
         '/info/admin/moderation?tab=reports&reviewReportId=' || NEW.id::TEXT,
         NEW.created_at,
         NEW.created_at
    FROM public.info_users AS staff
   WHERE staff.status = 'active'
     AND lower(staff.user_type) = 'moderator';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS moderator_account_report_assignment_notification
  ON public.info_moderation;
CREATE TRIGGER moderator_account_report_assignment_notification
  AFTER INSERT ON public.info_moderation
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_moderators_of_account_report();

CREATE OR REPLACE FUNCTION public.notify_account_investigation_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.info_notifications (
    user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
  )
  SELECT staff.id,
         'New moderator investigation submitted',
         'A moderator submitted an account investigation for Tourism Officer review.',
         'moderation',
         FALSE,
         '/info/admin/suspension-cases?case=' || NEW.id::TEXT,
         NEW.moderator_id,
         NEW.submitted_at,
         NEW.submitted_at
    FROM public.info_users AS staff
   WHERE staff.status = 'active'
     AND lower(staff.user_type) = 'tourism_officer';

  INSERT INTO public.info_notifications (
    user_id, title, message, type, is_read, link, created_at, updated_at
  )
  SELECT NEW.moderator_id,
         'Account investigation assigned',
         'Your account report investigation was submitted and is now pending Tourism Officer review.',
         'moderation',
         FALSE,
         '/info/admin/moderation?tab=reports&reviewReportId=' || NEW.report_id::TEXT,
         NEW.submitted_at,
         NEW.submitted_at
  WHERE EXISTS (
    SELECT 1
      FROM public.info_users AS moderator
     WHERE moderator.id = NEW.moderator_id
       AND moderator.status = 'active'
       AND lower(moderator.user_type) = 'moderator'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_investigation_assignment_notification
  ON public.account_moderation_investigations;
CREATE TRIGGER account_investigation_assignment_notification
  AFTER INSERT ON public.account_moderation_investigations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_account_investigation_assignment();

CREATE OR REPLACE FUNCTION public.notify_moderator_account_investigation_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_moderator_id UUID;
  v_title TEXT;
  v_message TEXT;
BEGIN
  IF NEW.investigation_id IS NULL
     OR NEW.decision_type NOT IN (
       'SUSPENSION_APPROVED',
       'RECOMMENDATION_REJECTED',
       'RETURNED_FOR_INVESTIGATION',
       'PERMANENT_BAN_APPROVED',
       'PERMANENT_BAN_REJECTED',
       'ESCALATED_TO_ADMINISTRATOR'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT moderator_id INTO v_moderator_id
    FROM public.account_moderation_investigations
   WHERE id = NEW.investigation_id;
  IF v_moderator_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := CASE NEW.decision_type
    WHEN 'SUSPENSION_APPROVED' THEN 'Investigation approved'
    WHEN 'RECOMMENDATION_REJECTED' THEN 'Investigation recommendation rejected'
    WHEN 'RETURNED_FOR_INVESTIGATION' THEN 'Investigation returned'
    WHEN 'PERMANENT_BAN_APPROVED' THEN 'Permanent ban request approved'
    WHEN 'PERMANENT_BAN_REJECTED' THEN 'Permanent ban request rejected'
    ELSE 'Case escalated to Administrator'
  END;
  v_message := CASE NEW.decision_type
    WHEN 'SUSPENSION_APPROVED' THEN 'The Tourism Officer approved the recommended temporary suspension.'
    WHEN 'RECOMMENDATION_REJECTED' THEN 'The Tourism Officer rejected the investigation recommendation.'
    WHEN 'RETURNED_FOR_INVESTIGATION' THEN 'The case was returned for additional investigation.'
    WHEN 'PERMANENT_BAN_APPROVED' THEN 'The permanent ban request received final authorization.'
    WHEN 'PERMANENT_BAN_REJECTED' THEN 'The permanent ban request was rejected and returned for officer review.'
    ELSE 'The Tourism Officer escalated the complete case for Administrator review.'
  END;

  INSERT INTO public.info_notifications (
    user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
  )
  VALUES (
    v_moderator_id, v_title, v_message, 'moderation', FALSE,
    '/info/admin/moderation?tab=reports&reviewReportId=' || NEW.case_id::TEXT,
    NEW.reviewer_id, NEW.created_at, NEW.created_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS moderator_account_investigation_decision_notification
  ON public.moderation_decisions;
CREATE TRIGGER moderator_account_investigation_decision_notification
  AFTER INSERT ON public.moderation_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_moderator_account_investigation_decision();

CREATE OR REPLACE FUNCTION public.notify_moderation_decision_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ban public.admin_user_bans%ROWTYPE;
  v_username TEXT;
  v_event_type TEXT;
BEGIN
  IF NEW.decision_type NOT IN (
    'SUSPENSION_APPROVED',
    'EXCEPTIONAL_SUSPENSION_APPROVED',
    'PERMANENT_BAN_APPROVED',
    'SUSPENSION_LIFTED',
    'SUSPENSION_REVERSED',
    'PERMANENT_BAN_REVERSED',
    'SUSPENSION_DURATION_REDUCED'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_username
    FROM public.info_users
   WHERE id = NEW.affected_user_id;

  IF NEW.decision_type IN ('SUSPENSION_APPROVED', 'EXCEPTIONAL_SUSPENSION_APPROVED') THEN
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
  ELSIF NEW.decision_type IN ('PERMANENT_BAN_REVERSED') THEN
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

DROP TRIGGER IF EXISTS moderation_decision_email_outbox
  ON public.moderation_decisions;
CREATE TRIGGER moderation_decision_email_outbox
  AFTER INSERT ON public.moderation_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_moderation_decision_email();

COMMIT;
