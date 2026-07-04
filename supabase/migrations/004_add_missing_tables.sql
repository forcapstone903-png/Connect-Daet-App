-- ============================================================================
-- Connect-DAET Application - Missing Table Definitions and RLS Policies
-- ============================================================================

-- ============================================================================
-- USER POSTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_user_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  spot_id UUID REFERENCES public.info_tourist_spots(id) ON DELETE SET NULL,
  title VARCHAR(255),
  content TEXT NOT NULL,
  post_type VARCHAR(100) NOT NULL DEFAULT 'general' CHECK (post_type IN ('general', 'review', 'question', 'tip', 'photo_share', 'announcement', 'update', 'other')),
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'flagged', 'rejected', 'archived')),
  moderated_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMP WITH TIME ZONE,
  moderation_notes TEXT,
  likes INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_info_user_posts_user_id ON public.info_user_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_info_user_posts_spot_id ON public.info_user_posts(spot_id);
CREATE INDEX IF NOT EXISTS idx_info_user_posts_status ON public.info_user_posts(status);
CREATE INDEX IF NOT EXISTS idx_info_user_posts_created_at ON public.info_user_posts(created_at DESC);

-- ============================================================================
-- INQUIRIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'booking', 'safety', 'feedback', 'report', 'other')),
  status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'answered', 'closed', 'cancelled')),
  assigned_to UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  admin_response TEXT,
  responded_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  responded_at TIMESTAMP WITH TIME ZONE,
  internal_notes JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_info_inquiries_user_id ON public.info_inquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_info_inquiries_status ON public.info_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_info_inquiries_category ON public.info_inquiries(category);
CREATE INDEX IF NOT EXISTS idx_info_inquiries_assigned_to ON public.info_inquiries(assigned_to);
CREATE INDEX IF NOT EXISTS idx_info_inquiries_responded_at ON public.info_inquiries(responded_at);
CREATE INDEX IF NOT EXISTS idx_info_inquiries_created_at ON public.info_inquiries(created_at DESC);

-- ============================================================================
-- FEEDBACK TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL,
  target_type VARCHAR(100) NOT NULL CHECK (target_type IN ('event', 'spot', 'amenity', 'blog', 'user', 'other')),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_info_feedback_user_id ON public.info_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_info_feedback_target ON public.info_feedback(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_info_feedback_rating ON public.info_feedback(rating);

-- ============================================================================
-- BOOKINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  spot_id UUID REFERENCES public.info_tourist_spots(id) ON DELETE SET NULL,
  booking_type VARCHAR(100) NOT NULL DEFAULT 'spot' CHECK (booking_type IN ('spot', 'event', 'amenity', 'tour', 'package', 'other')),
  booking_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_info_bookings_user_id ON public.info_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_info_bookings_spot_id ON public.info_bookings(spot_id);
CREATE INDEX IF NOT EXISTS idx_info_bookings_status ON public.info_bookings(status);
CREATE INDEX IF NOT EXISTS idx_info_bookings_booking_date ON public.info_bookings(booking_date);

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read BOOLEAN DEFAULT false,
  data JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_info_notifications_user_id ON public.info_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_info_notifications_is_read ON public.info_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_info_notifications_created_at ON public.info_notifications(created_at DESC);

-- ============================================================================
-- REWARD HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reward_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  subsystem_source VARCHAR(100) NOT NULL,
  points_earned INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_history_user_id ON public.reward_history(user_id);

-- ============================================================================
-- ENABLE RLS ON NEW TABLES
-- ============================================================================
ALTER TABLE public.info_user_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- INFO_USER_POSTS RLS POLICIES
-- ============================================================================
CREATE POLICY "user_posts_select" ON public.info_user_posts
  FOR SELECT
  USING (
    status = 'approved'
    OR user_id = auth.uid()
    OR is_moderator(auth.uid())
  );

CREATE POLICY "user_posts_insert" ON public.info_user_posts
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

CREATE POLICY "user_posts_update" ON public.info_user_posts
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_moderator(auth.uid())
      OR user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      is_moderator(auth.uid())
      OR user_id = auth.uid()
    )
  );

CREATE POLICY "user_posts_delete" ON public.info_user_posts
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_moderator(auth.uid())
      OR user_id = auth.uid()
    )
  );

-- ============================================================================
-- INFO_INQUIRIES RLS POLICIES
-- ============================================================================
CREATE POLICY "inquiries_select" ON public.info_inquiries
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_moderator(auth.uid())
  );

CREATE POLICY "inquiries_insert" ON public.info_inquiries
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

CREATE POLICY "inquiries_update" ON public.info_inquiries
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_moderator(auth.uid())
      OR user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      is_moderator(auth.uid())
      OR user_id = auth.uid()
    )
  );

CREATE POLICY "inquiries_delete" ON public.info_inquiries
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_moderator(auth.uid())
      OR user_id = auth.uid()
    )
  );

-- ============================================================================
-- INFO_FEEDBACK RLS POLICIES
-- ============================================================================
CREATE POLICY "feedback_select" ON public.info_feedback
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_admin(auth.uid())
  );

CREATE POLICY "feedback_insert" ON public.info_feedback
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

CREATE POLICY "feedback_update" ON public.info_feedback
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

CREATE POLICY "feedback_delete" ON public.info_feedback
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_admin(auth.uid())
      OR user_id = auth.uid()
    )
  );

-- ============================================================================
-- INFO_BOOKINGS RLS POLICIES
-- ============================================================================
CREATE POLICY "bookings_select" ON public.info_bookings
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_admin(auth.uid())
  );

CREATE POLICY "bookings_insert" ON public.info_bookings
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

CREATE POLICY "bookings_update" ON public.info_bookings
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR is_admin(auth.uid())
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR is_admin(auth.uid())
    )
  );

CREATE POLICY "bookings_delete" ON public.info_bookings
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR is_admin(auth.uid())
    )
  );

-- ============================================================================
-- INFO_NOTIFICATIONS RLS POLICIES
-- ============================================================================
CREATE POLICY "notifications_select" ON public.info_notifications
  FOR SELECT
  USING (
    user_id = auth.uid()
  );

CREATE POLICY "notifications_insert" ON public.info_notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR is_admin(auth.uid())
    )
  );

CREATE POLICY "notifications_update" ON public.info_notifications
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR is_admin(auth.uid())
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR is_admin(auth.uid())
    )
  );

CREATE POLICY "notifications_delete" ON public.info_notifications
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR is_admin(auth.uid())
    )
  );

-- ============================================================================
-- REWARD_HISTORY RLS POLICIES
-- ============================================================================
CREATE POLICY "reward_history_select" ON public.reward_history
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_admin(auth.uid())
  );

CREATE POLICY "reward_history_insert" ON public.reward_history
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND is_admin(auth.uid())
  );

-- ============================================================================
-- UPDATE TRIGGERS FOR NEW TABLES
-- ============================================================================
CREATE TRIGGER update_info_user_posts_updated_at BEFORE UPDATE ON public.info_user_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_inquiries_updated_at BEFORE UPDATE ON public.info_inquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_feedback_updated_at BEFORE UPDATE ON public.info_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_bookings_updated_at BEFORE UPDATE ON public.info_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_notifications_updated_at BEFORE UPDATE ON public.info_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
