BEGIN;

DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  SELECT id
  INTO admin_user_id
  FROM public.info_users
  WHERE user_type = 'admin'
    AND status = 'active'
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.info_tourist_spots (
    id, name, slug, description, category, location, best_visit_time,
    accessibility_info, rating, review_count, status, featured, created_by
  )
  VALUES
    (
      'da000001-2026-4da0-8e10-000000000001',
      'Bagasbas Beach',
      'bagasbas-beach-daet',
      'A well-known Daet shoreline and a popular place to try surfing. Conditions change with weather, tides, and swell, so check local advisories before swimming or booking a surf lesson.',
      'beach',
      'Bagasbas, Daet, Camarines Norte',
      'Daylight hours; check current weather, tide, and surf conditions before visiting.',
      'Public shoreline. Facilities, access, and surf services vary; confirm current conditions locally.',
      0, 0, 'active', TRUE, admin_user_id
    ),
    (
      'da000001-2026-4da0-8e10-000000000002',
      'First Rizal Monument',
      'first-rizal-monument-daet',
      'Daet is home to the First Rizal Monument, erected in 1898 in honor of national hero Jose Rizal. Visit respectfully and take time to read the monument and nearby heritage markers.',
      'history',
      'Daet town center, Daet, Camarines Norte',
      'Daylight hours are best for a self-guided heritage walk.',
      'A public outdoor landmark; ask locally about current access and nearby facilities.',
      0, 0, 'active', TRUE, admin_user_id
    ),
    (
      'da000001-2026-4da0-8e10-000000000003',
      'Daet Elevated Town Plaza',
      'daet-elevated-town-plaza',
      'A central public gathering place in Daet and a convenient starting point for exploring the town center. Check local notices for public activities, closures, or event schedules.',
      'culture',
      'Daet town center, Daet, Camarines Norte',
      'Visit during daylight or when public activities are scheduled.',
      'Public plaza; access and facilities may change during events or maintenance.',
      0, 0, 'active', TRUE, admin_user_id
    ),
    (
      'da000001-2026-4da0-8e10-000000000004',
      'St. John the Baptist Parish Church',
      'st-john-the-baptist-parish-church-daet',
      'A parish church in Daet town proper. Visitors are welcome to appreciate its community and cultural role; please observe posted visiting guidance and avoid interrupting services.',
      'culture',
      'Daet town proper, Daet, Camarines Norte',
      'Check locally for current visiting hours and service times.',
      'Access may be limited during worship services or church activities.',
      0, 0, 'active', FALSE, admin_user_id
    )
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.info_blogs (
    id, title, slug, content, excerpt, category, tags, status, published_at, created_by
  )
  VALUES
    (
      'db000001-2026-4db0-8e10-000000000001',
      'Bagasbas Beach: A First-Time Visitor''s Guide',
      'bagasbas-beach-daet-guide',
      $article$Bagasbas Beach is Daet’s best-known coastal stop and a popular place to experience the town’s surf culture. It is also a shoreline for a relaxed walk and sunset views.

Surf and sea conditions vary. Check the weather, tides, and local advisories before swimming or arranging a lesson, and follow instructions from local guides and lifeguards where available. Bring drinking water, sun protection, and a way to take your waste with you.

There is no fixed admission or operating-hours information in this guide. Confirm any current fees, rentals, facilities, and transport arrangements locally before making plans.$article$,
      'Plan a flexible visit to Bagasbas Beach, with practical reminders about surf conditions, sun protection, and checking local services.',
      'travel_guides',
      ARRAY['admin-curated', 'Bagasbas Beach', 'Daet', 'surf', 'travel guide'],
      'published',
      NOW(),
      admin_user_id
    ),
    (
      'db000001-2026-4db0-8e10-000000000002',
      'A Short Heritage Walk in Daet',
      'daet-heritage-walk-first-rizal-monument',
      $article$Start in Daet town center and make the First Rizal Monument your anchor stop. Erected in 1898 in honor of Jose Rizal, it is one of the town’s most notable historical landmarks.

Continue at an easy pace through nearby public spaces, including the Elevated Town Plaza. Keep the visit respectful: follow posted guidance, avoid blocking public paths, and check before taking photographs during ceremonies or services.

This is a self-guided overview, not a mapped route. Ask locally for current access information and other heritage markers to include.$article$,
      'A respectful, walkable introduction to Daet’s First Rizal Monument and town-center public spaces.',
      'history',
      ARRAY['admin-curated', 'Daet', 'history', 'heritage', 'Rizal'],
      'published',
      NOW(),
      admin_user_id
    ),
    (
      'db000001-2026-4db0-8e10-000000000003',
      'A Food Trip in Daet: What to Look For',
      'daet-food-trip-local-and-bicol-dishes',
      $article$Daet is a good place to look for flavors from Camarines Norte and the wider Bicol region. Ask local eateries what is freshly prepared, and remember that recipes and availability differ from one kitchen to another.

Look for pancit Bato, a noodle dish associated with Bato in Camarines Sur and enjoyed across the region; kinunot, a savory dish commonly prepared with fish, coconut milk, and greens; and other Bicol dishes that use coconut milk and chili. Seafood and pineapple products may also appear on local menus or in season.

These are regional food suggestions, not claims that every dish originated in Daet or is available every day. Ask about ingredients and spice level, especially when you have allergies or dietary restrictions.$article$,
      'A practical food-tripping guide to regional noodles, coconut-based dishes, seafood, and seasonal pineapple products around Daet.',
      'food',
      ARRAY['admin-curated', 'Daet', 'Camarines Norte', 'Bicol food', 'food trip'],
      'published',
      NOW(),
      admin_user_id
    ),
    (
      'db000001-2026-4db0-8e10-000000000004',
      'Pinyasan Festival: What Visitors Should Know',
      'pinyasan-festival-daet-visitor-guide',
      $article$Pinyasan Festival is Daet’s recurring celebration associated with the town’s pineapple identity. Festival activities and schedules can vary from year to year.

If you are planning a visit, wait for the current announcement from the Municipality of Daet or its tourism office before booking around a specific date. Confirm the event calendar, venues, road advisories, and any registration or ticket details directly with the organizer.

This article is a general visitor guide, not a current event announcement. No dates, performers, fees, or activities are being promised here.$article$,
      'Learn what the Pinyasan Festival celebrates and why visitors should confirm each year’s schedule before traveling.',
      'cultural_insights',
      ARRAY['admin-curated', 'Daet', 'Pinyasan Festival', 'events', 'pineapple'],
      'published',
      NOW(),
      admin_user_id
    ),
    (
      'db000001-2026-4db0-8e10-000000000005',
      'A Flexible One-Day Daet Itinerary',
      'one-day-daet-itinerary',
      $article$Begin in the town center with a visit to the First Rizal Monument and a walk through the Elevated Town Plaza. Check locally for nearby heritage markers and current access information.

For lunch, choose a local restaurant and ask what Camarines Norte or Bicol dishes are available that day. In the afternoon, head toward Bagasbas Beach for a coastal walk or surfing, depending on weather and sea conditions.

Treat this as a flexible outline rather than a timed tour: travel times, opening hours, transport, and beach conditions can change. Confirm details locally, leave room for rest, and follow safety guidance at the shore.$article$,
      'A simple Daet day plan combining town-center heritage, local food, and a weather-dependent visit to Bagasbas Beach.',
      'travel_guides',
      ARRAY['admin-curated', 'Daet', 'itinerary', 'Bagasbas Beach', 'travel guide'],
      'published',
      NOW(),
      admin_user_id
    )
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.info_events (
    id, title, description, location, category, status, created_by
  )
  VALUES (
    'de000001-2026-4de0-8e10-000000000001',
    'Pinyasan Festival — Schedule to Be Confirmed',
    'Draft recurring-festival listing. Do not publish until the Municipality of Daet or its tourism office confirms this year’s dates, venues, public advisories, and any registration or ticket details.',
    'Daet, Camarines Norte',
    'festival',
    'draft',
    admin_user_id
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

COMMIT;
