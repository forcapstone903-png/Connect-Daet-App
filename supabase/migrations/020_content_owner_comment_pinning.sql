BEGIN;

DROP POLICY IF EXISTS "content_comments_update_own_or_admin" ON public.content_comments;

CREATE POLICY "content_comments_update_own_or_content_owner"
  ON public.content_comments
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR (
      CASE content_type
        WHEN 'blog' THEN EXISTS (
          SELECT 1 FROM public.info_blogs
          WHERE id = content_id AND created_by = auth.uid()
        )
        WHEN 'event' THEN EXISTS (
          SELECT 1 FROM public.info_events
          WHERE id = content_id AND created_by = auth.uid()
        )
        WHEN 'forum_thread' THEN EXISTS (
          SELECT 1 FROM public.forum_threads
          WHERE id = content_id AND created_by = auth.uid()
        )
        WHEN 'announcement' THEN EXISTS (
          SELECT 1 FROM public.info_announcements
          WHERE id = content_id AND created_by = auth.uid()
        )
        WHEN 'user_post' THEN EXISTS (
          SELECT 1 FROM public.info_user_posts
          WHERE id = content_id AND user_id = auth.uid()
        )
        ELSE FALSE
      END
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR (
      CASE content_type
        WHEN 'blog' THEN EXISTS (
          SELECT 1 FROM public.info_blogs
          WHERE id = content_id AND created_by = auth.uid()
        )
        WHEN 'event' THEN EXISTS (
          SELECT 1 FROM public.info_events
          WHERE id = content_id AND created_by = auth.uid()
        )
        WHEN 'forum_thread' THEN EXISTS (
          SELECT 1 FROM public.forum_threads
          WHERE id = content_id AND created_by = auth.uid()
        )
        WHEN 'announcement' THEN EXISTS (
          SELECT 1 FROM public.info_announcements
          WHERE id = content_id AND created_by = auth.uid()
        )
        WHEN 'user_post' THEN EXISTS (
          SELECT 1 FROM public.info_user_posts
          WHERE id = content_id AND user_id = auth.uid()
        )
        ELSE FALSE
      END
    )
  );

COMMIT;