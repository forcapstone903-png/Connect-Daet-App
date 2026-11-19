BEGIN;

CREATE TABLE IF NOT EXISTS public.account_moderation_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.info_moderation(id) ON DELETE CASCADE,
  affected_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE RESTRICT,
  assessment TEXT NOT NULL CHECK (char_length(BTRIM(assessment)) BETWEEN 1 AND 5000),
  status TEXT NOT NULL DEFAULT 'pending_tourism_officer_review'
    CHECK (status IN ('pending_tourism_officer_review', 'reviewed', 'returned')),
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_moderation_investigations_pending_report_idx
  ON public.account_moderation_investigations (report_id)
  WHERE status = 'pending_tourism_officer_review';

CREATE TABLE IF NOT EXISTS public.account_moderation_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id UUID NOT NULL REFERENCES public.account_moderation_investigations(id) ON DELETE CASCADE,
  recommendation TEXT NOT NULL CHECK (recommendation IN (
    'no_violation',
    'issue_warning',
    'recommend_temporary_suspension',
    'recommend_permanent_ban'
  )),
  reason TEXT NOT NULL CHECK (char_length(BTRIM(reason)) BETWEEN 1 AND 1000),
  supporting_explanation TEXT NOT NULL CHECK (char_length(BTRIM(supporting_explanation)) BETWEEN 1 AND 5000),
  suspension_duration_days INTEGER,
  custom_duration_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_moderation_recommendation_duration_check CHECK (
    (
      recommendation = 'recommend_temporary_suspension'
      AND (
        suspension_duration_days IN (1, 3, 7, 14, 30)
        OR (suspension_duration_days IS NULL AND custom_duration_days BETWEEN 1 AND 365)
      )
    )
    OR (
      recommendation <> 'recommend_temporary_suspension'
      AND suspension_duration_days IS NULL
      AND custom_duration_days IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS account_moderation_recommendations_one_per_investigation_idx
  ON public.account_moderation_recommendations (investigation_id);

CREATE TABLE IF NOT EXISTS public.account_moderation_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id UUID NOT NULL REFERENCES public.account_moderation_investigations(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  source_table TEXT,
  source_id UUID,
  title TEXT,
  content TEXT,
  attachment_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_moderation_evidence_investigation_idx
  ON public.account_moderation_evidence (investigation_id, created_at DESC);

ALTER TABLE public.account_moderation_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_moderation_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_moderation_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_moderation_investigations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.account_moderation_recommendations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.account_moderation_evidence FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.account_moderation_investigations TO service_role;
GRANT ALL ON TABLE public.account_moderation_recommendations TO service_role;
GRANT ALL ON TABLE public.account_moderation_evidence TO service_role;
GRANT SELECT ON TABLE public.account_moderation_investigations TO authenticated;
GRANT SELECT ON TABLE public.account_moderation_recommendations TO authenticated;
GRANT SELECT ON TABLE public.account_moderation_evidence TO authenticated;

DROP POLICY IF EXISTS account_investigations_staff_select ON public.account_moderation_investigations;
CREATE POLICY account_investigations_staff_select
  ON public.account_moderation_investigations
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff_in(
      auth.uid(),
      ARRAY['admin', 'administrator', 'moderator', 'tourism_officer']
    )
  );

DROP POLICY IF EXISTS account_recommendations_staff_select ON public.account_moderation_recommendations;
CREATE POLICY account_recommendations_staff_select
  ON public.account_moderation_recommendations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.account_moderation_investigations AS investigation
       WHERE investigation.id = account_moderation_recommendations.investigation_id
         AND public.is_staff_in(
           auth.uid(),
           ARRAY['admin', 'administrator', 'moderator', 'tourism_officer']
         )
    )
  );

DROP POLICY IF EXISTS account_evidence_staff_select ON public.account_moderation_evidence;
CREATE POLICY account_evidence_staff_select
  ON public.account_moderation_evidence
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.account_moderation_investigations AS investigation
       WHERE investigation.id = account_moderation_evidence.investigation_id
         AND public.is_staff_in(
           auth.uid(),
           ARRAY['admin', 'administrator', 'moderator', 'tourism_officer']
         )
    )
  );

CREATE OR REPLACE FUNCTION public.is_exact_moderator(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.info_users AS staff
     WHERE staff.id = p_user_id
       AND staff.status = 'active'
       AND lower(staff.user_type) = 'moderator'
  );
$$;

REVOKE ALL ON FUNCTION public.is_exact_moderator(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_exact_moderator(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_moderator_account_investigation(
  p_report_id UUID,
  p_moderator_id UUID,
  p_assessment TEXT,
  p_recommendation TEXT,
  p_reason TEXT,
  p_supporting_explanation TEXT,
  p_suspension_duration_days INTEGER DEFAULT NULL,
  p_custom_duration_days INTEGER DEFAULT NULL,
  p_evidence_snapshot JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report public.info_moderation%ROWTYPE;
  v_investigation_id UUID;
  v_recommendation_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_assessment TEXT := NULLIF(BTRIM(p_assessment), '');
  v_reason TEXT := NULLIF(BTRIM(p_reason), '');
  v_explanation TEXT := NULLIF(BTRIM(p_supporting_explanation), '');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF NOT public.is_exact_moderator(p_moderator_id) THEN
    RAISE EXCEPTION 'Only an active moderator can submit an investigation';
  END IF;
  IF v_assessment IS NULL OR char_length(v_assessment) > 5000 THEN
    RAISE EXCEPTION 'A written assessment is required';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'A recommendation reason is required';
  END IF;
  IF v_explanation IS NULL OR char_length(v_explanation) > 5000 THEN
    RAISE EXCEPTION 'Supporting explanation is required';
  END IF;
  IF p_recommendation NOT IN (
    'no_violation',
    'issue_warning',
    'recommend_temporary_suspension',
    'recommend_permanent_ban'
  ) THEN
    RAISE EXCEPTION 'A valid recommendation is required';
  END IF;
  IF p_recommendation = 'recommend_temporary_suspension'
     AND NOT (
       p_suspension_duration_days IN (1, 3, 7, 14, 30)
       OR (p_suspension_duration_days IS NULL AND p_custom_duration_days BETWEEN 1 AND 365)
     ) THEN
    RAISE EXCEPTION 'A valid temporary suspension duration is required';
  END IF;
  IF p_recommendation <> 'recommend_temporary_suspension'
     AND (p_suspension_duration_days IS NOT NULL OR p_custom_duration_days IS NOT NULL) THEN
    RAISE EXCEPTION 'Suspension duration is only valid for temporary suspension recommendations';
  END IF;

  SELECT * INTO v_report
    FROM public.info_moderation
   WHERE id = p_report_id
     AND reported_item_table = 'info_users'
     AND reported_item_id = reported_user_id
     AND status IN ('pending', 'reviewing')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account report is no longer available for investigation';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.account_moderation_investigations
     WHERE report_id = p_report_id
       AND status = 'pending_tourism_officer_review'
  ) THEN
    RAISE EXCEPTION 'An investigation has already been submitted for this report';
  END IF;

  INSERT INTO public.account_moderation_investigations (
    report_id,
    affected_user_id,
    moderator_id,
    assessment,
    status,
    evidence_snapshot,
    submitted_at
  )
  VALUES (
    p_report_id,
    v_report.reported_user_id,
    p_moderator_id,
    v_assessment,
    'pending_tourism_officer_review',
    COALESCE(p_evidence_snapshot, '{}'::JSONB),
    v_now
  )
  RETURNING id INTO v_investigation_id;

  INSERT INTO public.account_moderation_recommendations (
    investigation_id,
    recommendation,
    reason,
    supporting_explanation,
    suspension_duration_days,
    custom_duration_days
  )
  VALUES (
    v_investigation_id,
    p_recommendation,
    v_reason,
    v_explanation,
    p_suspension_duration_days,
    p_custom_duration_days
  )
  RETURNING id INTO v_recommendation_id;

  INSERT INTO public.account_moderation_evidence (
    investigation_id,
    evidence_type,
    source_table,
    source_id,
    title,
    content,
    attachment_url,
    metadata
  )
  SELECT
    v_investigation_id,
    'reported_violation',
    NULLIF(BTRIM(COALESCE(item->>'reported_item_table', '')), ''),
    NULLIF(item->>'reported_item_id', '')::UUID,
    NULLIF(BTRIM(COALESCE(item->>'reason', item->>'report_type', 'Reported violation')), ''),
    NULLIF(BTRIM(COALESCE(item->>'description', item->>'reason', '')), ''),
    NULLIF(BTRIM(COALESCE(item->>'attachment_url', item->'evidence'->>'photo_url', item->'evidence'->>'attachment_url', '')), ''),
    COALESCE(item, '{}'::JSONB)
  FROM jsonb_array_elements(COALESCE(p_evidence_snapshot->'violations', '[]'::JSONB)) AS item
  WHERE item IS NOT NULL;

  INSERT INTO public.account_moderation_evidence (
    investigation_id,
    evidence_type,
    source_table,
    source_id,
    title,
    content,
    metadata
  )
  SELECT
    v_investigation_id,
    'reported_content',
    NULLIF(BTRIM(COALESCE(item->>'type', '')), ''),
    NULLIF(item->>'id', '')::UUID,
    NULLIF(BTRIM(COALESCE(item->>'title', item->>'name', 'Reported content')), ''),
    NULLIF(BTRIM(COALESCE(item->>'content', item->>'body', item->>'title', '')), ''),
    COALESCE(item, '{}'::JSONB)
  FROM jsonb_array_elements(COALESCE(p_evidence_snapshot->'postingHistory', '[]'::JSONB)) AS item
  WHERE item IS NOT NULL;

  UPDATE public.info_moderation
     SET status = 'reviewing',
         assigned_to = p_moderator_id,
         moderation_notes = v_assessment,
         resolution = 'Pending Tourism Officer Review: ' || v_reason,
         updated_at = v_now
   WHERE id = p_report_id;

  INSERT INTO public.info_notifications (
    user_id,
    title,
    message,
    type,
    is_read,
    link,
    actor_id,
    created_at,
    updated_at
  )
  SELECT
    staff.id,
    'Account investigation submitted',
    'A moderator submitted an account investigation and recommendation for Tourism Officer review.',
    'warning',
    FALSE,
    '/info/admin/moderation?tab=reports&reviewReportId=' || p_report_id::TEXT,
    p_moderator_id,
    v_now,
    v_now
  FROM public.info_users AS staff
  WHERE staff.status = 'active'
    AND lower(staff.user_type) = 'tourism_officer';

  INSERT INTO public.info_audit_log (
    user_id,
    action,
    table_name,
    record_id,
    changes,
    created_at
  )
  VALUES (
    p_moderator_id,
    'submit-moderator-account-investigation',
    'account_moderation_investigations',
    v_investigation_id,
    jsonb_build_object(
      'reportId', p_report_id,
      'affectedUserId', v_report.reported_user_id,
      'recommendationId', v_recommendation_id,
      'recommendation', p_recommendation,
      'reason', v_reason,
      'suspensionDurationDays', COALESCE(p_suspension_duration_days, p_custom_duration_days),
      'submittedAt', v_now,
      'accountStatusChanged', FALSE
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'investigation_id', v_investigation_id,
    'recommendation_id', v_recommendation_id,
    'report_id', p_report_id,
    'status', 'pending_tourism_officer_review',
    'submitted_at', v_now,
    'moderator_id', p_moderator_id,
    'account_status_changed', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_moderator_account_investigation(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_moderator_account_investigation(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, JSONB
) TO service_role;

COMMIT;

