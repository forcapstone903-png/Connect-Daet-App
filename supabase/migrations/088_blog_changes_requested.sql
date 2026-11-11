BEGIN;

ALTER TABLE public.info_blogs
  DROP CONSTRAINT IF EXISTS info_blogs_approval_status_check;

ALTER TABLE public.info_blogs
  ADD CONSTRAINT info_blogs_approval_status_check
  CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected', 'changes_requested'));

ALTER TABLE public.blog_moderation_history
  DROP CONSTRAINT IF EXISTS blog_moderation_history_action_check;

ALTER TABLE public.blog_moderation_history
  ADD CONSTRAINT blog_moderation_history_action_check
  CHECK (action IN ('approved', 'rejected', 'changes_requested'));

ALTER TABLE public.blog_moderation_history
  ADD COLUMN IF NOT EXISTS previous_status TEXT,
  ADD COLUMN IF NOT EXISTS new_status TEXT;

UPDATE public.blog_moderation_history
SET previous_status = COALESCE(previous_status, 'pending'),
    new_status = COALESCE(new_status, action)
WHERE previous_status IS NULL OR new_status IS NULL;

CREATE OR REPLACE FUNCTION public.moderate_info_blog(
  p_blog_id UUID,
  p_reviewer_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  blog_row public.info_blogs%ROWTYPE;
  cleaned_reason TEXT := NULLIF(BTRIM(p_reason), '');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Administrator service access is required';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected', 'changes_requested') THEN
    RAISE EXCEPTION 'Invalid moderation decision';
  END IF;

  IF p_reviewer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.info_users WHERE id = p_reviewer_id AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'The reviewer must be an administrator';
  END IF;

  IF p_decision <> 'approved' AND cleaned_reason IS NULL THEN
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

  IF blog_row.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Blog post is no longer pending approval';
  END IF;

  UPDATE public.info_blogs
  SET approval_status = p_decision,
      status = CASE WHEN p_decision = 'approved' THEN 'published' ELSE 'draft' END,
      published_at = CASE WHEN p_decision = 'approved' THEN NOW() ELSE NULL END,
      reviewed_at = NOW(),
      reviewed_by = p_reviewer_id,
      rejection_reason = CASE WHEN p_decision = 'approved' THEN NULL ELSE cleaned_reason END,
      updated_at = NOW()
  WHERE id = p_blog_id
  RETURNING * INTO blog_row;

  INSERT INTO public.blog_moderation_history (
    blog_id, blog_title, blog_author_id, reviewed_by, action, reason, previous_status, new_status
  )
  VALUES (
    blog_row.id, blog_row.title, blog_row.created_by, p_reviewer_id,
    p_decision, cleaned_reason, 'pending', p_decision
  );

  IF blog_row.created_by IS NOT NULL THEN
    INSERT INTO public.info_notifications (user_id, title, message, type, is_read, created_at, updated_at)
    VALUES (
      blog_row.created_by,
      CASE p_decision
        WHEN 'approved' THEN 'Blog post approved'
        WHEN 'changes_requested' THEN 'Changes requested for your blog post'
        ELSE 'Blog post rejected'
      END,
      CASE p_decision
        WHEN 'approved' THEN format('Your blog post "%s" was approved and is now public.', blog_row.title)
        WHEN 'changes_requested' THEN format('Please update your blog post "%s". Administrator feedback: %s', blog_row.title, cleaned_reason)
        ELSE format('Your blog post "%s" was rejected. Reason: %s', blog_row.title, cleaned_reason)
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

REVOKE ALL ON FUNCTION public.moderate_info_blog(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_info_blog(UUID, UUID, TEXT, TEXT) TO service_role;

COMMIT;
