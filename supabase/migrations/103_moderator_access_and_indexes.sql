-- 103: Moderator write access to community content + indexes for hot queries.
--
-- Moderators reach the moderation and user pages (staffRoles: moderation.manage,
-- users.view), but the browser writes on those pages were only allowed for
-- is_admin(), so flagging a post or hiding/deleting a reported comment failed
-- for moderators. can_moderate() admits ACTIVE admins and moderators only.
-- Additive only: no data is changed and no existing policy is removed.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_moderate(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.info_users u
    WHERE u.id = p_user_id
      AND u.status = 'active'
      AND u.user_type IN ('admin', 'administrator', 'moderator')
  );
$$;

REVOKE ALL ON FUNCTION public.can_moderate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_moderate(uuid) TO authenticated, service_role;

DO $$
DECLARE
  v_table text;
  v_cmd text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['info_user_posts', 'content_comments', 'info_comments', 'info_blogs'] LOOP
    CONTINUE WHEN to_regclass(format('public.%I', v_table)) IS NULL;
    FOREACH v_cmd IN ARRAY ARRAY['update', 'delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_moderator_' || v_cmd, v_table);
      IF v_cmd = 'update' THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.can_moderate(auth.uid())) WITH CHECK (public.can_moderate(auth.uid()))',
          v_table || '_moderator_update', v_table
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE USING (public.can_moderate(auth.uid()))',
          v_table || '_moderator_delete', v_table
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Moderators publish official blog posts from the staff blog editor.
DROP POLICY IF EXISTS info_blogs_moderator_insert ON public.info_blogs;
CREATE POLICY info_blogs_moderator_insert
  ON public.info_blogs FOR INSERT
  WITH CHECK (public.can_moderate(auth.uid()) AND created_by = auth.uid());

-- ------------------------------------------------------------------
-- Indexes for the queries the app runs most (unread badges, follower
-- fan-out, moderation queues, audit/activity screens, alert reach).
-- ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS info_notifications_user_unread_idx
  ON public.info_notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS info_notifications_alert_idx
  ON public.info_notifications (alert_id) WHERE alert_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_follows_following_idx
  ON public.user_follows (following_id);
CREATE INDEX IF NOT EXISTS info_user_posts_user_created_idx
  ON public.info_user_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS info_user_posts_status_created_idx
  ON public.info_user_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS info_moderation_status_created_idx
  ON public.info_moderation (status, created_at DESC);
CREATE INDEX IF NOT EXISTS info_audit_log_created_idx
  ON public.info_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS info_audit_log_action_created_idx
  ON public.info_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS info_blogs_created_by_idx
  ON public.info_blogs (created_by);
CREATE INDEX IF NOT EXISTS info_blogs_public_listing_idx
  ON public.info_blogs (status, approval_status, published_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_created_idx
  ON public.direct_messages (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attraction_ratings_user_idx
  ON public.attraction_ratings (user_id);

COMMIT;
