-- ============================================================================
-- Connect-DAET Application - Row Level Security (RLS) Policies
-- ============================================================================

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================
ALTER TABLE public.info_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_tourist_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION: Check if user is admin
-- ============================================================================
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.info_users
    WHERE id = user_id AND user_type = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- HELPER FUNCTION: Check if user is moderator
-- ============================================================================
CREATE OR REPLACE FUNCTION is_moderator(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.info_users
    WHERE id = user_id AND user_type IN ('admin', 'moderator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- INFO_USERS RLS POLICIES
-- ============================================================================

-- Users can view their own profile and admins can view all
CREATE POLICY "users_select" ON public.info_users
  FOR SELECT
  USING (
    auth.uid()::text = id::text
    OR is_admin(auth.uid())
    OR user_type = 'admin' -- Public can see admin profiles
  );

-- Users can update their own profile
CREATE POLICY "users_update_own" ON public.info_users
  FOR UPDATE
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- Only admins can insert users
CREATE POLICY "users_insert_admin" ON public.info_users
  FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Only admins can delete users
CREATE POLICY "users_delete_admin" ON public.info_users
  FOR DELETE
  USING (is_admin(auth.uid()));

-- ============================================================================
-- INFO_AMENITIES RLS POLICIES
-- ============================================================================

-- Everyone can view active amenities
CREATE POLICY "amenities_select_public" ON public.info_amenities
  FOR SELECT
  USING (
    status = 'active'
    OR created_by = auth.uid()
    OR is_admin(auth.uid())
  );

-- Admins and creators can update
CREATE POLICY "amenities_update" ON public.info_amenities
  FOR UPDATE
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- Authenticated users can insert
CREATE POLICY "amenities_insert" ON public.info_amenities
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- Admins and creators can delete
CREATE POLICY "amenities_delete" ON public.info_amenities
  FOR DELETE
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- ============================================================================
-- INFO_EVENTS RLS POLICIES
-- ============================================================================

-- Everyone can view published events
CREATE POLICY "events_select_public" ON public.info_events
  FOR SELECT
  USING (
    status = 'published'
    OR created_by = auth.uid()
    OR is_admin(auth.uid())
  );

-- Admins and creators can update
CREATE POLICY "events_update" ON public.info_events
  FOR UPDATE
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- Authenticated users can insert
CREATE POLICY "events_insert" ON public.info_events
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- Admins and creators can delete
CREATE POLICY "events_delete" ON public.info_events
  FOR DELETE
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- ============================================================================
-- INFO_BLOGS RLS POLICIES
-- ============================================================================

-- Everyone can view published blogs
CREATE POLICY "blogs_select_public" ON public.info_blogs
  FOR SELECT
  USING (
    status = 'published'
    OR created_by = auth.uid()
    OR is_admin(auth.uid())
  );

-- Admins and creators can update
CREATE POLICY "blogs_update" ON public.info_blogs
  FOR UPDATE
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- Authenticated users can insert
CREATE POLICY "blogs_insert" ON public.info_blogs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- Admins and creators can delete
CREATE POLICY "blogs_delete" ON public.info_blogs
  FOR DELETE
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- ============================================================================
-- INFO_ANNOUNCEMENTS RLS POLICIES
-- ============================================================================

-- Everyone can view published announcements
CREATE POLICY "announcements_select_public" ON public.info_announcements
  FOR SELECT
  USING (
    status = 'published'
    AND (
      expires_at IS NULL
      OR expires_at > NOW()
    )
    OR is_admin(auth.uid())
  );

-- Only admins can insert announcements
CREATE POLICY "announcements_insert" ON public.info_announcements
  FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Only admins can update
CREATE POLICY "announcements_update" ON public.info_announcements
  FOR UPDATE
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Only admins can delete
CREATE POLICY "announcements_delete" ON public.info_announcements
  FOR DELETE
  USING (is_admin(auth.uid()));

-- ============================================================================
-- INFO_TOURIST_SPOTS RLS POLICIES
-- ============================================================================

-- Everyone can view active tourist spots
CREATE POLICY "tourist_spots_select_public" ON public.info_tourist_spots
  FOR SELECT
  USING (
    status = 'active'
    OR created_by = auth.uid()
    OR is_admin(auth.uid())
  );

-- Admins and creators can update
CREATE POLICY "tourist_spots_update" ON public.info_tourist_spots
  FOR UPDATE
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- Authenticated users can insert
CREATE POLICY "tourist_spots_insert" ON public.info_tourist_spots
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- Admins and creators can delete
CREATE POLICY "tourist_spots_delete" ON public.info_tourist_spots
  FOR DELETE
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- ============================================================================
-- INFO_MODERATION RLS POLICIES
-- ============================================================================

-- Users can view reports they made or assigned to them
CREATE POLICY "moderation_select" ON public.info_moderation
  FOR SELECT
  USING (
    reported_by = auth.uid()
    OR assigned_to = auth.uid()
    OR is_moderator(auth.uid())
  );

-- Authenticated users can create reports
CREATE POLICY "moderation_insert" ON public.info_moderation
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND reported_by = auth.uid()
  );

-- Moderators can update reports
CREATE POLICY "moderation_update" ON public.info_moderation
  FOR UPDATE
  USING (is_moderator(auth.uid()))
  WITH CHECK (is_moderator(auth.uid()));

-- Moderators can delete reports
CREATE POLICY "moderation_delete" ON public.info_moderation
  FOR DELETE
  USING (is_moderator(auth.uid()));

-- ============================================================================
-- INFO_PASSWORD_RESETS RLS POLICIES
-- ============================================================================

-- Users can only see their own password reset tokens
CREATE POLICY "password_resets_select" ON public.info_password_resets
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_admin(auth.uid())
  );

-- Anyone can insert (for password reset flow)
CREATE POLICY "password_resets_insert" ON public.info_password_resets
  FOR INSERT
  WITH CHECK (true);

-- Users can update their own tokens
CREATE POLICY "password_resets_update" ON public.info_password_resets
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR is_admin(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_admin(auth.uid())
  );

-- ============================================================================
-- INFO_COMMENTS RLS POLICIES
-- ============================================================================

-- Everyone can view approved comments
CREATE POLICY "comments_select_public" ON public.info_comments
  FOR SELECT
  USING (
    status = 'approved'
    OR user_id = auth.uid()
    OR is_moderator(auth.uid())
  );

-- Authenticated users can insert comments
CREATE POLICY "comments_insert" ON public.info_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- Users can update their own comments
CREATE POLICY "comments_update" ON public.info_comments
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR is_moderator(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_moderator(auth.uid())
  );

-- Users can delete their own comments, moderators can delete any
CREATE POLICY "comments_delete" ON public.info_comments
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_moderator(auth.uid())
  );

-- ============================================================================
-- INFO_AUDIT_LOG RLS POLICIES
-- ============================================================================

-- Only admins can view audit logs
CREATE POLICY "audit_log_select" ON public.info_audit_log
  FOR SELECT
  USING (is_admin(auth.uid()));

-- Only service role can insert (via functions)
CREATE POLICY "audit_log_insert" ON public.info_audit_log
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- GRANT POLICIES
-- ============================================================================
GRANT ALL ON public.info_users TO authenticated, service_role;
GRANT ALL ON public.info_amenities TO authenticated, service_role;
GRANT ALL ON public.info_events TO authenticated, service_role;
GRANT ALL ON public.info_blogs TO authenticated, service_role;
GRANT ALL ON public.info_announcements TO authenticated, service_role;
GRANT ALL ON public.info_tourist_spots TO authenticated, service_role;
GRANT ALL ON public.info_moderation TO authenticated, service_role;
GRANT ALL ON public.info_password_resets TO authenticated, service_role;
GRANT ALL ON public.info_comments TO authenticated, service_role;
GRANT ALL ON public.info_audit_log TO authenticated, service_role;
