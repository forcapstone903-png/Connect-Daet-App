BEGIN;

CREATE OR REPLACE FUNCTION public.request_info_blog_changes(
  p_blog_id UUID,
  p_reviewer_id UUID,
  p_action TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  blog_row public.info_blogs%ROWTYPE;
  previous_status TEXT;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Staff service access is required';
  END IF;

  IF p_reviewer_id IS NULL OR NOT public.is_moderator(p_reviewer_id) THEN
    RAISE EXCEPTION 'The reviewer must be an administrator or moderator';
  END IF;

  IF p_action IS DISTINCT FROM 'request_changes' OR cleaned_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to request blog changes';
  END IF;
  IF length(cleaned_reason) > 1000 THEN
    RAISE EXCEPTION 'Moderation feedback must be 1,000 characters or fewer';
  END IF;

  SELECT * INTO blog_row
  FROM public.info_blogs
  WHERE id = p_blog_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blog post not found';
  END IF;
  previous_status := blog_row.approval_status;

  IF previous_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Blog post cannot be updated with requested changes from its current status';
  END IF;

  UPDATE public.info_blogs
  SET approval_status = 'changes_requested',
      status = 'draft',
      published_at = NULL,
      reviewed_at = NOW(),
      reviewed_by = p_reviewer_id,
      rejection_reason = cleaned_reason,
      updated_at = NOW()
  WHERE id = p_blog_id
  RETURNING * INTO blog_row;

  INSERT INTO public.blog_moderation_history (
    blog_id, blog_title, blog_author_id, reviewed_by, action, reason, previous_status, new_status
  )
  VALUES (
    blog_row.id, blog_row.title, blog_row.created_by, p_reviewer_id,
    'changes_requested', cleaned_reason, previous_status, 'changes_requested'
  );

  IF blog_row.created_by IS NOT NULL THEN
    INSERT INTO public.info_notifications (user_id, title, message, type, is_read, created_at, updated_at)
    VALUES (
      blog_row.created_by,
      'Changes requested for your blog post',
      format('Please update your blog post "%s". Review feedback: %s', blog_row.title, cleaned_reason),
      'info', FALSE, NOW(), NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'id', blog_row.id,
    'created_by', blog_row.created_by,
    'title', blog_row.title,
    'approval_status', blog_row.approval_status,
    'status', blog_row.status,
    'submitted_at', blog_row.submitted_at,
    'reviewed_at', blog_row.reviewed_at,
    'reviewed_by', blog_row.reviewed_by,
    'rejection_reason', blog_row.rejection_reason,
    'published_at', blog_row.published_at
  );
END
$$;

REVOKE ALL ON FUNCTION public.request_info_blog_changes(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_info_blog_changes(UUID, UUID, TEXT, TEXT) TO service_role;

COMMIT;
