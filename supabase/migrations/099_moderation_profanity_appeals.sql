BEGIN;

ALTER TABLE public.admin_user_bans
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.user_moderation_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_notes TEXT,
  reviewed_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_moderation_appeals_one_pending_idx
  ON public.user_moderation_appeals (user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS user_moderation_appeals_status_created_idx
  ON public.user_moderation_appeals (status, created_at DESC);

ALTER TABLE public.user_moderation_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_moderation_appeals FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_moderation_appeals TO service_role;

DROP POLICY IF EXISTS user_moderation_appeals_select_owner_or_staff
  ON public.user_moderation_appeals;
CREATE POLICY user_moderation_appeals_select_owner_or_staff
  ON public.user_moderation_appeals FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR public.is_moderator(auth.uid())
  );

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
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
  decision_status TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Administrator service access is required';
  END IF;
  IF p_reviewer_id IS NULL
     OR (NOT public.is_admin(p_reviewer_id) AND NOT public.is_moderator(p_reviewer_id)) THEN
    RAISE EXCEPTION 'A moderator is required to review appeals';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') OR cleaned_reason IS NULL OR length(cleaned_reason) > 1000 THEN
    RAISE EXCEPTION 'A valid appeal decision and reason are required';
  END IF;

  SELECT * INTO appeal_row
    FROM public.user_moderation_appeals
   WHERE id = p_appeal_id
   FOR UPDATE;
  IF NOT FOUND OR appeal_row.status <> 'pending' THEN
    RAISE EXCEPTION 'This appeal is no longer pending';
  END IF;

  IF p_decision = 'approve' THEN
    UPDATE public.admin_user_bans
       SET lifted_by = p_reviewer_id,
           lifted_at = NOW()
     WHERE user_id = appeal_row.user_id
       AND lifted_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW());
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The restriction is no longer active';
    END IF;
    decision_status := 'approved';
  ELSE
    decision_status := 'rejected';
  END IF;

  UPDATE public.user_moderation_appeals
     SET status = decision_status,
         decision_notes = cleaned_reason,
         reviewed_by = p_reviewer_id,
         reviewed_at = NOW()
   WHERE id = p_appeal_id;

  INSERT INTO public.info_notifications (user_id, title, message, type, is_read)
  VALUES (
    appeal_row.user_id,
    CASE WHEN decision_status = 'approved' THEN 'Restriction appeal approved' ELSE 'Restriction appeal reviewed' END,
    CASE WHEN decision_status = 'approved'
      THEN 'Your appeal was approved. Your posting restriction has been lifted.'
      ELSE 'Your appeal was reviewed. ' || cleaned_reason
    END,
    CASE WHEN decision_status = 'approved' THEN 'success' ELSE 'warning' END,
    FALSE
  );

  INSERT INTO public.info_audit_log (user_id, action, table_name, record_id, changes)
  VALUES (
    p_reviewer_id,
    'review-user-appeal',
    'user_moderation_appeals',
    p_appeal_id,
    jsonb_build_object('status', decision_status, 'reason', cleaned_reason, 'user_id', appeal_row.user_id)
  );

  RETURN jsonb_build_object('id', p_appeal_id, 'status', decision_status);
END;
$$;

REVOKE ALL ON FUNCTION public.review_user_moderation_appeal(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_user_moderation_appeal(UUID, UUID, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reject_content_from_banned_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL
     OR public.is_admin(current_user_id)
     OR public.is_moderator(current_user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('info_blogs', 'forum_threads')
     AND to_jsonb(NEW)->>'status' = 'draft' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.admin_user_bans
     WHERE user_id = current_user_id
       AND lifted_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'This account is currently restricted from publishing content.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS info_moderation_open_profanity_item_idx
  ON public.info_moderation (reported_item_table, reported_item_id)
  WHERE report_type = 'profanity'
    AND status IN ('pending', 'reviewing')
    AND reported_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.flag_content_with_profanity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_data JSONB := to_jsonb(NEW);
  previous_data JSONB;
  setting_value JSONB;
  terms JSONB;
  owner_id UUID;
  content_text TEXT;
  term TEXT;
  matched_terms TEXT[] := ARRAY[]::TEXT[];
  content_tokens TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous_data := to_jsonb(OLD);
    IF COALESCE(previous_data->>'title', '') = COALESCE(row_data->>'title', '')
       AND COALESCE(previous_data->>'excerpt', '') = COALESCE(row_data->>'excerpt', '')
       AND COALESCE(previous_data->>'content', '') = COALESCE(row_data->>'content', '')
       AND COALESCE(previous_data->>'body', '') = COALESCE(row_data->>'body', '') THEN
      RETURN NEW;
    END IF;
  END IF;

  owner_id := COALESCE(
    NULLIF(row_data->>'created_by', '')::UUID,
    NULLIF(row_data->>'user_id', '')::UUID
  );
  IF owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  content_text := lower(concat_ws(
    ' ',
    row_data->>'title',
    row_data->>'excerpt',
    row_data->>'content',
    row_data->>'body'
  ));
  content_tokens := regexp_split_to_array(content_text, '[^a-z0-9_]+');

  SELECT value INTO setting_value
    FROM public.admin_app_settings
   WHERE id = 'moderation';
  terms := setting_value->'profanityTerms';
  IF jsonb_typeof(terms) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR term IN
    SELECT lower(btrim(value))
      FROM jsonb_array_elements_text(terms) AS configured(value)
  LOOP
    IF term ~ '^[a-z0-9_]{1,40}$'
       AND term = ANY(content_tokens) THEN
      matched_terms := array_append(matched_terms, term);
    END IF;
  END LOOP;

  IF cardinality(matched_terms) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.info_moderation (
    report_type,
    reason,
    description,
    severity,
    reported_by,
    reported_user_id,
    reported_item_id,
    reported_item_table,
    status
  )
  VALUES (
    'profanity',
    'Automatic profanity filter match',
    'Matched configured terms: ' || array_to_string(matched_terms, ', '),
    'medium',
    NULL,
    owner_id,
    NULLIF(row_data->>'id', '')::UUID,
    TG_TABLE_NAME,
    'pending'
  )
  ON CONFLICT (reported_item_table, reported_item_id)
    WHERE report_type = 'profanity'
      AND status IN ('pending', 'reviewing')
      AND reported_item_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'info_blogs',
    'info_user_posts',
    'forum_threads',
    'forum_replies',
    'content_comments',
    'info_comments'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS tr_flag_profanity_content ON public.%I',
        table_name
      );
      EXECUTE format(
        'CREATE TRIGGER tr_flag_profanity_content AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.flag_content_with_profanity()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
