BEGIN;

ALTER TABLE public.info_blogs
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DO $$
BEGIN
  ALTER TABLE public.info_blogs
    ADD CONSTRAINT info_blogs_approval_status_check
    CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

UPDATE public.info_blogs
SET approval_status = CASE WHEN status = 'published' THEN 'approved' ELSE 'draft' END,
    submitted_at = CASE WHEN status = 'published' THEN COALESCE(published_at, created_at) ELSE NULL END
WHERE submitted_at IS NULL
  AND reviewed_at IS NULL
  AND rejection_reason IS NULL;

CREATE TABLE IF NOT EXISTS public.blog_moderation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID REFERENCES public.info_blogs(id) ON DELETE SET NULL,
  blog_title TEXT NOT NULL,
  blog_author_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS info_blogs_approval_status_submitted_at_idx
  ON public.info_blogs (approval_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS blog_moderation_history_created_at_idx
  ON public.blog_moderation_history (created_at DESC);

ALTER TABLE public.blog_moderation_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blog_moderation_history FROM anon, authenticated;
GRANT ALL ON public.blog_moderation_history TO service_role;

DROP POLICY IF EXISTS info_blogs_select_public ON public.info_blogs;
CREATE POLICY info_blogs_select_public
  ON public.info_blogs FOR SELECT
  USING (
    (
      (status = 'published' AND approval_status = 'approved')
      OR auth.uid() = created_by
      OR public.is_admin(auth.uid())
    )
    AND public.can_view_account_content(created_by)
  );

DROP POLICY IF EXISTS info_blogs_insert_own_or_admin ON public.info_blogs;
CREATE POLICY info_blogs_insert_own_or_admin
  ON public.info_blogs FOR INSERT
  WITH CHECK (
    (
      auth.uid() IS NOT NULL
      AND created_by = auth.uid()
      AND status = 'draft'
      AND approval_status IN ('draft', 'pending')
    )
    OR public.is_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.guard_user_blog_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Only the blog owner or an administrator can edit this post';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'Blog approval fields can only be changed by an administrator';
  END IF;

  IF OLD.approval_status = 'approved' AND (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.excerpt IS DISTINCT FROM OLD.excerpt
    OR NEW.featured_image IS DISTINCT FROM OLD.featured_image
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.tags IS DISTINCT FROM OLD.tags
    OR NEW.images IS DISTINCT FROM OLD.images
    OR NEW.videos IS DISTINCT FROM OLD.videos
    OR NEW.media_layout IS DISTINCT FROM OLD.media_layout
    OR NEW.location IS DISTINCT FROM OLD.location
  ) THEN
    NEW.status := 'draft';
    NEW.approval_status := 'pending';
    NEW.submitted_at := NOW();
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.rejection_reason := NULL;
    NEW.published_at := NULL;
  ELSIF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    NEW.status := 'draft';
    NEW.published_at := NULL;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS info_blogs_guard_user_moderation ON public.info_blogs;
CREATE TRIGGER info_blogs_guard_user_moderation
  BEFORE UPDATE ON public.info_blogs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_user_blog_moderation();

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

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid moderation decision';
  END IF;

  IF p_reviewer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.info_users WHERE id = p_reviewer_id AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'The reviewer must be an administrator';
  END IF;

  IF p_decision = 'rejected' AND cleaned_reason IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;
  IF length(cleaned_reason) > 1000 THEN
    RAISE EXCEPTION 'Rejection reasons must be 1,000 characters or fewer';
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
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN cleaned_reason ELSE NULL END,
      updated_at = NOW()
  WHERE id = p_blog_id
  RETURNING * INTO blog_row;

  INSERT INTO public.blog_moderation_history (
    blog_id, blog_title, blog_author_id, reviewed_by, action, reason
  )
  VALUES (
    blog_row.id, blog_row.title, blog_row.created_by, p_reviewer_id,
    p_decision, CASE WHEN p_decision = 'rejected' THEN cleaned_reason ELSE NULL END
  );

  IF blog_row.created_by IS NOT NULL THEN
    INSERT INTO public.info_notifications (user_id, title, message, type, is_read, created_at, updated_at)
    VALUES (
      blog_row.created_by,
      CASE WHEN p_decision = 'approved' THEN 'Blog post approved' ELSE 'Blog post rejected' END,
      CASE
        WHEN p_decision = 'approved'
          THEN format('Your blog post "%s" was approved and is now public.', blog_row.title)
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