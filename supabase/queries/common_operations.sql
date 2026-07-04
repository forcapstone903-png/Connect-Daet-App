-- ============================================================================
-- Connect-DAET Application - Advanced SQL Queries & Common Operations
-- ============================================================================

-- ============================================================================
-- DASHBOARD STATISTICS QUERIES
-- ============================================================================

-- Overall System Statistics
SELECT 
  (SELECT COUNT(*) FROM info_users) as total_users,
  (SELECT COUNT(*) FROM info_amenities WHERE status = 'active') as active_amenities,
  (SELECT COUNT(*) FROM info_events WHERE status = 'published') as published_events,
  (SELECT COUNT(*) FROM info_blogs WHERE status = 'published') as published_blogs,
  (SELECT COUNT(*) FROM info_tourist_spots WHERE status = 'active') as active_spots;

-- User Statistics by Type
SELECT 
  user_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
  SUM(CASE WHEN is_online = true THEN 1 ELSE 0 END) as online,
  MAX(last_login) as last_active_user_login
FROM info_users
GROUP BY user_type
ORDER BY total DESC;

-- Amenities by Type with Average Ratings
SELECT 
  type,
  COUNT(*) as total_amenities,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
  ROUND(AVG(rating), 2) as avg_rating,
  COUNT(CASE WHEN featured = true THEN 1 END) as featured_count
FROM info_amenities
GROUP BY type
ORDER BY total_amenities DESC;

-- Events Summary
SELECT 
  category,
  COUNT(*) as total_events,
  SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  COALESCE(SUM(current_attendees), 0) as total_attendees,
  COALESCE(SUM(max_attendees), 0) as total_capacity
FROM info_events
GROUP BY category
ORDER BY total_events DESC;

-- Blog Performance
SELECT 
  category,
  COUNT(*) as total_blogs,
  ROUND(AVG(views), 0) as avg_views,
  ROUND(AVG(likes), 0) as avg_likes,
  ROUND(AVG(comments_count), 0) as avg_comments,
  MAX(published_at) as most_recent
FROM info_blogs
WHERE status = 'published'
GROUP BY category
ORDER BY total_blogs DESC;

-- ============================================================================
-- TRENDING & POPULAR CONTENT
-- ============================================================================

-- Top Rated Amenities
SELECT 
  id, name, type, location, rating, review_count,
  featured_image, opening_hours
FROM info_amenities
WHERE status = 'active'
  AND rating IS NOT NULL
ORDER BY rating DESC, review_count DESC
LIMIT 10;

-- Most Viewed Blogs
SELECT 
  id, title, slug, category, views, likes,
  published_at, featured_image, excerpt
FROM info_blogs
WHERE status = 'published'
ORDER BY views DESC
LIMIT 10;

-- Upcoming Events (Next 30 Days)
SELECT 
  id, title, category, location, start_date, end_date,
  is_free, ticket_price, current_attendees, max_attendees,
  featured_image, organizer
FROM info_events
WHERE status = 'published'
  AND start_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
ORDER BY start_date ASC;

-- Popular Tourist Spots
SELECT 
  id, name, category, location, rating, visit_count,
  entry_fee, opening_hours, featured_image
FROM info_tourist_spots
WHERE status = 'active'
ORDER BY rating DESC, visit_count DESC
LIMIT 15;

-- ============================================================================
-- GEOGRAPHIC QUERIES (Using PostGIS - OPTIONAL, requires PostGIS extension)
-- ============================================================================
-- NOTE: These queries require PostGIS extension.
-- Uncomment if PostGIS is available on your Supabase tier.
-- If not available, use full-text search instead.

-- Find All Amenities Within Radius
-- Usage: Find restaurants within 5km of Bagasbas Beach (lat: 14.1067, lon: 122.5631)
--
-- SELECT 
--   id, name, type, location,
--   earth_distance(
--     ll_to_earth(14.1067, 122.5631),
--     ll_to_earth(latitude, longitude)
--   ) / 1000 as distance_km,
--   contact_number, website, opening_hours
-- FROM info_amenities
-- WHERE status = 'active'
--   AND type = 'restaurant'
--   AND earth_distance(
--     ll_to_earth(14.1067, 122.5631),
--     ll_to_earth(latitude, longitude)
--   ) / 1000 <= 5
-- ORDER BY distance_km ASC;

-- Get All Tourist Spots in Geographic Order
--
-- SELECT 
--   id, name, category, location, latitude, longitude,
--   earth_distance(
--     ll_to_earth(14.1067, 122.5631),
--     ll_to_earth(latitude, longitude)
--   ) / 1000 as distance_from_center_km,
--   rating, visit_count
-- FROM info_tourist_spots
-- WHERE status = 'active'
-- ORDER BY distance_km ASC;

-- Find Events Near a Location
--
-- SELECT 
--   id, title, category, location, start_date,
--   earth_distance(
--     ll_to_earth(14.1067, 122.5631),
--     ll_to_earth(latitude, longitude)
--   ) / 1000 as distance_km
-- FROM info_events
-- WHERE status = 'published'
--   AND start_date >= CURRENT_DATE
-- ORDER BY distance_km ASC
-- LIMIT 10;

-- ============================================================================
-- SEARCH & FILTER QUERIES
-- ============================================================================

-- Advanced Content Search with Ranking
SELECT 
  'amenity' as content_type,
  id, name as title, description, featured_image,
  ts_rank(search_vector, plainto_tsquery('beaches')) as relevance
FROM info_amenities
WHERE search_vector @@ plainto_tsquery('beaches')
  AND status = 'active'

UNION ALL

SELECT 
  'event' as content_type,
  id, title, description, featured_image,
  ts_rank(search_vector, plainto_tsquery('beaches')) as relevance
FROM info_events
WHERE search_vector @@ plainto_tsquery('beaches')
  AND status = 'published'

UNION ALL

SELECT 
  'blog' as content_type,
  id, title, excerpt as description, featured_image,
  ts_rank(search_vector, plainto_tsquery('beaches')) as relevance
FROM info_blogs
WHERE search_vector @@ plainto_tsquery('beaches')
  AND status = 'published'

ORDER BY relevance DESC
LIMIT 50;

-- Multi-Filter Search
SELECT 
  id, name, type, location, rating, featured_image, opening_hours
FROM info_amenities
WHERE status = 'active'
  AND type = ANY(ARRAY['restaurant', 'accommodation'])
  AND (
    featured = true
    OR rating >= 4.5
  )
  AND (
    amenities @> ARRAY['wifi']
    OR price_range = '$'
  )
ORDER BY rating DESC, featured DESC;

-- ============================================================================
-- USER ANALYTICS
-- ============================================================================

-- Active Users This Week
SELECT 
  id, email, full_name, user_type,
  last_login, is_online,
  DATE_TRUNC('day', last_login) as last_activity_date
FROM info_users
WHERE status = 'active'
  AND last_login >= (NOW() - INTERVAL '7 days')
ORDER BY last_login DESC;

-- User Creation Trend (Last 30 Days)
SELECT 
  DATE_TRUNC('day', created_at)::DATE as signup_date,
  COUNT(*) as new_users,
  user_type
FROM info_users
WHERE created_at >= (NOW() - INTERVAL '30 days')
GROUP BY DATE_TRUNC('day', created_at), user_type
ORDER BY signup_date DESC;

-- Most Active Content Creators
SELECT 
  u.id, u.full_name, u.email,
  COUNT(DISTINCT a.id) as amenities_created,
  COUNT(DISTINCT e.id) as events_created,
  COUNT(DISTINCT b.id) as blogs_created,
  COUNT(DISTINCT t.id) as spots_created
FROM info_users u
LEFT JOIN info_amenities a ON u.id = a.created_by
LEFT JOIN info_events e ON u.id = e.created_by
LEFT JOIN info_blogs b ON u.id = b.created_by
LEFT JOIN info_tourist_spots t ON u.id = t.created_by
WHERE u.user_type IN ('admin', 'business')
GROUP BY u.id, u.full_name, u.email
HAVING COUNT(DISTINCT a.id) + COUNT(DISTINCT e.id) + COUNT(DISTINCT b.id) + COUNT(DISTINCT t.id) > 0
ORDER BY (COUNT(DISTINCT a.id) + COUNT(DISTINCT e.id) + COUNT(DISTINCT b.id) + COUNT(DISTINCT t.id)) DESC;

-- ============================================================================
-- MODERATION & SAFETY
-- ============================================================================

-- Pending Moderation Reports
SELECT 
  id, report_type, reason, severity,
  reported_by_user.email as reporter_email,
  reported_user.email as reported_user_email,
  created_at, status, assigned_to
FROM info_moderation m
LEFT JOIN info_users reported_by_user ON m.reported_by = reported_by_user.id
LEFT JOIN info_users reported_user ON m.reported_user_id = reported_user.id
WHERE status IN ('pending', 'reviewing')
ORDER BY severity DESC, created_at ASC;

-- High-Severity Unresolved Reports
SELECT 
  id, report_type, reason, severity,
  reported_by_user.full_name as reporter,
  reported_user.full_name as reported_user,
  EXTRACT(DAY FROM NOW() - created_at) as days_open
FROM info_moderation m
LEFT JOIN info_users reported_by_user ON m.reported_by = reported_by_user.id
LEFT JOIN info_users reported_user ON m.reported_user_id = reported_user.id
WHERE severity IN ('high', 'critical')
  AND status IN ('pending', 'reviewing')
ORDER BY created_at ASC;

-- Moderation Report Summary
SELECT 
  report_type,
  severity,
  COUNT(*) as report_count,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
  COUNT(CASE WHEN status = 'reviewing' THEN 1 END) as reviewing,
  COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
  AVG(EXTRACT(DAY FROM COALESCE(resolved_at, NOW()) - created_at)) as avg_resolution_days
FROM info_moderation
GROUP BY report_type, severity
ORDER BY report_count DESC;

-- Banned Users and Reasons
SELECT 
  u.id, u.email, u.full_name, u.status,
  COUNT(DISTINCT m.id) as reports_against_them,
  STRING_AGG(DISTINCT m.reason, ', ') as reported_reasons,
  MAX(m.created_at) as most_recent_report
FROM info_users u
LEFT JOIN info_moderation m ON u.id = m.reported_user_id
WHERE u.status = 'banned'
GROUP BY u.id, u.email, u.full_name, u.status;

-- ============================================================================
-- AUDIT & COMPLIANCE
-- ============================================================================

-- Recent Admin Actions (Last 7 Days)
SELECT 
  id, user_id, users.email as admin_email, action,
  table_name, created_at, ip_address
FROM info_audit_log
LEFT JOIN info_users users ON info_audit_log.user_id = users.id
WHERE created_at >= (NOW() - INTERVAL '7 days')
ORDER BY created_at DESC
LIMIT 100;

-- Content Deletions
SELECT 
  id, user_id, action, table_name, record_id,
  changes, created_at
FROM info_audit_log
WHERE action = 'DELETE'
ORDER BY created_at DESC
LIMIT 50;

-- User Data Exports
SELECT 
  id, email, full_name, user_type, status,
  created_at, last_login, is_online,
  profile_image_url, bio, address, city, country
FROM info_users
WHERE user_type = 'tourist'
ORDER BY created_at DESC;

-- ============================================================================
-- CONTENT MANAGEMENT
-- ============================================================================

-- Draft Content to Review
SELECT 
  'amenity' as type, id, name as title, status, created_by, created_at
FROM info_amenities
WHERE status IN ('pending', 'draft')

UNION ALL

SELECT 
  'event' as type, id, title, status, created_by, created_at
FROM info_events
WHERE status IN ('draft', 'pending')

UNION ALL

SELECT 
  'blog' as type, id, title, status, created_by, created_at
FROM info_blogs
WHERE status = 'draft'

UNION ALL

SELECT 
  'tourist_spot' as type, id, name as title, status, created_by, created_at
FROM info_tourist_spots
WHERE status = 'pending'

ORDER BY created_at ASC;

-- Content with Missing Images
SELECT 
  'amenity' as type, id, name as title, featured_image, 
  array_length(images, 1) as image_count
FROM info_amenities
WHERE featured_image IS NULL OR featured_image = ''

UNION ALL

SELECT 
  'event' as type, id, title, featured_image,
  array_length(images, 1) as image_count
FROM info_events
WHERE featured_image IS NULL OR featured_image = ''

UNION ALL

SELECT 
  'blog' as type, id, title, featured_image, NULL
FROM info_blogs
WHERE featured_image IS NULL OR featured_image = '';

-- ============================================================================
-- DATA MAINTENANCE QUERIES
-- ============================================================================

-- Find Orphaned Records (Records Referencing Deleted Users)
SELECT 'amenities' as table_name, COUNT(*) as count
FROM info_amenities
WHERE created_by NOT IN (SELECT id FROM info_users)

UNION ALL

SELECT 'events' as table_name, COUNT(*) as count
FROM info_events
WHERE created_by NOT IN (SELECT id FROM info_users)

UNION ALL

SELECT 'blogs' as table_name, COUNT(*) as count
FROM info_blogs
WHERE created_by NOT IN (SELECT id FROM info_users);

-- Duplicate Content Check
SELECT 
  name, COUNT(*) as duplicates,
  array_agg(id) as ids
FROM info_amenities
GROUP BY name
HAVING COUNT(*) > 1;

-- Expired Password Reset Tokens Count
SELECT COUNT(*) as expired_tokens
FROM info_password_resets
WHERE expires_at < NOW()
  AND used = false;

-- Comments Awaiting Moderation
SELECT 
  c.id, c.blog_id, b.title as blog_title,
  c.user_id, u.full_name, c.content,
  c.created_at
FROM info_comments c
JOIN info_blogs b ON c.blog_id = b.id
JOIN info_users u ON c.user_id = u.id
WHERE c.status = 'pending'
ORDER BY c.created_at ASC;

-- ============================================================================
-- BATCH OPERATIONS
-- ============================================================================

-- Batch Update: Publish All Approved Blogs
-- UPDATE info_blogs
-- SET status = 'published', published_at = NOW()
-- WHERE status = 'draft' AND created_at <= NOW() - INTERVAL '7 days'
-- RETURNING id, title, status;

-- Batch Update: Soft Delete Old Announcements
-- UPDATE info_announcements
-- SET status = 'archived'
-- WHERE expires_at < NOW()
--   AND status = 'published'
-- RETURNING id, title, expires_at;

-- Batch Update: Mark Inactive Users
-- UPDATE info_users
-- SET status = 'suspended'
-- WHERE last_login < NOW() - INTERVAL '180 days'
--   AND status = 'active'
--   AND user_type = 'tourist'
-- RETURNING id, email, last_login;

-- Batch Delete: Remove Test Data
-- DELETE FROM info_users
-- WHERE email LIKE '%test%' OR email LIKE '%demo%'
-- AND created_at < NOW() - INTERVAL '30 days';

-- ============================================================================
-- PERFORMANCE TUNING
-- ============================================================================

-- Analyze Table Performance
-- ANALYZE info_users;
-- ANALYZE info_amenities;
-- ANALYZE info_events;
-- ANALYZE info_blogs;

-- Vacuum Tables (Clean Up Dead Rows)
-- VACUUM ANALYZE info_users;
-- VACUUM ANALYZE info_amenities;
-- VACUUM ANALYZE info_events;
-- VACUUM ANALYZE info_blogs;

-- Check Index Usage
SELECT 
  schemaname, tablename, indexname,
  idx_scan as scans, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Find Unused Indexes
SELECT 
  schemaname, tablename, indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE 'pg_toast%'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- BACKUP HELPERS
-- ============================================================================

-- Export User Data (CSV format ready)
\copy (SELECT id, email, full_name, user_type, status, created_at, last_login FROM info_users) TO '/tmp/users_backup.csv' WITH CSV HEADER;

-- Export Amenities Data
\copy (SELECT id, name, type, location, status, created_at FROM info_amenities) TO '/tmp/amenities_backup.csv' WITH CSV HEADER;

-- Export Events Data
\copy (SELECT id, title, category, location, start_date, status, created_at FROM info_events) TO '/tmp/events_backup.csv' WITH CSV HEADER;

-- ============================================================================
-- NOTES
-- ============================================================================

/*
IMPORTANT REMINDERS:

1. Always test queries on a staging database first
2. Use EXPLAIN ANALYZE to check query performance
3. Back up data before running DELETE or UPDATE queries
4. Use transactions for multi-step operations:
   BEGIN;
   -- queries here
   ROLLBACK; -- or COMMIT;

5. Monitor slow queries in Supabase Dashboard
6. Check table sizes regularly:
   SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
   FROM pg_tables 
   WHERE schemaname = 'public';

7. Set up automated backups in Supabase Dashboard

*/
