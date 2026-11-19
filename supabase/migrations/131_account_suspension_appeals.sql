BEGIN;

ALTER TABLE public.user_moderation_appeals
  ADD COLUMN IF NOT EXISTS appeal_type TEXT NOT NULL DEFAULT 'posting_restriction',
  ADD COLUMN IF NOT EXISTS evidence_paths TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'user_moderation_appeals_appeal_type_check'
       AND conrelid = 'public.user_moderation_appeals'::regclass
  ) THEN
    ALTER TABLE public.user_moderation_appeals
      ADD CONSTRAINT user_moderation_appeals_appeal_type_check
      CHECK (appeal_type IN ('posting_restriction', 'account_suspension'));
  END IF;
END;
$$;

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'moderation-appeal-evidence',
  'moderation-appeal-evidence',
  FALSE,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
  SET public = FALSE,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

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
   FOR UPDATE;
  IF NOT FOUND OR ban_row.lifted_at IS NOT NULL THEN
    RAISE EXCEPTION 'There is no active restriction to appeal';
  END IF;

  IF p_appeal_type = 'account_suspension' THEN
    IF target_row.status <> 'suspended' OR ban_row.ban_type IS DISTINCT FROM 'suspension' THEN
      RAISE EXCEPTION 'There is no active account suspension to appeal';
    END IF;
  ELSIF target_row.status = 'suspended'
     OR COALESCE(ban_row.ban_type, 'posting') = 'suspension'
     OR (ban_row.expires_at IS NOT NULL AND ban_row.expires_at <= now_at) THEN
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

CREATE OR REPLACE FUNCTION public.review_user_moderation_appeal(
  p_appeal_id UUID,
  p_reviewer_id UUID,
  p_decision TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  appeal_row public.user_moderation_appeals%ROWTYPE;
  target_row public.info_users%ROWTYPE;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
  decision_status TEXT;
  v_reviewed_at TIMESTAMPTZ := clock_timestamp();
  restored_account BOOLEAN := FALSE;
  appeal_user_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF p_reviewer_id IS NULL OR NOT public.is_staff_in(p_reviewer_id, ARRAY['moderator']) THEN
    RAISE EXCEPTION 'An active moderator or administrator is required';
  END IF;
  IF p_decision IS NULL
     OR p_decision NOT IN ('approve', 'reject')
     OR cleaned_reason IS NULL
     OR length(cleaned_reason) > 1000 THEN
    RAISE EXCEPTION 'A valid appeal decision and reason are required';
  END IF;

  SELECT user_id INTO appeal_user_id
    FROM public.user_moderation_appeals
   WHERE id = p_appeal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This appeal is no longer pending';
  END IF;

  SELECT * INTO target_row
    FROM public.info_users
   WHERE id = appeal_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The account for this appeal no longer exists';
  END IF;

  SELECT * INTO appeal_row
    FROM public.user_moderation_appeals
   WHERE id = p_appeal_id
     AND user_id = appeal_user_id
   FOR UPDATE;
  IF NOT FOUND OR appeal_row.status <> 'pending' THEN
    RAISE EXCEPTION 'This appeal is no longer pending';
  END IF;

  IF p_decision = 'approve' THEN
    IF appeal_row.appeal_type = 'account_suspension' THEN
      IF target_row.status <> 'suspended' OR target_row.account_deactivated_at IS NOT NULL THEN
        RAISE EXCEPTION 'The account is no longer eligible for suspension appeal approval';
      END IF;

      UPDATE public.admin_user_bans
         SET lifted_by = p_reviewer_id,
             lifted_at = v_reviewed_at
       WHERE user_id = appeal_row.user_id
         AND ban_type = 'suspension'
         AND lifted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The account suspension is no longer active';
      END IF;

      UPDATE public.info_users
         SET status = 'active',
             updated_at = v_reviewed_at
       WHERE id = appeal_row.user_id
         AND status = 'suspended'
         AND account_deactivated_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The account could not be restored';
      END IF;
      restored_account := TRUE;
    ELSE
      UPDATE public.admin_user_bans
         SET lifted_by = p_reviewer_id,
             lifted_at = v_reviewed_at
       WHERE user_id = appeal_row.user_id
         AND COALESCE(ban_type, 'posting') <> 'suspension'
         AND lifted_at IS NULL
         AND (expires_at IS NULL OR expires_at > v_reviewed_at);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The posting restriction is no longer active';
      END IF;
    END IF;
    decision_status := 'approved';
  ELSE
    decision_status := 'rejected';
  END IF;

  UPDATE public.user_moderation_appeals
     SET status = decision_status,
         decision_notes = cleaned_reason,
         reviewed_by = p_reviewer_id,
         reviewed_at = v_reviewed_at
   WHERE id = p_appeal_id;

  INSERT INTO public.info_notifications (
    user_id, title, message, type, is_read, link, actor_id, created_at, updated_at
  )
  VALUES (
    appeal_row.user_id,
    CASE
      WHEN decision_status = 'approved' THEN 'Appeal approved'
      ELSE 'Appeal rejected'
    END,
    CASE
      WHEN decision_status = 'approved' AND appeal_row.appeal_type = 'account_suspension'
        THEN 'Your suspension appeal was approved. Your account is active again.'
      WHEN decision_status = 'approved'
        THEN 'Your appeal was approved. Your posting restriction has been lifted.'
      WHEN appeal_row.appeal_type = 'account_suspension'
        THEN 'Your suspension appeal was rejected. Your suspension remains in effect. Reason: ' || cleaned_reason
      ELSE 'Your posting restriction appeal was rejected. Reason: ' || cleaned_reason
    END,
    CASE WHEN decision_status = 'approved' THEN 'success' ELSE 'warning' END,
    FALSE,
    '/info/user/moderation-appeals?appeal=' || p_appeal_id::TEXT,
    p_reviewer_id,
    v_reviewed_at,
    v_reviewed_at
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.info_audit_log (
    user_id, action, table_name, record_id, changes, created_at
  )
  VALUES (
    p_reviewer_id,
    'review-user-appeal',
    'user_moderation_appeals',
    p_appeal_id,
    jsonb_build_object(
      'appealType', appeal_row.appeal_type,
      'status', decision_status,
      'reason', cleaned_reason,
      'userId', appeal_row.user_id,
      'reviewerId', p_reviewer_id,
      'reviewedAt', v_reviewed_at,
      'accountRestored', restored_account
    ),
    v_reviewed_at
  );

  RETURN jsonb_build_object(
    'id', p_appeal_id,
    'status', decision_status,
    'appeal_type', appeal_row.appeal_type,
    'user_id', appeal_row.user_id,
    'reviewer_id', p_reviewer_id,
    'reviewed_at', v_reviewed_at,
    'decision_notes', cleaned_reason,
    'account_restored', restored_account
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_user_moderation_appeal(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_user_moderation_appeal(UUID, UUID, TEXT, TEXT)
  TO service_role;

COMMIT;
