BEGIN;

-- ============================================================
-- Sample admin and user accounts
-- ============================================================

INSERT INTO public.info_users (
  id, email, password, full_name, user_type, status, profile_image_url,
  phone_number, bio, address, city, country, points, last_login,
  is_online, email_verified, created_at, updated_at
) VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'admin@daet.local',
    '$2a$10$U7R64WEQbN3u9S2zYwJ6zO4szxZ2KXj6N72jASL3CJv2UjYyOQk0K',
    'System Administrator',
    'admin',
    'active',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    '+639171000001',
    'Platform administrator managing destination operations and content moderation.',
    '1 Central Plaza',
    'Quezon City',
    'Philippines',
    2500,
    NOW(),
    TRUE,
    TRUE,
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '180 days'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'moderator@daet.local',
    '$2a$10$U7R64WEQbN3u9S2zYwJ6zO4szxZ2KXj6N72jASL3CJv2UjYyOQk0K',
    'Community Moderator',
    'moderator',
    'active',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    '+639171000002',
    'Responsible for community quality and visitor support.',
    '5 Bayfront Street',
    'Davao City',
    'Philippines',
    1950,
    NOW() - INTERVAL '2 days',
    TRUE,
    TRUE,
    NOW() - INTERVAL '120 days',
    NOW() - INTERVAL '120 days'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'juan.delacruz@example.com',
    'pass12345',
    'Juan Dela Cruz',
    'tourist',
    'active',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
    '+639171000003',
    'Travel enthusiast exploring heritage sites and local food spots.',
    '14 Mabini Street',
    'Manila',
    'Philippines',
    480,
    NOW() - INTERVAL '1 day',
    TRUE,
    TRUE,
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'maria.santos@example.com',
    'pass12345',
    'Maria Santos',
    'tourist',
    'active',
    'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=400&q=80',
    '+639171000004',
    'Enjoys beach trips, eco-tourism, and cultural experiences.',
    '24 Luna Avenue',
    'Cebu',
    'Philippines',
    620,
    NOW() - INTERVAL '3 hours',
    FALSE,
    TRUE,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'francis.torres@example.com',
    'pass12345',
    'Francis Torres',
    'business',
    'active',
    'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=400&q=80',
    '+639171000005',
    'Boutique owner promoting local tours and community events.',
    '88 Seaside Road',
    'Bohol',
    'Philippines',
    890,
    NOW() - INTERVAL '6 hours',
    TRUE,
    TRUE,
    NOW() - INTERVAL '26 days',
    NOW() - INTERVAL '26 days'
  );

INSERT INTO public.profiles (
  id, user_id, full_name, profile_image_url, bio, city, country, address, is_public, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  id,
  full_name,
  profile_image_url,
  bio,
  city,
  country,
  address,
  true,
  created_at,
  updated_at
FROM public.info_users;

INSERT INTO public.system_categories (id, name, icon_emoji, sort_order, is_active, created_at, updated_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'Nature', '🌿', 1, true, NOW(), NOW()),
  ('a2222222-2222-4222-8222-222222222222', 'Adventure', '🧭', 2, true, NOW(), NOW()),
  ('a3333333-3333-4333-8333-333333333333', 'Culture', '🏛️', 3, true, NOW(), NOW()),
  ('a4444444-4444-4444-8444-444444444444', 'Food', '🍲', 4, true, NOW(), NOW()),
  ('a5555555-5555-4555-8555-555555555555', 'Events', '🎉', 5, true, NOW(), NOW());

INSERT INTO public.user_feed_preferences (id, user_id, preferred_categories, enabled, created_at, updated_at)
VALUES
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', ARRAY['Nature','Adventure','Food'], true, NOW(), NOW()),
  (gen_random_uuid(), '44444444-4444-4444-8444-444444444444', ARRAY['Culture','Events','Nature'], true, NOW(), NOW()),
  (gen_random_uuid(), '55555555-5555-4555-8555-555555555555', ARRAY['Events','Food','Adventure'], true, NOW(), NOW());

INSERT INTO public.user_activity_log (id, user_id, activity_type, entity_type, entity_id, description, metadata, created_at)
VALUES
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', 'login', 'auth', NULL, 'User logged in successfully', '{"ip":"203.0.113.10"}', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), '44444444-4444-4444-8444-444444444444', 'profile_update', 'profile', NULL, 'Updated profile details', '{"section":"account"}', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), '55555555-5555-4555-8555-555555555555', 'favorite', 'spot', NULL, 'Saved a tourist spot', '{"type":"spot"}', NOW() - INTERVAL '2 days');

INSERT INTO public.user_points (id, user_id, points, reason, source, created_at)
VALUES
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', 120, 'Completed a local heritage trail', 'travel', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '44444444-4444-4444-8444-444444444444', 200, 'Reviewed 3 tourist spots', 'review', NOW() - INTERVAL '8 days'),
  (gen_random_uuid(), '55555555-5555-4555-8555-555555555555', 150, 'Joined community forum', 'community', NOW() - INTERVAL '7 days');

INSERT INTO public.user_badges (id, user_id, badge_name, badge_icon, description, earned_at)
VALUES
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', 'Explorer', '🏝️', 'Visited 5 destinations', NOW() - INTERVAL '10 days'),
  (gen_random_uuid(), '44444444-4444-4444-8444-444444444444', 'Culture Hunter', '🎭', 'Explored heritage trails', NOW() - INTERVAL '16 days'),
  (gen_random_uuid(), '55555555-5555-4555-8555-555555555555', 'Local Insider', '🍜', 'Shared community favorites', NOW() - INTERVAL '9 days');

INSERT INTO public.reward_history (id, user_id, subsystem_source, points_earned, description, created_at)
VALUES
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', 'travel', 120, 'Completed a local heritage trail', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '44444444-4444-4444-8444-444444444444', 'review', 200, 'Reviewed 3 tourist spots', NOW() - INTERVAL '8 days'),
  (gen_random_uuid(), '55555555-5555-4555-8555-555555555555', 'community', 150, 'Joined community forum', NOW() - INTERVAL '7 days');

-- ============================================================
-- Content seed data
-- ============================================================

INSERT INTO public.info_amenities (
  id, name, type, description, location, address, latitude, longitude,
  contact_number, email, website, opening_hours, price_range, amenities, images,
  featured_image, rating, review_count, status, featured, created_by, created_at, updated_at
) VALUES
  (
    'b1111111-1111-4111-8111-111111111111',
    'Sunset Beach Lounge',
    'resort',
    'A scenic beachfront dining and relaxation area perfect for sunset views and group gatherings.',
    'Bohol',
    'Cruz Road, Panglao Island',
    9.5724,
    123.7421,
    '+639171000010',
    'hello@sunsetlounge.ph',
    'https://sunsetlounge.example',
    '8:00 AM - 10:00 PM',
    '₱1,000 - ₱3,000',
    ARRAY['Parking','WiFi','Restrooms','Beach Access'],
    ARRAY['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80'],
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
    4.8,
    210,
    'active',
    TRUE,
    '55555555-5555-4555-8555-555555555555',
    NOW() - INTERVAL '21 days',
    NOW() - INTERVAL '21 days'
  ),
  (
    'b2222222-2222-4222-8222-222222222222',
    'Heritage Cafe',
    'cafe',
    'A cozy cafe serving local flavors and artisan coffee in a heritage-inspired setting.',
    'Cebu',
    'Mango Avenue, Cebu City',
    10.3157,
    123.8854,
    '+639171000011',
    'cafe@heritage.ph',
    'https://heritagecafe.example',
    '7:00 AM - 9:00 PM',
    '₱200 - ₱800',
    ARRAY['Coffee','Family Friendly','Free WiFi'],
    ARRAY['https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80'],
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80',
    4.7,
    132,
    'active',
    FALSE,
    '55555555-5555-4555-8555-555555555555',
    NOW() - INTERVAL '35 days',
    NOW() - INTERVAL '35 days'
  );

INSERT INTO public.info_events (
  id, title, description, location, venue, latitude, longitude, start_date, end_date,
  start_time, end_time, category, organizer, is_free, ticket_price, max_attendees,
  current_attendees, featured_image, images, videos, status, published_at, created_by, created_at, updated_at
) VALUES
  (
    'c1111111-1111-4111-8111-111111111111',
    'Bohol Island Festival',
    'A multi-day cultural celebration featuring art, music, food fairs, and local dance performances.',
    'Bohol',
    'Tagbilaran Cultural Grounds',
    9.6559,
    123.7566,
    CURRENT_DATE + INTERVAL '10 days',
    CURRENT_DATE + INTERVAL '12 days',
    '08:00:00',
    '22:00:00',
    'festival',
    'Local Tourism Office',
    FALSE,
    500.00,
    800,
    240,
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=900&q=80',
    ARRAY['https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=900&q=80'],
    ARRAY[]::TEXT[],
    'published',
    NOW(),
    '11111111-1111-4111-8111-111111111111',
    NOW() - INTERVAL '12 days',
    NOW() - INTERVAL '12 days'
  ),
  (
    'c2222222-2222-4222-8222-222222222222',
    'Sunrise Paddle Adventure',
    'Begin the day with a guided paddle through scenic mangroves and hidden coves.',
    'Cebu',
    'Mactan Bluewater',
    10.3112,
    123.9794,
    CURRENT_DATE + INTERVAL '3 days',
    CURRENT_DATE + INTERVAL '3 days',
    '05:30:00',
    '08:30:00',
    'adventure',
    'Cebu Outdoor Hub',
    TRUE,
    0.00,
    30,
    12,
    'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=900&q=80',
    ARRAY['https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=900&q=80'],
    ARRAY[]::TEXT[],
    'published',
    NOW(),
    '11111111-1111-4111-8111-111111111111',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
  );

INSERT INTO public.info_blogs (
  id, title, slug, content, excerpt, featured_image, category, tags, status, published_at, views, likes, comments_count, created_by, created_at, updated_at
) VALUES
  (
    'd1111111-1111-4111-8111-111111111111',
    'Top 5 Hidden Beaches in the Philippines',
    'top-5-hidden-beaches-in-the-philippines',
    'From quiet coves to secluded shorelines, discover the stunning beaches that reward travelers who go a little off the beaten path. This guide covers the best time to visit, local etiquette, and access tips.',
    'Explore the most beautiful hidden beach destinations and what makes each one unique.',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
    'nature',
    ARRAY['beaches','travel','hidden gems'],
    'published',
    NOW(),
    320,
    88,
    12,
    '11111111-1111-4111-8111-111111111111',
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '20 days'
  ),
  (
    'd2222222-2222-4222-8222-222222222222',
    'Why Local Food Tours Matter',
    'why-local-food-tours-matter',
    'Food tours are one of the best ways to understand a destination. They connect travelers with local stories, family recipes, and the heartbeat of a city.',
    'Find out why food tours create deeper, more memorable travel experiences.',
    'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80',
    'food',
    ARRAY['food','culture','local life'],
    'published',
    NOW() - INTERVAL '2 days',
    190,
    57,
    9,
    '11111111-1111-4111-8111-111111111111',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
  );

INSERT INTO public.info_tourist_spots (
  id, name, slug, description, category, location, latitude, longitude, entry_fee,
  opening_hours, best_visit_time, accessibility_info, featured_image, images, videos,
  rating, review_count, visit_count, status, featured, created_by, created_at, updated_at
) VALUES
  (
    'e1111111-1111-4111-8111-111111111111',
    'Mayon Volcano Viewpoint',
    'mayon-volcano-viewpoint',
    'A famous mountain viewpoint offering panoramic scenery and a dramatic lookout for sunrise photography.',
    'landmark',
    'Legazpi, Albay',
    13.2575,
    123.6858,
    0.00,
    '6:00 AM - 6:00 PM',
    'Early morning',
    'Accessible parking and paved walkways are available.',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80',
    ARRAY['https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80'],
    ARRAY[]::TEXT[],
    4.9,
    426,
    980,
    'active',
    TRUE,
    '11111111-1111-4111-8111-111111111111',
    NOW() - INTERVAL '18 days',
    NOW() - INTERVAL '18 days'
  ),
  (
    'e2222222-2222-4222-8222-222222222222',
    'Calle Crisologo',
    'calle-crisologo',
    'A historic street lined with heritage houses, souvenir shops, and centuries-old architecture.',
    'heritage',
    'Vigan, Ilocos Sur',
    17.5708,
    120.3867,
    0.00,
    '9:00 AM - 9:00 PM',
    'Late afternoon',
    'Mostly flat walking paths with shaded sidewalks.',
    'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=900&q=80',
    ARRAY['https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=900&q=80'],
    ARRAY[]::TEXT[],
    4.8,
    318,
    750,
    'active',
    TRUE,
    '11111111-1111-4111-8111-111111111111',
    NOW() - INTERVAL '44 days',
    NOW() - INTERVAL '44 days'
  );

INSERT INTO public.info_announcements (
  id, title, content, announcement_type, audience, priority, image_url, status, published_at, expires_at, created_by, created_at, updated_at
) VALUES
  (
    'f1111111-1111-4111-8111-111111111111',
    'New Heritage Trail Campaign',
    'The tourism office launched a heritage trail program across selected sites with guided cultural tours and community storytelling.',
    'important',
    'all',
    2,
    'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=900&q=80',
    'published',
    NOW(),
    NOW() + INTERVAL '60 days',
    '11111111-1111-4111-8111-111111111111',
    NOW() - INTERVAL '9 days',
    NOW() - INTERVAL '9 days'
  ),
  (
    'f2222222-2222-4222-8222-222222222222',
    'Weekend Beach Safety Notice',
    'Visitors are advised to follow designated swim areas and check local updates before heading to open water locations.',
    'info',
    'tourists',
    1,
    NULL,
    'published',
    NOW(),
    NOW() + INTERVAL '14 days',
    '11111111-1111-4111-8111-111111111111',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  );

INSERT INTO public.info_comments (
  id, blog_id, user_id, content, status, likes, created_at, updated_at
) VALUES
  (
    gen_random_uuid(),
    'd1111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'This guide helped me plan a very memorable weekend trip.',
    'approved',
    8,
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '4 days'
  ),
  (
    gen_random_uuid(),
    'd2222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'I love how it showcases local stories behind each dish.',
    'approved',
    5,
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '6 days'
  );

INSERT INTO public.info_feedback (
  id, user_id, title, message, category, rating, status, created_at, updated_at
) VALUES
  (
    gen_random_uuid(),
    '33333333-3333-4333-8333-333333333333',
    'Great mobile experience',
    'The app feels easy to use for trip planning.',
    'general',
    5,
    'resolved',
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '10 days'
  );

INSERT INTO public.info_inquiries (
  id, user_id, title, message, category, status, created_at, updated_at
) VALUES
  (
    gen_random_uuid(),
    '44444444-4444-4444-8444-444444444444',
    'Request for event information',
    'Could you share more details about the upcoming weekend festival itinerary?',
    'event',
    'open',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  );

INSERT INTO public.info_notifications (
  id, user_id, title, message, type, is_read, created_at, updated_at
) VALUES
  (
    gen_random_uuid(),
    '33333333-3333-4333-8333-333333333333',
    'Event reminder',
    'Your festival registration for tonight is confirmed.',
    'event',
    FALSE,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day'
  ),
  (
    gen_random_uuid(),
    '44444444-4444-4444-8444-444444444444',
    'Profile update',
    'Your profile was updated successfully.',
    'info',
    TRUE,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days'
  );

INSERT INTO public.info_user_posts (
  id, user_id, title, content, status, created_at, updated_at
) VALUES
  (
    gen_random_uuid(),
    '33333333-3333-4333-8333-333333333333',
    'Weekend itinerary idea',
    'I am building a two-day itinerary around heritage sites, beach stops, and café hopping.',
    'published',
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '4 days'
  );

INSERT INTO public.info_moderation (
  id, report_type, reason, description, severity, reported_by, reported_user_id, reported_item_id, reported_item_table, status, assigned_to, moderation_notes, resolution, created_at, updated_at, resolved_at
) VALUES
  (
    gen_random_uuid(),
    'content',
    'Spam',
    'Duplicate promotional content detected in a tourism community post.',
    'medium',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    NULL,
    'forum_threads',
    'reviewing',
    '22222222-2222-4222-8222-222222222222',
    'Investigating duplicate report and reviewing content history.',
    NULL,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days',
    NULL
  );

INSERT INTO public.forum_categories (id, name, description, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Travel Tips', 'Helpful advice for destinations, booking, and local insights.', NOW(), NOW()),
  (gen_random_uuid(), 'Food & Dining', 'Recommendations and reviews of local food experiences.', NOW(), NOW()),
  (gen_random_uuid(), 'Events', 'Updates and discussion about upcoming festivals and cultural activities.', NOW(), NOW());

INSERT INTO public.forum_threads (
  id, title, content, category_id, created_by, status, reply_count, last_activity_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'Best sunrise spots in Cebu',
  'I am looking for the best sunrise spots around Cebu that are easy to reach for a morning quick trip. Any recommendations?',
  fc.id,
  '33333333-3333-4333-8333-333333333333',
  'published',
  1,
  NOW(),
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '7 days'
FROM public.forum_categories fc
WHERE fc.name = 'Travel Tips'
LIMIT 1;

INSERT INTO public.forum_threads (
  id, title, content, category_id, created_by, status, reply_count, last_activity_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'Favorite local dishes to try in Bohol',
  'Share your favorite local dishes and where to find them when traveling in Bohol.',
  fc.id,
  '44444444-4444-4444-8444-444444444444',
  'published',
  1,
  NOW(),
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '5 days'
FROM public.forum_categories fc
WHERE fc.name = 'Food & Dining'
LIMIT 1;

INSERT INTO public.forum_replies (id, thread_id, user_id, content, status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  ft.id,
  '44444444-4444-4444-8444-444444444444',
  'Try the coastal viewpoints near Mactan at sunrise. The sight is stunning and very worth it.',
  'active',
  NOW() - INTERVAL '6 days',
  NOW() - INTERVAL '6 days'
FROM public.forum_threads ft
WHERE ft.title = 'Best sunrise spots in Cebu'
LIMIT 1;

INSERT INTO public.forum_replies (id, thread_id, user_id, content, status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  ft.id,
  '33333333-3333-4333-8333-333333333333',
  'The grilled seafood and local coconut desserts in Panglao are highly recommended.',
  'active',
  NOW() - INTERVAL '4 days',
  NOW() - INTERVAL '4 days'
FROM public.forum_threads ft
WHERE ft.title = 'Favorite local dishes to try in Bohol'
LIMIT 1;

INSERT INTO public.user_favorites (id, user_id, item_type, item_id, created_at)
VALUES
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', 'spot', 'e1111111-1111-4111-8111-111111111111', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '44444444-4444-4444-8444-444444444444', 'event', 'c1111111-1111-4111-8111-111111111111', NOW() - INTERVAL '5 days');

INSERT INTO public.follows (id, follower_id, following_id, created_at)
VALUES
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', NOW() - INTERVAL '10 days');

INSERT INTO public.user_follows (id, follower_id, following_id, created_at)
VALUES
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), '55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', NOW() - INTERVAL '9 days');

INSERT INTO public.info_audit_log (id, user_id, action, table_name, record_id, changes, ip_address, user_agent, created_at)
VALUES
  (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'create', 'info_events', 'c1111111-1111-4111-8111-111111111111', '{"status":"published"}', '203.0.113.55', 'Mozilla/5.0', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', 'login', 'info_users', '33333333-3333-4333-8333-333333333333', '{"last_login":"now"}', '203.0.113.10', 'Mozilla/5.0', NOW() - INTERVAL '1 day');

COMMIT;
