BEGIN;

CREATE OR REPLACE FUNCTION public.admin_transition_info_blog(
  p_blog_id UUID,
  p_reviewer_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
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
  history_action TEXT;
  next_status TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Administrator service access is required';
  END IF;

  IF p_reviewer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.info_users WHERE id = p_reviewer_id AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'The reviewer must be an administrator';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'request_changes', 'return_to_pending') THEN
    RAISE EXCEPTION 'Invalid moderation action';
  END IF;
  IF p_action IN ('reject', 'request_changes') AND cleaned_reason IS NULL THEN
    RAISE EXCEPTION 'Feedback is required for this moderation decision';
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

  IF p_action = 'approve' AND previous_status NOT IN ('pending', 'rejected', 'changes_requested') THEN
    RAISE EXCEPTION 'Blog post cannot be approved from its current status';
  ELSIF p_action = 'reject' AND previous_status NOT IN ('pending', 'approved', 'changes_requested') THEN
    RAISE EXCEPTION 'Blog post cannot be rejected from its current status';
  ELSIF p_action = 'request_changes' AND previous_status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'Changes can only be requested for pending or rejected posts';
  ELSIF p_action = 'return_to_pending' AND previous_status NOT IN ('approved', 'rejected', 'changes_requested') THEN
    RAISE EXCEPTION 'Blog post cannot be returned to pending from its current status';
  END IF;

  next_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'request_changes' THEN 'changes_requested'
    ELSE 'pending'
  END;
  history_action := CASE WHEN p_action = 'return_to_pending' THEN 'returned_to_pending' ELSE next_status END;

  UPDATE public.info_blogs
  SET approval_status = next_status,
      status = CASE WHEN p_action = 'approve' THEN 'published' ELSE 'draft' END,
      published_at = CASE WHEN p_action = 'approve' THEN NOW() ELSE NULL END,
      submitted_at = CASE WHEN p_action = 'return_to_pending' THEN NOW() ELSE submitted_at END,
      reviewed_at = CASE WHEN p_action = 'return_to_pending' THEN NULL ELSE NOW() END,
      reviewed_by = CASE WHEN p_action = 'return_to_pending' THEN NULL ELSE p_reviewer_id END,
      rejection_reason = CASE
        WHEN p_action IN ('reject', 'request_changes') THEN cleaned_reason
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE id = p_blog_id
  RETURNING * INTO blog_row;

  INSERT INTO public.blog_moderation_history (
    blog_id, blog_title, blog_author_id, reviewed_by, action, reason, previous_status, new_status
  )
  VALUES (
    blog_row.id, blog_row.title, blog_row.created_by, p_reviewer_id, history_action,
    cleaned_reason, previous_status, next_status
  );

  IF blog_row.created_by IS NOT NULL THEN
    INSERT INTO public.info_notifications (user_id, title, message, type, is_read, created_at, updated_at)
    VALUES (
      blog_row.created_by,
      CASE p_action
        WHEN 'approve' THEN 'Blog post approved'
        WHEN 'reject' THEN 'Blog post rejected'
        WHEN 'request_changes' THEN 'Changes requested for your blog post'
        ELSE 'Blog post returned to review'
      END,
      CASE p_action
        WHEN 'approve' THEN format('Your blog post "%s" was approved and is now public.', blog_row.title)
        WHEN 'reject' THEN format('Your blog post "%s" was rejected. Reason: %s', blog_row.title, cleaned_reason)
        WHEN 'request_changes' THEN format('Please update your blog post "%s". Administrator feedback: %s', blog_row.title, cleaned_reason)
        ELSE format('Your blog post "%s" was returned to pending review.', blog_row.title)
      END,
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

COMMIT;
