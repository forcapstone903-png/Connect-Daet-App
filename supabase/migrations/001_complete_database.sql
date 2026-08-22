BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Core enums / helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.info_users
    WHERE id = p_user_id AND user_type = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_moderator(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.info_users
    WHERE id = p_user_id AND user_type IN ('admin', 'moderator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- User and profile tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.info_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  full_name TEXT NOT NULL DEFAULT '',
  user_type TEXT NOT NULL DEFAULT 'tourist' CHECK (user_type IN ('tourist', 'business', 'admin', 'moderator')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended', 'banned')),
  profile_image_url TEXT,
  phone_number TEXT,
  bio TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  last_login TIMESTAMPTZ,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.info_users(id) ON DELETE CASCADE,
  full_name TEXT,
  profile_image_url TEXT,
  bio TEXT,
  city TEXT,
  country TEXT,
  address TEXT,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  badge_name TEXT NOT NULL,
  badge_icon TEXT,
  description TEXT,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reward_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  subsystem_source TEXT NOT NULL DEFAULT 'system',
  points_earned INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_feed_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  preferred_categories TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon_emoji TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('blog', 'event', 'amenity', 'spot')),
  item_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, following_id)
);

-- ============================================================
-- Content tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.info_amenities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'service',
  description TEXT,
  location TEXT,
  address TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  contact_number TEXT,
  email TEXT,
  website TEXT,
  opening_hours TEXT,
  price_range TEXT,
  amenities TEXT[],
  images TEXT[] DEFAULT '{}',
  featured_image TEXT,
  rating NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'archived')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  venue TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  category TEXT NOT NULL DEFAULT 'festival',
  organizer TEXT,
  is_free BOOLEAN NOT NULL DEFAULT TRUE,
  ticket_price NUMERIC(10,2) DEFAULT 0,
  max_attendees INTEGER,
  current_attendees INTEGER NOT NULL DEFAULT 0,
  featured_image TEXT,
  images TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_blogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  content TEXT NOT NULL,
  excerpt TEXT,
  featured_image TEXT,
  category TEXT NOT NULL DEFAULT 'news',
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_tourist_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'beach',
  location TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  entry_fee NUMERIC(10,2) DEFAULT 0,
  opening_hours TEXT,
  best_visit_time TEXT,
  accessibility_info TEXT,
  featured_image TEXT,
  images TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  rating NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'closed')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  announcement_type TEXT NOT NULL DEFAULT 'info' CHECK (announcement_type IN ('urgent', 'important', 'info', 'event', 'weather')),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'tourists', 'businesses', 'admins')),
  priority INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES public.info_blogs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  likes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  title TEXT,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  rating INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  title TEXT,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_user_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'flagged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_moderation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL DEFAULT 'content',
  reason TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  reported_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  reported_item_id UUID,
  reported_item_table TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'rejected')),
  assigned_to UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  moderation_notes TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.info_password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.info_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  changes JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Forum tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.forum_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id UUID REFERENCES public.forum_categories(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
  reply_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.forum_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thread_id, user_id)
);

-- ============================================================
-- Misc / tracking tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, following_id)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_info_users_email ON public.info_users(email);
CREATE INDEX IF NOT EXISTS idx_info_users_user_type ON public.info_users(user_type);
CREATE INDEX IF NOT EXISTS idx_info_users_status ON public.info_users(status);
CREATE INDEX IF NOT EXISTS idx_info_users_created_at ON public.info_users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_info_amenities_status ON public.info_amenities(status);
CREATE INDEX IF NOT EXISTS idx_info_amenities_type ON public.info_amenities(type);
CREATE INDEX IF NOT EXISTS idx_info_events_status ON public.info_events(status);
CREATE INDEX IF NOT EXISTS idx_info_events_start_date ON public.info_events(start_date);
CREATE INDEX IF NOT EXISTS idx_info_blogs_status ON public.info_blogs(status);
CREATE INDEX IF NOT EXISTS idx_info_blogs_category ON public.info_blogs(category);
CREATE INDEX IF NOT EXISTS idx_info_announcements_status ON public.info_announcements(status);
CREATE INDEX IF NOT EXISTS idx_forum_threads_last_activity ON public.forum_threads(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_replies_thread_id ON public.forum_replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON public.user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.info_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.info_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_user_id ON public.info_inquiries(user_id);

-- ============================================================
-- Triggers for updated_at
-- ============================================================

CREATE TRIGGER tr_info_users_updated_at
BEFORE UPDATE ON public.info_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_user_feed_preferences_updated_at
BEFORE UPDATE ON public.user_feed_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_system_categories_updated_at
BEFORE UPDATE ON public.system_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_amenities_updated_at
BEFORE UPDATE ON public.info_amenities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_events_updated_at
BEFORE UPDATE ON public.info_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_blogs_updated_at
BEFORE UPDATE ON public.info_blogs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_tourist_spots_updated_at
BEFORE UPDATE ON public.info_tourist_spots
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_announcements_updated_at
BEFORE UPDATE ON public.info_announcements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_comments_updated_at
BEFORE UPDATE ON public.info_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_feedback_updated_at
BEFORE UPDATE ON public.info_feedback
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_inquiries_updated_at
BEFORE UPDATE ON public.info_inquiries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_notifications_updated_at
BEFORE UPDATE ON public.info_notifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_user_posts_updated_at
BEFORE UPDATE ON public.info_user_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_info_moderation_updated_at
BEFORE UPDATE ON public.info_moderation
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_forum_categories_updated_at
BEFORE UPDATE ON public.forum_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_forum_threads_updated_at
BEFORE UPDATE ON public.forum_threads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_forum_replies_updated_at
BEFORE UPDATE ON public.forum_replies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Helper trigger for forum thread reply count and activity log last activity
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_forum_thread_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.forum_threads
  SET reply_count = (
    SELECT COUNT(*) FROM public.forum_replies WHERE thread_id = NEW.thread_id AND status = 'active'
  ),
      last_activity_at = NOW()
  WHERE id = NEW.thread_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_forum_reply_metrics
AFTER INSERT OR UPDATE OF status ON public.forum_replies
FOR EACH ROW EXECUTE FUNCTION public.update_forum_thread_metrics();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.info_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_tourist_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_user_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feed_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_subscriptions ENABLE ROW LEVEL SECURITY;

-- info_users policies
CREATE POLICY "info_users_select_own_or_admin" ON public.info_users
FOR SELECT
USING (
  auth.uid() = id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_users_insert_admin_only" ON public.info_users
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "info_users_update_own_or_admin" ON public.info_users
FOR UPDATE
USING (
  auth.uid() = id OR public.is_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_users_delete_admin_only" ON public.info_users
FOR DELETE
USING (public.is_admin(auth.uid()));

-- profiles policies
CREATE POLICY "profiles_select_own_or_public" ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id OR is_public = TRUE OR public.is_admin(auth.uid())
);

CREATE POLICY "profiles_insert_own" ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
FOR UPDATE
USING (
  auth.uid() = user_id OR public.is_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

-- system_categories policies
CREATE POLICY "system_categories_select_all" ON public.system_categories
FOR SELECT
USING (true);

CREATE POLICY "system_categories_manage_admin" ON public.system_categories
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- info_amenities policies
CREATE POLICY "info_amenities_select_public" ON public.info_amenities
FOR SELECT
USING (status = 'active' OR public.is_admin(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "info_amenities_insert_own_or_admin" ON public.info_amenities
FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND created_by = auth.uid()) OR public.is_admin(auth.uid())
);

CREATE POLICY "info_amenities_update_own_or_admin" ON public.info_amenities
FOR UPDATE
USING (
  created_by = auth.uid() OR public.is_admin(auth.uid())
)
WITH CHECK (
  created_by = auth.uid() OR public.is_admin(auth.uid())
);

CREATE POLICY "info_amenities_delete_own_or_admin" ON public.info_amenities
FOR DELETE
USING (
  created_by = auth.uid() OR public.is_admin(auth.uid())
);

-- info_events policies
CREATE POLICY "info_events_select_public" ON public.info_events
FOR SELECT
USING (status = 'published' OR public.is_admin(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "info_events_insert_own_or_admin" ON public.info_events
FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND created_by = auth.uid()) OR public.is_admin(auth.uid())
);

CREATE POLICY "info_events_update_own_or_admin" ON public.info_events
FOR UPDATE
USING (
  created_by = auth.uid() OR public.is_admin(auth.uid())
)
WITH CHECK (
  created_by = auth.uid() OR public.is_admin(auth.uid())
);

CREATE POLICY "info_events_delete_own_or_admin" ON public.info_events
FOR DELETE
USING (
  created_by = auth.uid() OR public.is_admin(auth.uid())
);

-- info_blogs policies
CREATE POLICY "info_blogs_select_public" ON public.info_blogs
FOR SELECT
USING (status = 'published' OR public.is_admin(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "info_blogs_insert_own_or_admin" ON public.info_blogs
FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND created_by = auth.uid()) OR public.is_admin(auth.uid())
);

CREATE POLICY "info_blogs_update_own_or_admin" ON public.info_blogs
FOR UPDATE
USING (
  created_by = auth.uid() OR public.is_admin(auth.uid())
)
WITH CHECK (
  created_by = auth.uid() OR public.is_admin(auth.uid())
);

CREATE POLICY "info_blogs_delete_own_or_admin" ON public.info_blogs
FOR DELETE
USING (
  created_by = auth.uid() OR public.is_admin(auth.uid())
);

-- info_tourist_spots policies
CREATE POLICY "info_tourist_spots_select_public" ON public.info_tourist_spots
FOR SELECT
USING (status = 'active' OR public.is_admin(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "info_tourist_spots_insert_admin_or_owner" ON public.info_tourist_spots
FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND created_by = auth.uid()) OR public.is_admin(auth.uid())
);

CREATE POLICY "info_tourist_spots_update_admin_or_owner" ON public.info_tourist_spots
FOR UPDATE
USING (
  created_by = auth.uid() OR public.is_admin(auth.uid())
)
WITH CHECK (
  created_by = auth.uid() OR public.is_admin(auth.uid())
);

CREATE POLICY "info_tourist_spots_delete_admin_or_owner" ON public.info_tourist_spots
FOR DELETE
USING (
  created_by = auth.uid() OR public.is_admin(auth.uid())
);

-- info_announcements policies
CREATE POLICY "info_announcements_select_public" ON public.info_announcements
FOR SELECT
USING (
  status = 'published' AND (expires_at IS NULL OR expires_at > NOW()) OR public.is_admin(auth.uid())
);

CREATE POLICY "info_announcements_manage_admin" ON public.info_announcements
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- comments, feedback, inquiries, notifications, user posts, moderation
CREATE POLICY "info_comments_select_auth" ON public.info_comments
FOR SELECT
USING (auth.uid() IS NOT NULL OR public.is_admin(auth.uid()));

CREATE POLICY "info_comments_insert_own_or_admin" ON public.info_comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_comments_update_own_or_admin" ON public.info_comments
FOR UPDATE
USING (
  auth.uid() = user_id OR public.is_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_feedback_select_own_or_admin" ON public.info_feedback
FOR SELECT
USING (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_feedback_insert_own" ON public.info_feedback
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "info_feedback_update_own_or_admin" ON public.info_feedback
FOR UPDATE
USING (
  auth.uid() = user_id OR public.is_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_inquiries_select_own_or_admin" ON public.info_inquiries
FOR SELECT
USING (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_inquiries_insert_own" ON public.info_inquiries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "info_inquiries_update_own_or_admin" ON public.info_inquiries
FOR UPDATE
USING (
  auth.uid() = user_id OR public.is_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_notifications_select_own" ON public.info_notifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "info_notifications_insert_own_or_admin" ON public.info_notifications
FOR INSERT
WITH CHECK (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_notifications_update_own_or_admin" ON public.info_notifications
FOR UPDATE
USING (
  auth.uid() = user_id OR public.is_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_user_posts_select_own_or_admin" ON public.info_user_posts
FOR SELECT
USING (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_user_posts_insert_own" ON public.info_user_posts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "info_user_posts_update_own_or_admin" ON public.info_user_posts
FOR UPDATE
USING (
  auth.uid() = user_id OR public.is_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id OR public.is_admin(auth.uid())
);

CREATE POLICY "info_moderation_select_admin" ON public.info_moderation
FOR SELECT
USING (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()));

CREATE POLICY "info_moderation_insert_auth" ON public.info_moderation
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "info_moderation_update_admin" ON public.info_moderation
FOR UPDATE
USING (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()));

CREATE POLICY "info_password_resets_select_own" ON public.info_password_resets
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "info_password_resets_manage_own_or_admin" ON public.info_password_resets
FOR ALL
USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "info_audit_log_select_admin" ON public.info_audit_log
FOR SELECT
USING (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()));

CREATE POLICY "info_audit_log_insert_admin" ON public.info_audit_log
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()) OR public.is_moderator(auth.uid()));

CREATE POLICY "user_activity_log_select_own" ON public.user_activity_log
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "user_activity_log_insert_own" ON public.user_activity_log
FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "user_points_select_own_or_admin" ON public.user_points
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "user_points_insert_admin_or_own" ON public.user_points
FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "user_badges_select_own_or_admin" ON public.user_badges
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "reward_history_select_own_or_admin" ON public.reward_history
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "user_feed_preferences_select_own" ON public.user_feed_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "user_feed_preferences_upsert_own" ON public.user_feed_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_feed_preferences_update_own" ON public.user_feed_preferences
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_favorites_select_own" ON public.user_favorites
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "user_favorites_insert_own" ON public.user_favorites
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_favorites_delete_own" ON public.user_favorites
FOR DELETE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "follows_select_own_or_public" ON public.follows
FOR SELECT
USING (auth.uid() = follower_id OR auth.uid() = following_id OR public.is_admin(auth.uid()));

CREATE POLICY "follows_insert_own" ON public.follows
FOR INSERT
WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows_delete_own" ON public.follows
FOR DELETE
USING (auth.uid() = follower_id OR public.is_admin(auth.uid()));

CREATE POLICY "forum_categories_select_all" ON public.forum_categories
FOR SELECT
USING (true);

CREATE POLICY "forum_categories_manage_admin" ON public.forum_categories
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "forum_threads_select_all" ON public.forum_threads
FOR SELECT
USING (status = 'published' OR auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE POLICY "forum_threads_insert_own" ON public.forum_threads
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "forum_threads_update_own_or_admin" ON public.forum_threads
FOR UPDATE
USING (auth.uid() = created_by OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE POLICY "forum_replies_select_all" ON public.forum_replies
FOR SELECT
USING (status = 'active' OR auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "forum_replies_insert_own" ON public.forum_replies
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_replies_update_own_or_admin" ON public.forum_replies
FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "forum_subscriptions_select_own" ON public.forum_subscriptions
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "forum_subscriptions_insert_own" ON public.forum_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_subscriptions_delete_own" ON public.forum_subscriptions
FOR DELETE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ============================================================
-- Grants for service role / anonymous access
-- ============================================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.info_users, public.profiles, public.user_feed_preferences, public.user_favorites, public.follows, public.info_amenities, public.info_events, public.info_blogs, public.info_tourist_spots, public.info_comments, public.info_feedback, public.info_inquiries, public.info_notifications, public.info_user_posts, public.user_activity_log, public.forum_threads, public.forum_replies, public.forum_subscriptions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.info_moderation, public.info_audit_log, public.info_password_resets, public.user_points, public.reward_history, public.user_badges TO authenticated;

COMMIT;
