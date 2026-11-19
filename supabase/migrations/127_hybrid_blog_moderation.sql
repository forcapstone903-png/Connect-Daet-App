BEGIN;

ALTER TABLE public.info_blogs
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS risk_score INTEGER,
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderation_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS moderation_checked_at TIMESTAMPTZ;

ALTER TABLE public.info_blogs
  DROP CONSTRAINT IF EXISTS info_blogs_moderation_status_check,
  DROP CONSTRAINT IF EXISTS info_blogs_risk_score_check,
  DROP CONSTRAINT IF EXISTS info_blogs_risk_level_check;
ALTER TABLE public.info_blogs
  ADD CONSTRAINT info_blogs_moderation_status_check
    CHECK (moderation_status IN ('queued', 'processing', 'review_required', 'auto_published', 'approved', 'rejected', 'changes_requested', 'failed')),
  ADD CONSTRAINT info_blogs_risk_score_check
    CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100),
  ADD CONSTRAINT info_blogs_risk_level_check
    CHECK (risk_level IN ('unknown', 'low', 'medium', 'high'));

DROP TRIGGER IF EXISTS info_blogs_admin_edit_ownership ON public.info_blogs;
DROP TRIGGER IF EXISTS info_blogs_guard_user_moderation ON public.info_blogs;

UPDATE public.info_blogs
SET moderation_status = CASE
      WHEN approval_status = 'approved' AND auto_approved THEN 'auto_published'
      WHEN approval_status = 'approved' THEN 'approved'
      WHEN approval_status = 'rejected' THEN 'rejected'
      WHEN approval_status = 'changes_requested' THEN 'changes_requested'
      WHEN approval_status = 'pending' THEN 'queued'
      ELSE 'queued'
    END
WHERE moderation_status = 'queued';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'guard_user_blog_moderation'
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE TRIGGER info_blogs_guard_user_moderation
      BEFORE UPDATE ON public.info_blogs
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_user_blog_moderation();
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'prevent_admin_editing_other_users_blog'
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE TRIGGER info_blogs_admin_edit_ownership
      BEFORE UPDATE ON public.info_blogs
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_admin_editing_other_users_blog();
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS info_blogs_moderation_queue_idx
  ON public.info_blogs (moderation_status, risk_level, submitted_at ASC)
  WHERE approval_status = 'pending';

CREATE TABLE IF NOT EXISTS public.blog_moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID REFERENCES public.info_blogs(id) ON DELETE SET NULL,
  blog_title TEXT NOT NULL,
  blog_author_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  risk_score INTEGER CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100),
  risk_level TEXT CHECK (risk_level IS NULL OR risk_level IN ('unknown', 'low', 'medium', 'high')),
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blog_moderation_logs_blog_created_idx
  ON public.blog_moderation_logs (blog_id, created_at DESC);
CREATE INDEX IF NOT EXISTS blog_moderation_logs_created_idx
  ON public.blog_moderation_logs (created_at DESC);

ALTER TABLE public.blog_moderation_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.blog_moderation_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.blog_moderation_logs TO service_role;

CREATE TABLE IF NOT EXISTS public.admin_moderation_claims (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('blog')),
  entity_id UUID NOT NULL,
  claimed_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS admin_moderation_claims_staff_idx
  ON public.admin_moderation_claims (claimed_by, expires_at);
ALTER TABLE public.admin_moderation_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_moderation_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_moderation_claims TO service_role;

CREATE OR REPLACE FUNCTION public.guard_blog_moderation_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR public.is_admin(auth.uid())
     OR public.is_moderator(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.moderation_status IS DISTINCT FROM 'queued'
       OR NEW.risk_score IS NOT NULL
       OR NEW.risk_level IS DISTINCT FROM 'unknown'
       OR NEW.moderation_reason IS NOT NULL
       OR NEW.moderation_flags IS DISTINCT FROM '[]'::jsonb
       OR NEW.auto_approved IS DISTINCT FROM FALSE
       OR NEW.moderation_checked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Moderation fields are managed by the trusted moderation service';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
     OR NEW.risk_score IS DISTINCT FROM OLD.risk_score
     OR NEW.risk_level IS DISTINCT FROM OLD.risk_level
     OR NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason
     OR NEW.moderation_flags IS DISTINCT FROM OLD.moderation_flags
     OR NEW.auto_approved IS DISTINCT FROM OLD.auto_approved
     OR NEW.moderation_checked_at IS DISTINCT FROM OLD.moderation_checked_at THEN
    RAISE EXCEPTION 'Moderation fields are managed by the trusted moderation service';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS info_blogs_guard_moderation_metadata ON public.info_blogs;
CREATE TRIGGER info_blogs_guard_moderation_metadata
  BEFORE INSERT OR UPDATE ON public.info_blogs
  FOR EACH ROW EXECUTE FUNCTION public.guard_blog_moderation_metadata();

CREATE OR REPLACE FUNCTION public.claim_blog_moderation(p_blog_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  blog_row public.info_blogs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted moderation service access is required';
  END IF;

  SELECT * INTO blog_row
  FROM public.info_blogs
  WHERE id = p_blog_id
  FOR UPDATE;

  IF NOT FOUND OR blog_row.approval_status <> 'pending' THEN
    RETURN jsonb_build_object('claimed', FALSE);
  END IF;
  IF blog_row.moderation_status = 'processing'
     AND blog_row.moderation_checked_at > NOW() - INTERVAL '5 minutes' THEN
    RETURN jsonb_build_object('claimed', FALSE);
  END IF;
  IF blog_row.moderation_status IN ('review_required', 'auto_published', 'approved', 'rejected', 'changes_requested') THEN
    RETURN jsonb_build_object('claimed', FALSE);
  END IF;

  UPDATE public.info_blogs
  SET moderation_status = 'processing',
      moderation_checked_at = NOW(),
      updated_at = NOW()
  WHERE id = p_blog_id
  RETURNING * INTO blog_row;

  RETURN jsonb_build_object('claimed', TRUE, 'blog', to_jsonb(blog_row));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_blog_moderation_context(p_blog_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  blog_row public.info_blogs%ROWTYPE;
  account_created_at TIMESTAMPTZ;
  approved_posts INTEGER;
  rejected_posts INTEGER;
  violations INTEGER;
  recent_submissions INTEGER;
  valid_reports INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted moderation service access is required';
  END IF;

  SELECT * INTO blog_row
  FROM public.info_blogs
  WHERE id = p_blog_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blog post not found';
  END IF;

  SELECT created_at INTO account_created_at
  FROM public.info_users
  WHERE id = blog_row.created_by;
  IF account_created_at IS NULL THEN
    RAISE EXCEPTION 'Author account age is unavailable';
  END IF;

  SELECT COUNT(*)::INTEGER INTO approved_posts
  FROM public.info_blogs
  WHERE created_by = blog_row.created_by AND approval_status = 'approved';

  SELECT COUNT(*)::INTEGER INTO rejected_posts
  FROM public.blog_moderation_history
  WHERE blog_author_id = blog_row.created_by AND action = 'rejected';

  SELECT COUNT(*)::INTEGER INTO violations
  FROM public.user_warnings
  WHERE user_id = blog_row.created_by;

  SELECT COUNT(*)::INTEGER INTO recent_submissions
  FROM public.info_blogs
  WHERE created_by = blog_row.created_by
    AND id <> blog_row.id
    AND created_at >= NOW() - INTERVAL '10 minutes';

  SELECT COUNT(DISTINCT id)::INTEGER INTO valid_reports
  FROM public.info_moderation
  WHERE (
      reported_user_id = blog_row.created_by
      AND status = 'resolved'
    )
    OR (
      reported_item_table = 'info_blogs'
      AND reported_item_id = blog_row.id
      AND status IN ('pending', 'reviewing')
    );

  RETURN jsonb_build_object(
    'accountAgeDays', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - account_created_at)) / 86400)::INTEGER),
    'approvedPosts', approved_posts,
    'rejectedPosts', rejected_posts,
    'violations', violations,
    'recentSubmissions', recent_submissions,
    'validReports', valid_reports
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_blog_moderation(
  p_blog_id UUID,
  p_risk_score INTEGER,
  p_risk_level TEXT,
  p_flags JSONB,
  p_reason TEXT,
  p_auto_publish BOOLEAN DEFAULT FALSE,
  p_check_failed BOOLEAN DEFAULT FALSE,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  blog_row public.info_blogs%ROWTYPE;
  next_moderation_status TEXT;
  published BOOLEAN := FALSE;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted moderation service access is required';
  END IF;
  IF p_risk_score IS NULL OR p_risk_score NOT BETWEEN 0 AND 100
     OR p_risk_level NOT IN ('low', 'medium', 'high')
     OR jsonb_typeof(COALESCE(p_flags, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid moderation result';
  END IF;

  SELECT * INTO blog_row
  FROM public.info_blogs
  WHERE id = p_blog_id
  FOR UPDATE;
  IF NOT FOUND OR blog_row.approval_status <> 'pending'
     OR blog_row.moderation_status <> 'processing' THEN
    RETURN jsonb_build_object('completed', FALSE, 'auto_published', FALSE);
  END IF;

  published := p_auto_publish AND NOT p_check_failed AND p_risk_level = 'low' AND p_risk_score < 30;
  next_moderation_status := CASE
    WHEN p_check_failed THEN 'failed'
    WHEN published THEN 'auto_published'
    ELSE 'review_required'
  END;

  UPDATE public.info_blogs
  SET moderation_status = next_moderation_status,
      risk_score = p_risk_score,
      risk_level = p_risk_level,
      moderation_flags = COALESCE(p_flags, '[]'::jsonb),
      moderation_reason = NULLIF(BTRIM(p_reason), ''),
      auto_approved = published,
      approval_status = CASE WHEN published THEN 'approved' ELSE 'pending' END,
      status = CASE WHEN published THEN 'published' ELSE 'draft' END,
      published_at = CASE WHEN published THEN NOW() ELSE NULL END,
      moderation_checked_at = NOW(),
      updated_at = NOW()
  WHERE id = p_blog_id
  RETURNING * INTO blog_row;

  INSERT INTO public.blog_moderation_logs (
    blog_id, blog_title, blog_author_id, action, risk_score, risk_level, flags, reason, details
  )
  VALUES (
    blog_row.id,
    blog_row.title,
    blog_row.created_by,
    CASE WHEN p_check_failed THEN 'check_failed' WHEN published THEN 'auto_published' ELSE 'queued_for_review' END,
    p_risk_score,
    p_risk_level,
    COALESCE(p_flags, '[]'::jsonb),
    NULLIF(BTRIM(p_reason), ''),
    COALESCE(p_details, '{}'::jsonb)
  );

  IF blog_row.created_by IS NOT NULL THEN
    notification_title := CASE
      WHEN published THEN 'Story published automatically'
      WHEN p_check_failed THEN 'Story held for safety review'
      ELSE 'Story awaiting administrator review'
    END;
    notification_message := CASE
      WHEN published THEN format('Your story "%s" passed automated checks and is now published.', blog_row.title)
      WHEN p_check_failed THEN format('Your story "%s" is saved and will remain unpublished until a moderator reviews it.', blog_row.title)
      ELSE format('Your story "%s" is saved and awaiting administrator review.', blog_row.title)
    END;
    INSERT INTO public.info_notifications (user_id, title, message, type, is_read, created_at, updated_at)
    VALUES (
      blog_row.created_by,
      notification_title,
      notification_message,
      CASE WHEN published THEN 'success' ELSE 'warning' END,
      FALSE,
      NOW(),
      NOW()
    );
  END IF;

  IF NOT published THEN
    INSERT INTO public.info_notifications (user_id, title, message, type, link, actor_id, is_read, created_at, updated_at)
    SELECT
      staff.id,
      CASE WHEN p_check_failed THEN 'Moderation check needs attention' ELSE 'Post awaiting priority review' END,
      format('A blog submission requires review (risk %s/100, %s): %s', p_risk_score, p_risk_level, blog_row.title),
      'moderation',
      '/info/admin/blogs?status=priority',
      blog_row.created_by,
      FALSE,
      NOW(),
      NOW()
    FROM public.info_users AS staff
    WHERE staff.user_type IN ('admin', 'moderator')
      AND staff.status = 'active';
  END IF;

  RETURN jsonb_build_object(
    'completed', TRUE,
    'auto_published', published,
    'blog_id', blog_row.id,
    'created_by', blog_row.created_by,
    'title', blog_row.title,
    'moderation_status', blog_row.moderation_status,
    'approval_status', blog_row.approval_status,
    'risk_score', blog_row.risk_score,
    'risk_level', blog_row.risk_level,
    'moderation_reason', blog_row.moderation_reason,
    'moderation_flags', blog_row.moderation_flags,
    'auto_approved', blog_row.auto_approved,
    'published_at', blog_row.published_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_blog_moderation_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_moderation_status TEXT;
BEGIN
  next_moderation_status := CASE NEW.action
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'changes_requested' THEN 'changes_requested'
    WHEN 'returned_to_pending' THEN 'queued'
    ELSE NULL
  END;

  IF next_moderation_status IS NOT NULL AND NEW.blog_id IS NOT NULL THEN
    UPDATE public.info_blogs
    SET moderation_status = next_moderation_status
    WHERE id = NEW.blog_id;
  END IF;

  INSERT INTO public.blog_moderation_logs (
    blog_id, blog_title, blog_author_id, actor_id, action, risk_score, risk_level, flags, reason
  )
  SELECT
    NEW.blog_id,
    NEW.blog_title,
    NEW.blog_author_id,
    NEW.reviewed_by,
    NEW.action,
    blog.risk_score,
    blog.risk_level,
    COALESCE(blog.moderation_flags, '[]'::jsonb),
    NEW.reason
  FROM (SELECT 1) AS source
  LEFT JOIN public.info_blogs AS blog ON blog.id = NEW.blog_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blog_moderation_history_audit ON public.blog_moderation_history;
CREATE TRIGGER blog_moderation_history_audit
  AFTER INSERT ON public.blog_moderation_history
  FOR EACH ROW EXECUTE FUNCTION public.log_blog_moderation_history();

REVOKE ALL ON FUNCTION public.claim_blog_moderation(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_blog_moderation_context(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_blog_moderation(UUID, INTEGER, TEXT, JSONB, TEXT, BOOLEAN, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_blog_moderation(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_blog_moderation_context(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_blog_moderation(UUID, INTEGER, TEXT, JSONB, TEXT, BOOLEAN, BOOLEAN, JSONB) TO service_role;

COMMIT;
