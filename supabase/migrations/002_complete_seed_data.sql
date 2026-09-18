-- Retain this migration identity for existing deployments.
-- Category configuration only; no accounts, content, or activity are fabricated.
-- Existing database records are not removed by this source change.
BEGIN;

INSERT INTO public.system_categories (id, name, icon_emoji, sort_order, is_active, created_at, updated_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'Nature', '🌿', 1, true, NOW(), NOW()),
  ('a2222222-2222-4222-8222-222222222222', 'Adventure', '🧭', 2, true, NOW(), NOW()),
  ('a3333333-3333-4333-8333-333333333333', 'Culture', '🏛️', 3, true, NOW(), NOW()),
  ('a4444444-4444-4444-8444-444444444444', 'Food', '🍲', 4, true, NOW(), NOW()),
  ('a5555555-5555-4555-8555-555555555555', 'Events', '🎉', 5, true, NOW(), NOW());

INSERT INTO public.forum_categories (id, name, description, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Travel Tips', 'Helpful advice for destinations, booking, and local insights.', NOW(), NOW()),
  (gen_random_uuid(), 'Food & Dining', 'Recommendations and reviews of local food experiences.', NOW(), NOW()),
  (gen_random_uuid(), 'Events', 'Updates and discussion about upcoming festivals and cultural activities.', NOW(), NOW());

COMMIT;
