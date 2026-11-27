BEGIN;

DROP POLICY IF EXISTS info_user_posts_select_own_or_admin ON public.info_user_posts;
DROP POLICY IF EXISTS info_user_posts_select_published_public ON public.info_user_posts;
DROP POLICY IF EXISTS info_user_posts_select_visibility ON public.info_user_posts;
DROP POLICY IF EXISTS info_user_posts_select_published_or_owner_or_staff ON public.info_user_posts;
CREATE POLICY info_user_posts_select_published_or_owner_or_staff
  ON public.info_user_posts FOR SELECT
  USING (
    (status = 'published' AND auth.uid() IS NOT NULL)
    OR auth.uid() = user_id
    OR (
      status IS DISTINCT FROM 'draft'
      AND (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()))
    )
  );

DROP POLICY IF EXISTS info_blogs_select_public ON public.info_blogs;
CREATE POLICY info_blogs_select_public
  ON public.info_blogs FOR SELECT
  USING (
    (
      auth.uid() = created_by
      OR (
        status = 'published'
        AND approval_status = 'approved'
        AND (published_at IS NULL OR published_at <= NOW())
      )
      OR (
        public.is_admin(auth.uid())
        AND status IS DISTINCT FROM 'draft'
        AND approval_status IS DISTINCT FROM 'draft'
      )
    )
    AND public.can_view_account_content(created_by)
  );

DROP POLICY IF EXISTS forum_threads_select_all ON public.forum_threads;
DROP POLICY IF EXISTS forum_threads_select_public_or_owner_or_staff ON public.forum_threads;
CREATE POLICY forum_threads_select_public_or_owner_or_staff
  ON public.forum_threads FOR SELECT
  USING (
    status IN ('published', 'closed')
    OR auth.uid() = created_by
    OR (
      status IS DISTINCT FROM 'draft'
      AND (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()))
    )
  );

COMMIT;
