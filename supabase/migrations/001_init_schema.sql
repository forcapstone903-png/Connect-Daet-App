-- ============================================================================
-- Connect-DAET Application - Complete Supabase Schema
-- ============================================================================

-- ============================================================================
-- ENABLE REQUIRED EXTENSIONS
-- ============================================================================
-- Note: PostGIS is optional and may not be available on all Supabase tiers
-- Geographic queries can be added later if PostGIS is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  user_type VARCHAR(50) NOT NULL DEFAULT 'tourist' CHECK (user_type IN ('tourist', 'business', 'admin', 'moderator')),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned', 'pending')),
  profile_image_url TEXT,
  bio TEXT,
  address VARCHAR(255),
  city VARCHAR(100),
  province VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  
  -- Social & engagement
  last_login TIMESTAMP WITH TIME ZONE,
  is_online BOOLEAN DEFAULT false,
  preferences JSONB DEFAULT '{}',
  
  -- Admin fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  
  -- Search optimization
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(email, '') || ' ' || COALESCE(full_name, ''))
  ) STORED
);

CREATE INDEX idx_info_users_email ON public.info_users(email);
CREATE INDEX idx_info_users_user_type ON public.info_users(user_type);
CREATE INDEX idx_info_users_status ON public.info_users(status);
CREATE INDEX idx_info_users_search_vector ON public.info_users USING GIN(search_vector);
CREATE INDEX idx_info_users_created_at ON public.info_users(created_at DESC);

-- ============================================================================
-- 2. AMENITIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_amenities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL CHECK (type IN ('accommodation', 'restaurant', 'transport', 'shop', 'service', 'facility')),
  description TEXT,
  location VARCHAR(255) NOT NULL,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  contact_number VARCHAR(20),
  website TEXT,
  email VARCHAR(255),
  opening_hours VARCHAR(255),
  price_range VARCHAR(50),
  
  -- Features/amenities list
  amenities TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Media
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  featured_image TEXT,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'archived')),
  featured BOOLEAN DEFAULT false,
  rating NUMERIC(3, 2),
  review_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  
  -- Search optimization
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(location, ''))
  ) STORED
);

CREATE INDEX idx_info_amenities_type ON public.info_amenities(type);
CREATE INDEX idx_info_amenities_status ON public.info_amenities(status);
CREATE INDEX idx_info_amenities_featured ON public.info_amenities(featured);
-- Note: Geographic indexes require PostGIS. Add if available:
-- CREATE INDEX idx_info_amenities_location ON public.info_amenities USING GIST(ll_to_earth(latitude, longitude)) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX idx_info_amenities_search_vector ON public.info_amenities USING GIN(search_vector);
CREATE INDEX idx_info_amenities_created_at ON public.info_amenities(created_at DESC);

-- ============================================================================
-- 3. EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  location VARCHAR(255) NOT NULL,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  venue VARCHAR(255),
  
  -- Dates and times
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  
  -- Event details
  category VARCHAR(100) NOT NULL CHECK (category IN ('festival', 'concert', 'exhibition', 'workshop', 'sports', 'cultural', 'other')),
  organizer VARCHAR(255),
  
  -- Pricing
  is_free BOOLEAN DEFAULT true,
  ticket_price NUMERIC(10, 2),
  max_attendees INTEGER,
  current_attendees INTEGER DEFAULT 0,
  
  -- Media
  featured_image TEXT,
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  videos TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  published_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  
  -- Search optimization
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(location, ''))
  ) STORED
);

CREATE INDEX idx_info_events_category ON public.info_events(category);
CREATE INDEX idx_info_events_status ON public.info_events(status);
CREATE INDEX idx_info_events_start_date ON public.info_events(start_date);
-- Note: Geographic indexes require PostGIS. Add if available:
-- CREATE INDEX idx_info_events_location ON public.info_events USING GIST(ll_to_earth(latitude, longitude)) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX idx_info_events_search_vector ON public.info_events USING GIN(search_vector);
CREATE INDEX idx_info_events_created_at ON public.info_events(created_at DESC);

-- ============================================================================
-- 4. BLOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_blogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  featured_image TEXT,
  featured_image_alt VARCHAR(255),
  
  -- Categorization
  category VARCHAR(100) NOT NULL CHECK (category IN ('news', 'travel_tips', 'events', 'culture', 'food', 'announcement', 'other')),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMP WITH TIME ZONE,
  
  -- Engagement
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  
  -- Search optimization
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '') || ' ' || COALESCE(excerpt, ''))
  ) STORED
);

CREATE INDEX idx_info_blogs_slug ON public.info_blogs(slug);
CREATE INDEX idx_info_blogs_category ON public.info_blogs(category);
CREATE INDEX idx_info_blogs_status ON public.info_blogs(status);
CREATE INDEX idx_info_blogs_published_at ON public.info_blogs(published_at DESC);
CREATE INDEX idx_info_blogs_search_vector ON public.info_blogs USING GIN(search_vector);
CREATE INDEX idx_info_blogs_created_at ON public.info_blogs(created_at DESC);

-- ============================================================================
-- 5. ANNOUNCEMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  announcement_type VARCHAR(100) NOT NULL CHECK (announcement_type IN ('urgent', 'important', 'info', 'event', 'weather', 'other')),
  
  -- Targeting
  target_audience VARCHAR(100) DEFAULT 'all' CHECK (target_audience IN ('all', 'tourists', 'businesses', 'admins')),
  priority INTEGER DEFAULT 0,
  
  -- Media
  featured_image TEXT,
  icon VARCHAR(100),
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  
  -- Search optimization
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, ''))
  ) STORED
);

CREATE INDEX idx_info_announcements_type ON public.info_announcements(announcement_type);
CREATE INDEX idx_info_announcements_status ON public.info_announcements(status);
CREATE INDEX idx_info_announcements_priority ON public.info_announcements(priority DESC);
CREATE INDEX idx_info_announcements_published_at ON public.info_announcements(published_at DESC);
CREATE INDEX idx_info_announcements_search_vector ON public.info_announcements USING GIN(search_vector);

-- ============================================================================
-- 6. TOURIST SPOTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_tourist_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL CHECK (category IN ('beach', 'mountain', 'park', 'cultural', 'religious', 'historical', 'adventure', 'other')),
  
  -- Location
  location VARCHAR(255),
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  
  -- Details
  entry_fee NUMERIC(10, 2),
  opening_hours VARCHAR(255),
  best_visit_time VARCHAR(255),
  accessibility_info TEXT,
  
  -- Media
  featured_image TEXT,
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  videos TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Engagement
  rating NUMERIC(3, 2),
  review_count INTEGER DEFAULT 0,
  visit_count INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'closed')),
  featured BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  
  -- Search optimization
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(category, ''))
  ) STORED
);

CREATE INDEX idx_info_tourist_spots_category ON public.info_tourist_spots(category);
CREATE INDEX idx_info_tourist_spots_status ON public.info_tourist_spots(status);
CREATE INDEX idx_info_tourist_spots_featured ON public.info_tourist_spots(featured);
-- Note: Geographic indexes require PostGIS. Add if available:
-- CREATE INDEX idx_info_tourist_spots_location ON public.info_tourist_spots USING GIST(ll_to_earth(latitude, longitude)) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX idx_info_tourist_spots_search_vector ON public.info_tourist_spots USING GIN(search_vector);
CREATE INDEX idx_info_tourist_spots_created_at ON public.info_tourist_spots(created_at DESC);

-- ============================================================================
-- 7. MODERATION/REPORTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_moderation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type VARCHAR(100) NOT NULL CHECK (report_type IN ('user', 'content', 'amenity', 'event', 'blog', 'comment', 'other')),
  reported_item_id UUID,
  reported_item_table VARCHAR(100),
  
  -- Report details
  reason VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Reporter info
  reported_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'rejected', 'archived')),
  
  -- Moderation
  assigned_to UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  moderation_notes TEXT,
  resolution VARCHAR(255),
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Evidence/media
  attachments TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_info_moderation_status ON public.info_moderation(status);
CREATE INDEX idx_info_moderation_severity ON public.info_moderation(severity);
CREATE INDEX idx_info_moderation_report_type ON public.info_moderation(report_type);
CREATE INDEX idx_info_moderation_assigned_to ON public.info_moderation(assigned_to);
CREATE INDEX idx_info_moderation_created_at ON public.info_moderation(created_at DESC);
CREATE INDEX idx_info_moderation_reported_user ON public.info_moderation(reported_user_id);

-- ============================================================================
-- 8. PASSWORD RESET TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_info_password_resets_token ON public.info_password_resets(token);
CREATE INDEX idx_info_password_resets_user_id ON public.info_password_resets(user_id);
CREATE INDEX idx_info_password_resets_expires_at ON public.info_password_resets(expires_at);

-- ============================================================================
-- 9. COMMENTS TABLE (for blogs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID NOT NULL REFERENCES public.info_blogs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  
  content TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Engagement
  likes INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Search optimization
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(content, ''))
  ) STORED
);

CREATE INDEX idx_info_comments_blog_id ON public.info_comments(blog_id);
CREATE INDEX idx_info_comments_user_id ON public.info_comments(user_id);
CREATE INDEX idx_info_comments_status ON public.info_comments(status);
CREATE INDEX idx_info_comments_search_vector ON public.info_comments USING GIN(search_vector);
CREATE INDEX idx_info_comments_created_at ON public.info_comments(created_at DESC);

-- ============================================================================
-- 10. AUDIT LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.info_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  table_name VARCHAR(100),
  record_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_info_audit_log_user_id ON public.info_audit_log(user_id);
CREATE INDEX idx_info_audit_log_action ON public.info_audit_log(action);
CREATE INDEX idx_info_audit_log_table_name ON public.info_audit_log(table_name);
CREATE INDEX idx_info_audit_log_created_at ON public.info_audit_log(created_at DESC);

-- ============================================================================
-- UPDATE TRIGGERS FOR updated_at TIMESTAMPS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_info_users_updated_at BEFORE UPDATE ON public.info_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_amenities_updated_at BEFORE UPDATE ON public.info_amenities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_events_updated_at BEFORE UPDATE ON public.info_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_blogs_updated_at BEFORE UPDATE ON public.info_blogs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_announcements_updated_at BEFORE UPDATE ON public.info_announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_tourist_spots_updated_at BEFORE UPDATE ON public.info_tourist_spots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_moderation_updated_at BEFORE UPDATE ON public.info_moderation
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_info_comments_updated_at BEFORE UPDATE ON public.info_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
