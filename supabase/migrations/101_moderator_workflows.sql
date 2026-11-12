BEGIN;

ALTER TABLE public.admin_app_settings
  DROP CONSTRAINT IF EXISTS admin_app_settings_id_check;
ALTER TABLE public.admin_app_settings
  ADD CONSTRAINT admin_app_settings_id_check
  CHECK (id IN ('general', 'moderation', 'announcement', 'rewards', 'community-guidelines'));

INSERT INTO public.admin_app_settings (id, value)
VALUES (
  'community-guidelines',
  jsonb_build_object(
    'content',
    E'Be respectful and constructive.\nDo not post harassment, hate speech, threats, spam, or unlawful content.\nShare accurate information and respect other people''s privacy.\nSubmitted blogs, forum posts, replies, and comments are reviewed by moderators before publication.'
  )
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.info_user_posts
  DROP CONSTRAINT IF EXISTS info_user_posts_status_check;
ALTER TABLE public.info_user_posts
  ADD CONSTRAINT info_user_posts_status_check
CHECK (status IN ('draft', 'pending', 'published', 'flagged', 'archived', 'approved', 'rejected'));

ALTER TABLE public.forum_threads
  DROP CONSTRAINT IF EXISTS forum_threads_status_check;
ALTER TABLE public.forum_threads
  ADD CONSTRAINT forum_threads_status_check
  CHECK (status IN ('draft', 'pending', 'published', 'closed', 'archived', 'rejected'));

ALTER TABLE public.forum_replies
  DROP CONSTRAINT IF EXISTS forum_replies_status_check;
ALTER TABLE public.forum_replies
  ADD CONSTRAINT forum_replies_status_check
  CHECK (status IN ('active', 'pending', 'hidden', 'rejected'));

ALTER TABLE public.content_comments
  DROP CONSTRAINT IF EXISTS content_comments_status_check;
ALTER TABLE public.content_comments
  ADD CONSTRAINT content_comments_status_check
  CHECK (status IN ('active', 'pending', 'hidden', 'deleted', 'rejected'));

CREATE OR REPLACE FUNCTION public.hold_user_content_for_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  old_data JSONB;
  new_data JSONB := to_jsonb(NEW);
  content_changed BOOLEAN := FALSE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR current_user_id IS NULL
     OR public.is_admin(current_user_id) OR public.is_moderator(current_user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'forum_replies' THEN
    IF EXISTS (
      SELECT 1 FROM public.forum_threads
      WHERE id = NEW.thread_id AND status = 'closed'
    ) THEN
      RAISE EXCEPTION 'This forum thread is locked and no longer accepts replies.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME IN ('info_user_posts', 'forum_threads')
       AND NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;
    NEW.status := 'pending';
    RETURN NEW;
  END IF;

  old_data := to_jsonb(OLD);
  content_changed :=
    COALESCE(old_data->>'title', '') IS DISTINCT FROM COALESCE(new_data->>'title', '')
    OR COALESCE(old_data->>'content', '') IS DISTINCT FROM COALESCE(new_data->>'content', '')
    OR COALESCE(old_data->>'body', '') IS DISTINCT FROM COALESCE(new_data->>'body', '')
    OR COALESCE(old_data->>'excerpt', '') IS DISTINCT FROM COALESCE(new_data->>'excerpt', '');

  IF content_changed OR OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'info_user_posts',
    'forum_threads',
    'forum_replies',
    'content_comments',
    'info_comments'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tr_hold_user_content_for_moderation ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER tr_hold_user_content_for_moderation BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.hold_user_content_for_moderation()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_user_blog_publication_for_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'authenticated'
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_moderator(auth.uid())
     AND (NEW.status = 'published' OR NEW.approval_status = 'approved') THEN
    NEW.status := 'draft';
    NEW.approval_status := 'pending';
    NEW.published_at := NULL;
    NEW.submitted_at := COALESCE(NEW.submitted_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_hold_user_blog_publication_for_moderation ON public.info_blogs;
CREATE TRIGGER tr_hold_user_blog_publication_for_moderation
  BEFORE INSERT ON public.info_blogs
  FOR EACH ROW
  EXECUTE FUNCTION public.hold_user_blog_publication_for_moderation();

DROP POLICY IF EXISTS info_announcements_select_public ON public.info_announcements;
CREATE POLICY info_announcements_select_public
  ON public.info_announcements FOR SELECT
  USING (
    (status = 'published' AND (expires_at IS NULL OR expires_at > NOW()))
    OR public.is_admin(auth.uid())
    OR public.is_moderator(auth.uid())
  );

DROP POLICY IF EXISTS info_announcements_manage_admin ON public.info_announcements;
CREATE POLICY info_announcements_manage_staff
  ON public.info_announcements FOR ALL
  USING (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()));

DROP POLICY IF EXISTS info_comments_select_auth ON public.info_comments;
CREATE POLICY info_comments_select_approved_or_owner_or_staff
  ON public.info_comments FOR SELECT
  USING (
    (status = 'approved' AND auth.uid() IS NOT NULL)
    OR auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR public.is_moderator(auth.uid())
  );

DROP POLICY IF EXISTS content_comments_select_all ON public.content_comments;
CREATE POLICY content_comments_select_active_or_owner_or_staff
  ON public.content_comments FOR SELECT
  USING (
    status = 'active'
    OR auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR public.is_moderator(auth.uid())
  );

DROP POLICY IF EXISTS forum_threads_select_all ON public.forum_threads;
CREATE POLICY forum_threads_select_public_or_owner_or_staff
  ON public.forum_threads FOR SELECT
  USING (
    status IN ('published', 'closed')
    OR auth.uid() = created_by
    OR public.is_admin(auth.uid())
    OR public.is_moderator(auth.uid())
  );

DROP POLICY IF EXISTS forum_replies_select_all ON public.forum_replies;
CREATE POLICY forum_replies_select_active_or_owner_or_staff
  ON public.forum_replies FOR SELECT
  USING (
    (
      status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.forum_threads thread
        WHERE thread.id = forum_replies.thread_id
          AND thread.status IN ('published', 'closed')
      )
    )
    OR auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR public.is_moderator(auth.uid())
  );

DROP POLICY IF EXISTS info_user_posts_select_published_public ON public.info_user_posts;
DROP POLICY IF EXISTS info_user_posts_select_own_or_admin ON public.info_user_posts;
CREATE POLICY info_user_posts_select_published_or_owner_or_staff
  ON public.info_user_posts FOR SELECT
  USING (
    (status = 'published' AND auth.uid() IS NOT NULL)
    OR auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR public.is_moderator(auth.uid())
  );

COMMIT;
