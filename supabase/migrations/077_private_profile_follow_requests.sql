BEGIN;

CREATE TABLE IF NOT EXISTS public.follow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_requests_incoming_pending
  ON public.follow_requests(following_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_follow_requests_outgoing_pending
  ON public.follow_requests(follower_id, following_id)
  WHERE status = 'pending';

ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follow_requests_select_participant ON public.follow_requests;
CREATE POLICY follow_requests_select_participant
  ON public.follow_requests FOR SELECT
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

CREATE OR REPLACE FUNCTION public.can_view_account_content(
  content_owner_id UUID,
  content_visibility TEXT DEFAULT 'public'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = content_owner_id
    OR public.is_admin(auth.uid())
    OR (
      COALESCE(content_visibility, 'public') <> 'private'
      AND (
        COALESCE((
          SELECT CASE
            WHEN profile.is_public = FALSE THEN
              CASE
                WHEN profile.privacy_level IN ('followers', 'private') THEN profile.privacy_level
                ELSE 'followers'
              END
            ELSE COALESCE(profile.privacy_level, 'public')
          END
          FROM public.profiles AS profile
          WHERE profile.user_id = content_owner_id
        ), 'public') = 'public'
        OR EXISTS (
          SELECT 1
          FROM public.user_follows AS follow
          WHERE follow.follower_id = auth.uid()
            AND follow.following_id = content_owner_id
        )
      )
      AND (
        COALESCE(content_visibility, 'public') <> 'followers'
        OR EXISTS (
          SELECT 1
          FROM public.user_follows AS follow
          WHERE follow.follower_id = auth.uid()
            AND follow.following_id = content_owner_id
        )
      )
    );
$$;

DROP POLICY IF EXISTS user_follows_insert_own ON public.user_follows;
CREATE POLICY user_follows_insert_own
  ON public.user_follows FOR INSERT
  WITH CHECK (
    auth.uid() = follower_id
    AND follower_id <> following_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.user_id = following_id
        AND profile.privacy_level = 'private'
        AND COALESCE(profile.privacy_preferences->>'autoApproveFollowRequests', 'false') <> 'true'
    )
  );

DROP POLICY IF EXISTS info_user_posts_select_own_or_admin ON public.info_user_posts;
DROP POLICY IF EXISTS info_user_posts_select_published_public ON public.info_user_posts;
DROP POLICY IF EXISTS info_user_posts_select_visibility ON public.info_user_posts;
CREATE POLICY info_user_posts_select_visibility
  ON public.info_user_posts FOR SELECT
  USING (
    ((status = 'published' AND auth.uid() IS NOT NULL) OR auth.uid() = user_id OR public.is_admin(auth.uid()))
    AND public.can_view_account_content(user_id, visibility)
  );

DROP POLICY IF EXISTS info_blogs_select_public ON public.info_blogs;
CREATE POLICY info_blogs_select_public
  ON public.info_blogs FOR SELECT
  USING (
    (status = 'published' OR auth.uid() = created_by OR public.is_admin(auth.uid()))
    AND public.can_view_account_content(created_by)
  );

DROP POLICY IF EXISTS info_events_select_public ON public.info_events;
CREATE POLICY info_events_select_public
  ON public.info_events FOR SELECT
  USING (
    (status = 'published' OR auth.uid() = created_by OR public.is_admin(auth.uid()))
    AND public.can_view_account_content(created_by)
  );

DROP POLICY IF EXISTS forum_threads_select_all ON public.forum_threads;
CREATE POLICY forum_threads_select_all
  ON public.forum_threads FOR SELECT
  USING (
    (status IN ('active', 'published') OR auth.uid() = created_by OR public.is_admin(auth.uid()))
    AND public.can_view_account_content(created_by)
  );

DROP POLICY IF EXISTS reposts_select_all ON public.reposts;
CREATE POLICY reposts_select_all
  ON public.reposts FOR SELECT
  USING (
    (status = 'active' OR auth.uid() = user_id OR public.is_admin(auth.uid()))
    AND public.can_view_account_content(user_id, visibility)
  );

COMMIT;
