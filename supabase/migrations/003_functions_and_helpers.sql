-- ============================================================================
-- Connect-DAET Application - Storage Buckets & Helper Functions
-- ============================================================================

-- ============================================================================
-- STORAGE BUCKET SETUP (Execute via Supabase Dashboard or SQL Editor)
-- ============================================================================

-- Note: Storage buckets need to be created via the Supabase dashboard or CLI
-- Run these commands in your Supabase SQL Editor:

/*
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('amenities', 'amenities', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('events', 'events', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('blogs', 'blogs', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('tourist-spots', 'tourist-spots', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('user-profiles', 'user-profiles', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('announcements', 'announcements', true);

-- Storage policies for public read access
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT USING (bucket_id IN ('amenities', 'events', 'blogs', 'tourist-spots', 'announcements'));

-- Storage policies for authenticated users to upload
CREATE POLICY "Authenticated Upload" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    auth.role() = 'authenticated' 
    AND bucket_id IN ('amenities', 'events', 'blogs', 'tourist-spots', 'user-profiles', 'announcements')
  );
*/

-- ============================================================================
-- HELPER FUNCTIONS FOR COMMON OPERATIONS
-- ============================================================================

-- ============================================================================
-- Function: Get all active amenities by category
-- ============================================================================
CREATE OR REPLACE FUNCTION get_amenities_by_category(p_category TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  type VARCHAR,
  description TEXT,
  location VARCHAR,
  latitude NUMERIC,
  longitude NUMERIC,
  contact_number VARCHAR,
  website TEXT,
  opening_hours VARCHAR,
  price_range VARCHAR,
  featured_image TEXT,
  rating NUMERIC,
  review_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id, a.name, a.type, a.description, a.location,
    a.latitude, a.longitude, a.contact_number, a.website,
    a.opening_hours, a.price_range, a.featured_image,
    a.rating, a.review_count
  FROM public.info_amenities a
  WHERE a.status = 'active'
    AND (p_category IS NULL OR a.type = p_category)
  ORDER BY a.featured DESC, a.rating DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Get featured amenities
-- ============================================================================
CREATE OR REPLACE FUNCTION get_featured_amenities(p_limit INT DEFAULT 6)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  type VARCHAR,
  location VARCHAR,
  featured_image TEXT,
  rating NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.name, a.type, a.location, a.featured_image, a.rating
  FROM public.info_amenities a
  WHERE a.status = 'active' AND a.featured = true
  ORDER BY a.rating DESC, a.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Get nearby amenities by coordinates
-- ============================================================================
-- NOTE: Requires PostGIS extension. Commented out for compatibility.
-- Uncomment if PostGIS is available on your Supabase tier
--
-- CREATE OR REPLACE FUNCTION get_nearby_amenities(
--   p_latitude NUMERIC,
--   p_longitude NUMERIC,
--   p_distance_km NUMERIC DEFAULT 10
-- )
-- RETURNS TABLE (
--   id UUID,
--   name VARCHAR,
--   type VARCHAR,
--   location VARCHAR,
--   latitude NUMERIC,
--   longitude NUMERIC,
--   featured_image TEXT,
--   distance_km NUMERIC,
--   rating NUMERIC
-- ) AS $$
-- BEGIN
--   RETURN QUERY
--   SELECT 
--     a.id, a.name, a.type, a.location, a.latitude, a.longitude,
--     a.featured_image,
--     (earth_distance(
--       ll_to_earth(p_latitude, p_longitude),
--       ll_to_earth(a.latitude, a.longitude)
--     ) / 1000)::NUMERIC AS distance_km,
--     a.rating
--   FROM public.info_amenities a
--   WHERE a.status = 'active'
--     AND a.latitude IS NOT NULL
--     AND a.longitude IS NOT NULL
--     AND earth_distance(
--       ll_to_earth(p_latitude, p_longitude),
--       ll_to_earth(a.latitude, a.longitude)
--     ) / 1000 <= p_distance_km
--   ORDER BY distance_km ASC;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Get upcoming events
-- ============================================================================
CREATE OR REPLACE FUNCTION get_upcoming_events(p_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  category VARCHAR,
  location VARCHAR,
  start_date DATE,
  end_date DATE,
  featured_image TEXT,
  is_free BOOLEAN,
  ticket_price NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id, e.title, e.category, e.location,
    e.start_date, e.end_date, e.featured_image,
    e.is_free, e.ticket_price
  FROM public.info_events e
  WHERE e.status = 'published'
    AND e.start_date >= CURRENT_DATE
  ORDER BY e.start_date ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Search content across multiple tables
-- ============================================================================
CREATE OR REPLACE FUNCTION search_content(p_query TEXT)
RETURNS TABLE (
  result_type VARCHAR,
  id UUID,
  title_or_name VARCHAR,
  description TEXT,
  image_url TEXT,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  -- Search amenities
  SELECT 
    'amenity'::VARCHAR,
    a.id,
    a.name,
    a.description,
    a.featured_image,
    ts_rank(a.search_vector, plainto_tsquery(p_query))
  FROM public.info_amenities a
  WHERE a.status = 'active'
    AND a.search_vector @@ plainto_tsquery(p_query)
  
  UNION ALL
  
  -- Search events
  SELECT 
    'event'::VARCHAR,
    e.id,
    e.title,
    e.description,
    e.featured_image,
    ts_rank(e.search_vector, plainto_tsquery(p_query))
  FROM public.info_events e
  WHERE e.status = 'published'
    AND e.search_vector @@ plainto_tsquery(p_query)
  
  UNION ALL
  
  -- Search blogs
  SELECT 
    'blog'::VARCHAR,
    b.id,
    b.title,
    b.excerpt,
    b.featured_image,
    ts_rank(b.search_vector, plainto_tsquery(p_query))
  FROM public.info_blogs b
  WHERE b.status = 'published'
    AND b.search_vector @@ plainto_tsquery(p_query)
  
  UNION ALL
  
  -- Search tourist spots
  SELECT 
    'tourist_spot'::VARCHAR,
    ts.id,
    ts.name,
    ts.description,
    ts.featured_image,
    ts_rank(ts.search_vector, plainto_tsquery(p_query))
  FROM public.info_tourist_spots ts
  WHERE ts.status = 'active'
    AND ts.search_vector @@ plainto_tsquery(p_query)
  
  ORDER BY relevance DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Get blog posts with comments count
-- ============================================================================
CREATE OR REPLACE FUNCTION get_blog_posts(p_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  slug VARCHAR,
  excerpt TEXT,
  featured_image TEXT,
  category VARCHAR,
  author_name VARCHAR,
  published_at TIMESTAMP WITH TIME ZONE,
  views INTEGER,
  likes INTEGER,
  comment_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.title,
    b.slug,
    b.excerpt,
    b.featured_image,
    b.category,
    u.full_name,
    b.published_at,
    b.views,
    b.likes,
    COUNT(c.id)::INTEGER
  FROM public.info_blogs b
  LEFT JOIN public.info_users u ON b.created_by = u.id
  LEFT JOIN public.info_comments c ON b.id = c.blog_id AND c.status = 'approved'
  WHERE b.status = 'published'
  GROUP BY b.id, u.full_name
  ORDER BY b.published_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Generate password reset token
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_password_reset_token(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_token VARCHAR;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_reset_id UUID;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := NOW() + INTERVAL '1 hour';
  
  INSERT INTO public.info_password_resets (user_id, token, email, expires_at)
  SELECT p_user_id, v_token, email, v_expires_at
  FROM public.info_users
  WHERE id = p_user_id
  RETURNING id INTO v_reset_id;
  
  RETURN v_reset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Verify and use password reset token
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_and_use_reset_token(p_token VARCHAR)
RETURNS TABLE (
  valid BOOLEAN,
  user_id UUID,
  email VARCHAR
) AS $$
DECLARE
  v_reset RECORD;
BEGIN
  SELECT * INTO v_reset
  FROM public.info_password_resets
  WHERE token = p_token
    AND used = false
    AND expires_at > NOW();
  
  IF v_reset IS NOT NULL THEN
    UPDATE public.info_password_resets
    SET used = true, used_at = NOW()
    WHERE id = v_reset.id;
    
    RETURN QUERY SELECT true, v_reset.user_id, v_reset.email;
  ELSE
    RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Get user statistics
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_statistics()
RETURNS TABLE (
  total_users INTEGER,
  total_tourists INTEGER,
  total_businesses INTEGER,
  total_admins INTEGER,
  active_users INTEGER,
  banned_users INTEGER,
  online_users INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.info_users)::INTEGER,
    (SELECT COUNT(*) FROM public.info_users WHERE user_type = 'tourist')::INTEGER,
    (SELECT COUNT(*) FROM public.info_users WHERE user_type = 'business')::INTEGER,
    (SELECT COUNT(*) FROM public.info_users WHERE user_type = 'admin')::INTEGER,
    (SELECT COUNT(*) FROM public.info_users WHERE status = 'active')::INTEGER,
    (SELECT COUNT(*) FROM public.info_users WHERE status = 'banned')::INTEGER,
    (SELECT COUNT(*) FROM public.info_users WHERE is_online = true)::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Get content statistics
-- ============================================================================
CREATE OR REPLACE FUNCTION get_content_statistics()
RETURNS TABLE (
  total_amenities INTEGER,
  active_amenities INTEGER,
  total_events INTEGER,
  published_events INTEGER,
  total_blogs INTEGER,
  published_blogs INTEGER,
  total_tourist_spots INTEGER,
  total_announcements INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.info_amenities)::INTEGER,
    (SELECT COUNT(*) FROM public.info_amenities WHERE status = 'active')::INTEGER,
    (SELECT COUNT(*) FROM public.info_events)::INTEGER,
    (SELECT COUNT(*) FROM public.info_events WHERE status = 'published')::INTEGER,
    (SELECT COUNT(*) FROM public.info_blogs)::INTEGER,
    (SELECT COUNT(*) FROM public.info_blogs WHERE status = 'published')::INTEGER,
    (SELECT COUNT(*) FROM public.info_tourist_spots)::INTEGER,
    (SELECT COUNT(*) FROM public.info_announcements)::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Log audit action
-- ============================================================================
CREATE OR REPLACE FUNCTION log_audit_action(
  p_user_id UUID,
  p_action VARCHAR,
  p_table_name VARCHAR,
  p_record_id UUID,
  p_changes JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO public.info_audit_log (user_id, action, table_name, record_id, changes, ip_address)
  VALUES (p_user_id, p_action, p_table_name, p_record_id, p_changes, p_ip_address)
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Bulk deactivate expired announcements
-- ============================================================================
CREATE OR REPLACE FUNCTION deactivate_expired_announcements()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.info_announcements
  SET status = 'archived'
  WHERE status = 'published'
    AND expires_at IS NOT NULL
    AND expires_at <= NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- Function: Cleanup expired password reset tokens
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.info_password_resets
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- GRANT PERMISSIONS FOR FUNCTIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION get_amenities_by_category TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_featured_amenities TO public, anon, authenticated;
-- get_nearby_amenities commented out (requires PostGIS)
GRANT EXECUTE ON FUNCTION get_upcoming_events TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_content TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_blog_posts TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_statistics TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_content_statistics TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_admin TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION is_moderator TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_password_reset_token TO public;
GRANT EXECUTE ON FUNCTION verify_and_use_reset_token TO public;
GRANT EXECUTE ON FUNCTION log_audit_action TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION deactivate_expired_announcements TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_reset_tokens TO service_role;
