-- ============================================================================
-- Connect-DAET Application - Sample Data for Testing
-- ============================================================================

-- ============================================================================
-- SAMPLE USERS
-- ============================================================================

-- Admin User
INSERT INTO public.info_users (
  email, password, full_name, phone_number, user_type, status, bio, city, country
) VALUES (
  'admin@daet-tourism.com',
  'Admin@123456',
  'Daet Tourism Administrator',
  '+63-915-123-4567',
  'admin',
  'active',
  'Official Daet Tourism Office Administrator',
  'Daet',
  'Philippines'
) ON CONFLICT (email) DO NOTHING;

-- Moderator User
INSERT INTO public.info_users (
  email, password, full_name, phone_number, user_type, status, bio, city, country
) VALUES (
  'moderator@daet-tourism.com',
  'Mod@123456',
  'John Moderator',
  '+63-915-234-5678',
  'moderator',
  'active',
  'Content Moderator for Daet Tourism',
  'Daet',
  'Philippines'
) ON CONFLICT (email) DO NOTHING;

-- Sample Business User
INSERT INTO public.info_users (
  email, password, full_name, phone_number, user_type, status, bio, city, country
) VALUES (
  'business@bagasbas.com',
  'Business@123456',
  'Bagasbas Beach Resort',
  '+63-915-345-6789',
  'business',
  'active',
  'Beach resort operator',
  'Daet',
  'Philippines'
) ON CONFLICT (email) DO NOTHING;

-- Sample Tourist Users
INSERT INTO public.info_users (
  email, password, full_name, user_type, status, city, country
) VALUES
  ('tourist1@example.com', 'Tourist@123', 'Maria Santos', 'tourist', 'active', 'Manila', 'Philippines'),
  ('tourist2@example.com', 'Tourist@123', 'Juan Dela Cruz', 'tourist', 'active', 'Cebu', 'Philippines'),
  ('tourist3@example.com', 'Tourist@123', 'Anna Garcia', 'tourist', 'active', 'Makati', 'Philippines')
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- SAMPLE AMENITIES
-- ============================================================================

-- Get admin user ID for created_by
DO $do$ 
DECLARE
  admin_id UUID;
  business_id UUID;
BEGIN
  admin_id := (SELECT id FROM info_users WHERE email = 'admin@daet-tourism.com');
  business_id := (SELECT id FROM info_users WHERE email = 'business@bagasbas.com');

  -- Accommodations
  INSERT INTO public.info_amenities (
    name, type, location, latitude, longitude, contact_number, website, 
    email, opening_hours, price_range, amenities, featured_image, 
    featured, rating, review_count, status, created_by
  ) VALUES 
  (
    'Bagasbas Beach Resort', 'accommodation', 'Bagasbas, Daet', 14.1067, 122.5631,
    '+63-54-721-2345', 'www.bagasbas.com', 'info@bagasbas.com', '24/7',
    '$$$', ARRAY['wifi', 'parking', 'aircon', 'pool', 'restaurant'],
    'https://via.placeholder.com/400x300?text=Bagasbas+Beach+Resort',
    true, 4.8, 245, 'active', business_id
  ),
  (
    'Calaguas Island Resort', 'accommodation', 'Calaguas, Daet', 14.1500, 122.4900,
    '+63-54-721-3456', 'www.calaguas-resort.com', 'info@calaguas.com', '24/7',
    '$$', ARRAY['wifi', 'parking', 'aircon', 'beach_access'],
    'https://via.placeholder.com/400x300?text=Calaguas+Resort',
    true, 4.6, 189, 'active', admin_id
  ),
  (
    'Daet Plaza Hotel', 'accommodation', 'Rizal Ave, Daet', 14.1145, 122.5689,
    '+63-54-721-4567', 'www.daet-plaza.com', 'info@daet-plaza.com', '24/7',
    '$$', ARRAY['wifi', 'parking', 'aircon', 'restaurant'],
    'https://via.placeholder.com/400x300?text=Daet+Plaza+Hotel',
    false, 4.4, 156, 'active', admin_id
  )
  ON CONFLICT DO NOTHING;

  -- Restaurants
  INSERT INTO public.info_amenities (
    name, type, location, contact_number, email, opening_hours, 
    price_range, amenities, featured_image, featured, 
    rating, review_count, status, created_by
  ) VALUES
  (
    'The Singing Sands Bistro', 'restaurant', 'Bagasbas Beach Road, Daet',
    '+63-915-456-7890', 'info@singingbistro.com', '10:00 AM - 10:00 PM',
    '$$', ARRAY['wifi', 'aircon', 'outdoor_seating', 'reservations', 'delivery'],
    'https://via.placeholder.com/400x300?text=Singing+Sands+Bistro',
    true, 4.7, 312, 'active', admin_id
  ),
  (
    'Kainan sa Dalampasigan', 'restaurant', 'Bagasbas Beach, Daet',
    '+63-915-567-8901', 'info@kainan.com', '11:00 AM - 9:00 PM',
    '$', ARRAY['outdoor_seating', 'takeout', 'beach_view'],
    'https://via.placeholder.com/400x300?text=Kainan+Beach',
    false, 4.5, 198, 'active', admin_id
  ),
  (
    'Daet Garden Cafe', 'restaurant', 'Quezon Ave, Daet',
    '+63-915-678-9012', 'info@gardencafe.com', '8:00 AM - 6:00 PM',
    '$$', ARRAY['wifi', 'aircon', 'parking'],
    'https://via.placeholder.com/400x300?text=Daet+Garden+Cafe',
    false, 4.3, 87, 'active', admin_id
  )
  ON CONFLICT DO NOTHING;

  -- Transport Services
  INSERT INTO public.info_amenities (
    name, type, location, contact_number, email, 
    opening_hours, amenities, featured_image, 
    rating, review_count, status, created_by
  ) VALUES
  (
    'Calaguas Ferry Service', 'transport', 'Port Area, Daet',
    '+63-915-789-0123', 'info@ferry.com', '6:00 AM - 5:00 PM',
    ARRAY['parking', 'lifejackets', 'comfortable_seats'],
    'https://via.placeholder.com/400x300?text=Ferry+Service',
    4.6, 156, 'active', admin_id
  ),
  (
    'Daet Taxi Service', 'transport', 'Daet City',
    '+63-915-890-1234', 'info@daettaxi.com', '24/7',
    ARRAY['aircon', 'wifi', 'professional_drivers'],
    'https://via.placeholder.com/400x300?text=Taxi+Service',
    4.4, 98, 'active', admin_id
  )
  ON CONFLICT DO NOTHING;

END $do$;

-- ============================================================================
-- SAMPLE EVENTS
-- ============================================================================

DO $do$
DECLARE
  admin_id UUID;
BEGIN
  admin_id := (SELECT id FROM info_users WHERE email = 'admin@daet-tourism.com');

  INSERT INTO public.info_events (
    title, description, location, latitude, longitude, venue, 
    start_date, end_date, start_time, end_time, category, organizer,
    is_free, ticket_price, max_attendees, featured_image,
    status, published_at, created_by
  ) VALUES
  (
    'Daet Tourism Festival 2025',
    'Annual celebration of Daet tourism featuring local culture, food, and entertainment',
    'Bagasbas Beach', 14.1067, 122.5631, 'Bagasbas Beach Main Area',
    '2025-02-14', '2025-02-16', '08:00', '22:00',
    'festival', 'Daet Tourism Office',
    false, 500, 5000,
    'https://via.placeholder.com/800x600?text=Tourism+Festival',
    'published', NOW(), admin_id
  ),
  (
    'Calaguas Island Tour',
    'Guided tour to pristine Calaguas Island with snorkeling and beach activities',
    'Calaguas Island', 14.1500, 122.4900, 'Calaguas Beach',
    '2025-02-20', '2025-02-20', '06:00', '16:00',
    'other', 'Calaguas Tour Operators',
    true, NULL, 100,
    'https://via.placeholder.com/800x600?text=Calaguas+Tour',
    'published', NOW(), admin_id
  ),
  (
    'Cultural Night: Biag ng Daet',
    'Showcase of Daet''s rich cultural heritage and history',
    'Daet Convention Center', 14.1145, 122.5689, 'Daet Convention Center',
    '2025-03-01', '2025-03-01', '19:00', '22:00',
    'cultural', 'Cultural Association of Daet',
    false, 200, 500,
    'https://via.placeholder.com/800x600?text=Cultural+Night',
    'published', NOW(), admin_id
  ),
  (
    'Cooking Workshop: Camarines Cuisine',
    'Learn to cook traditional Camarines dishes from local chefs',
    'Daet Community Center', 14.1145, 122.5689, 'Community Kitchen',
    '2025-02-22', '2025-02-22', '10:00', '14:00',
    'workshop', 'Daet Food Culture Group',
    false, 1000, 30,
    'https://via.placeholder.com/800x600?text=Cooking+Workshop',
    'published', NOW(), admin_id
  ),
  (
    'Bagasbas Beach Volleyball Tournament',
    'Community sports event featuring beach volleyball competitions',
    'Bagasbas Beach', 14.1067, 122.5631, 'Bagasbas Beach Sports Area',
    '2025-03-08', '2025-03-08', '08:00', '17:00',
    'sports', 'Daet Sports Commission',
    true, NULL, 200,
    'https://via.placeholder.com/800x600?text=Volleyball',
    'published', NOW(), admin_id
  )
  ON CONFLICT DO NOTHING;

END $do$;

-- ============================================================================
-- SAMPLE BLOGS
-- ============================================================================

DO $do$
DECLARE
  admin_id UUID;
BEGIN
  admin_id := (SELECT id FROM info_users WHERE email = 'admin@daet-tourism.com');

  INSERT INTO public.info_blogs (
    title, slug, content, excerpt, featured_image, category,
    tags, status, published_at, views, likes, created_by
  ) VALUES
  (
    'Top 5 Beaches to Visit in Daet',
    'top-5-beaches-daet',
    '<h1>Top 5 Beaches to Visit in Daet</h1><p>Daet is home to some of the most pristine beaches in Camarines Norte. Here are the top 5 you should visit...</p>',
    'Discover the most beautiful beaches in Daet, Philippines. From pristine white sand to crystal clear waters.',
    'https://via.placeholder.com/800x400?text=Daet+Beaches',
    'travel_tips',
    ARRAY['beaches', 'daet', 'philippines', 'travel'],
    'published', NOW() - INTERVAL '7 days', 1250, 340, admin_id
  ),
  (
    'Hidden Gems: Secret Spots in Calaguas',
    'hidden-gems-calaguas',
    '<h1>Hidden Gems in Calaguas</h1><p>Beyond the main beaches, Calaguas Island has secret spots that only locals know about...</p>',
    'Explore the lesser-known attractions and hidden spots in Calaguas Island.',
    'https://via.placeholder.com/800x400?text=Calaguas+Hidden+Gems',
    'travel_tips',
    ARRAY['calaguas', 'adventure', 'hidden', 'exploration'],
    'published', NOW() - INTERVAL '14 days', 890, 210, admin_id
  ),
  (
    'Daet Tourism Festival 2025 Announcement',
    'daet-festival-2025',
    '<h1>Mark Your Calendars!</h1><p>The Annual Daet Tourism Festival is coming February 14-16, 2025...</p>',
    'Join us for the most exciting tourism event of the year in Daet!',
    'https://via.placeholder.com/800x400?text=Festival+2025',
    'announcement',
    ARRAY['event', 'festival', 'daet', '2025'],
    'published', NOW() - INTERVAL '3 days', 2100, 580, admin_id
  ),
  (
    'Local Delicacies: Must-Try Foods of Daet',
    'must-try-foods-daet',
    '<h1>Culinary Journey Through Daet</h1><p>Daet is not just about beautiful beaches; it has a rich culinary heritage...</p>',
    'Discover the delicious and unique foods you must try when visiting Daet.',
    'https://via.placeholder.com/800x400?text=Daet+Food',
    'food',
    ARRAY['food', 'cuisine', 'local', 'daet'],
    'published', NOW() - INTERVAL '21 days', 1650, 420, admin_id
  ),
  (
    'Daet Culture and Heritage Guide',
    'daet-culture-heritage',
    '<h1>Understanding Daet''s Rich Culture</h1><p>Daet has a fascinating history and vibrant cultural traditions...</p>',
    'Learn about the history, traditions, and cultural heritage of Daet.',
    'https://via.placeholder.com/800x400?text=Daet+Culture',
    'culture',
    ARRAY['culture', 'heritage', 'history', 'traditions'],
    'published', NOW() - INTERVAL '30 days', 920, 240, admin_id
  )
  ON CONFLICT (slug) DO NOTHING;

END $do$;

-- ============================================================================
-- SAMPLE ANNOUNCEMENTS
-- ============================================================================

DO $do$
DECLARE
  admin_id UUID;
BEGIN
  admin_id := (SELECT id FROM info_users WHERE email = 'admin@daet-tourism.com');

  INSERT INTO public.info_announcements (
    title, content, announcement_type, target_audience, priority,
    featured_image, status, published_at, expires_at, created_by
  ) VALUES
  (
    'Beach Safety Alert: Strong Currents',
    'Bagasbas and Mercedes beaches have strong currents today. Please be cautious when swimming.',
    'urgent',
    'all',
    10,
    'https://via.placeholder.com/400x300?text=Beach+Alert',
    'published',
    NOW(),
    NOW() + INTERVAL '1 day',
    admin_id
  ),
  (
    'Daet Tourism Office Extended Hours',
    'Due to the upcoming festival, our office will be open from 7 AM to 8 PM daily until February 28.',
    'important',
    'tourists',
    8,
    NULL,
    'published',
    NOW(),
    '2025-02-28',
    admin_id
  ),
  (
    'New Eco-Park Facility Opening Soon',
    'We are excited to announce the opening of the new Mangrove Eco-Park facility next month!',
    'info',
    'all',
    5,
    NULL,
    'published',
    NOW(),
    NOW() + INTERVAL '30 days',
    admin_id
  ),
  (
    'Vaccination Clinic at Daet Health Center',
    'Free vaccination clinic this Saturday from 9 AM to 12 PM.',
    'info',
    'all',
    3,
    NULL,
    'published',
    NOW(),
    NOW() + INTERVAL '3 days',
    admin_id
  )
  ON CONFLICT DO NOTHING;

END $do$;

-- ============================================================================
-- SAMPLE TOURIST SPOTS
-- ============================================================================

DO $do$
DECLARE
  admin_id UUID;
BEGIN
  admin_id := (SELECT id FROM info_users WHERE email = 'admin@daet-tourism.com');

  INSERT INTO public.info_tourist_spots (
    name, description, category, location, latitude, longitude,
    entry_fee, opening_hours, best_visit_time, accessibility_info,
    featured_image, featured, rating, review_count, visit_count,
    status, created_by
  ) VALUES
  (
    'Bagasbas Beach',
    'One of the most popular and accessible beaches in Daet. Known for its pristine white sand and clear waters.',
    'beach',
    'Bagasbas, Daet',
    14.1067, 122.5631,
    0, '6:00 AM - 6:00 PM', 'March to May',
    'Accessible. Has changing rooms and comfort facilities.',
    'https://via.placeholder.com/800x600?text=Bagasbas+Beach',
    true, 4.8, 512, 15420, 'active', admin_id
  ),
  (
    'Calaguas Island',
    'A pristine island destination featuring unspoiled beaches and marine life. Popular for snorkeling and island hopping.',
    'beach',
    'Calaguas, Daet',
    14.1500, 122.4900,
    150, '6:00 AM - 5:00 PM', 'March to May',
    'Accessible via ferry. Life jackets provided.',
    'https://via.placeholder.com/800x600?text=Calaguas+Island',
    true, 4.9, 428, 12350, 'active', admin_id
  ),
  (
    'Bagasbas Lighthouse',
    'Historic lighthouse with panoramic views of the coastline and nearby islands.',
    'historical',
    'Bagasbas Point, Daet',
    14.1120, 122.5700,
    50, '8:00 AM - 5:00 PM', 'Year-round',
    'Stairs to climb. Good for sunset viewing.',
    'https://via.placeholder.com/800x600?text=Bagasbas+Lighthouse',
    false, 4.6, 287, 8920, 'active', admin_id
  ),
  (
    'Mangrove Eco-Park',
    'Protected mangrove forest ideal for eco-tourism, bird watching, and understanding coastal ecosystems.',
    'park',
    'Mangrove Area, Daet',
    14.1200, 122.5500,
    100, '7:00 AM - 5:00 PM', 'Year-round',
    'Wheelchair accessible paths available.',
    'https://via.placeholder.com/800x600?text=Mangrove+Park',
    true, 4.5, 198, 5670, 'active', admin_id
  ),
  (
    'Museo de Daet',
    'Museum showcasing Daet''s history, culture, and artifacts. Houses exhibits of pre-colonial and colonial era items.',
    'cultural',
    'Downtown Daet',
    14.1145, 122.5689,
    100, '9:00 AM - 5:00 PM', 'Year-round (Closed Mondays)',
    'Wheelchair accessible. Guide services available.',
    'https://via.placeholder.com/800x600?text=Museo+Daet',
    false, 4.4, 156, 3420, 'active', admin_id
  )
  ON CONFLICT DO NOTHING;

END $do$;

-- ============================================================================
-- SAMPLE COMMENTS (On Blogs)
-- ============================================================================

DO $do$
DECLARE
  blog_id UUID;
  tourist1_id UUID;
  tourist2_id UUID;
BEGIN
  blog_id := (SELECT id FROM info_blogs WHERE slug = 'top-5-beaches-daet' LIMIT 1);
  tourist1_id := (SELECT id FROM info_users WHERE email = 'tourist1@example.com');
  tourist2_id := (SELECT id FROM info_users WHERE email = 'tourist2@example.com');

  INSERT INTO public.info_comments (
    blog_id, user_id, content, status
  ) VALUES
  (
    blog_id, tourist1_id,
    'Great guide! I visited Bagasbas Beach last month and it was amazing. Will definitely check out the other beaches!',
    'approved'
  ),
  (
    blog_id, tourist2_id,
    'Very helpful information. Do you have recommendations for accommodation near these beaches?',
    'approved'
  )
  ON CONFLICT (id) DO NOTHING;

END $do$;

-- ============================================================================
-- SUMMARY
-- ============================================================================

/*
SAMPLE DATA CREATED:
✓ 3 Admin/Staff Users (admin, moderator, business)
✓ 3 Tourist Users
✓ 9 Amenities (3 accommodations, 3 restaurants, 2 transport services)
✓ 5 Events (festivals, tours, cultural events, workshops)
✓ 5 Blog Posts (travel tips, announcements, food, culture)
✓ 4 Announcements (urgent, important, and info)
✓ 5 Tourist Spots (beaches, landmarks, parks)
✓ 2 Blog Comments

This data provides a realistic foundation for testing:
- Search functionality
- Filtering and categorization
- User authentication
- Content display
- RLS policies
- Geographic queries
*/

-- Verify data creation
SELECT 
  'Users' as entity, COUNT(*)::TEXT as count FROM info_users
UNION ALL
SELECT 'Amenities', COUNT(*)::TEXT FROM info_amenities
UNION ALL
SELECT 'Events', COUNT(*)::TEXT FROM info_events
UNION ALL
SELECT 'Blogs', COUNT(*)::TEXT FROM info_blogs
UNION ALL
SELECT 'Announcements', COUNT(*)::TEXT FROM info_announcements
UNION ALL
SELECT 'Tourist Spots', COUNT(*)::TEXT FROM info_tourist_spots
UNION ALL
SELECT 'Comments', COUNT(*)::TEXT FROM info_comments;
