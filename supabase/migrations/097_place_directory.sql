-- 097: Place directory (Phase 2)
--
-- Turns info_tourist_spots into a directory of four listing types —
-- attraction, accommodation, restaurant, business — so reviews, favourites,
-- view analytics and comments keep working for every type without new tables.
--
-- Also:
--   * lets Tourism Officers manage listings and events through RLS (the admin
--     events page writes with the browser client);
--   * stops ordinary users from creating or editing public listings;
--   * seeds a few clearly-marked sample listings for testing.
--
-- App-side rules: src/lib/listings.mjs (validation) and src/lib/staffRoles.mjs.

BEGIN;

-- ------------------------------------------------------------------
-- 1. New listing columns
-- ------------------------------------------------------------------
ALTER TABLE public.info_tourist_spots
  ADD COLUMN IF NOT EXISTS listing_type TEXT NOT NULL DEFAULT 'attraction',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS barangay TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS price_range TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'info_tourist_spots_listing_type_check') THEN
    ALTER TABLE public.info_tourist_spots
      ADD CONSTRAINT info_tourist_spots_listing_type_check
      CHECK (listing_type IN ('attraction', 'accommodation', 'restaurant', 'business'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'info_tourist_spots_price_range_check') THEN
    ALTER TABLE public.info_tourist_spots
      ADD CONSTRAINT info_tourist_spots_price_range_check
      CHECK (price_range IS NULL OR price_range IN ('₱', '₱₱', '₱₱₱', '₱₱₱₱'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS info_tourist_spots_type_status_idx
  ON public.info_tourist_spots (listing_type, status);
CREATE INDEX IF NOT EXISTS info_tourist_spots_tags_idx
  ON public.info_tourist_spots USING GIN (tags);

-- ------------------------------------------------------------------
-- 2. Staff check usable from RLS (runs as the calling user)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tourism_staff(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.info_users u
    WHERE u.id = p_user_id
      AND u.status = 'active'
      AND u.user_type IN ('admin', 'administrator', 'tourism_officer')
  );
$$;

REVOKE ALL ON FUNCTION public.is_tourism_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tourism_staff(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------
-- 3. Listings RLS: public reads active rows; only tourism staff write.
--    Previously any signed-in user could insert a listing with
--    created_by = themselves, and it went public (default status 'active').
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "info_tourist_spots_select_public" ON public.info_tourist_spots;
DROP POLICY IF EXISTS "info_tourist_spots_insert_admin_or_owner" ON public.info_tourist_spots;
DROP POLICY IF EXISTS "info_tourist_spots_update_admin_or_owner" ON public.info_tourist_spots;
DROP POLICY IF EXISTS "info_tourist_spots_delete_admin_or_owner" ON public.info_tourist_spots;

CREATE POLICY "info_tourist_spots_select_public" ON public.info_tourist_spots
  FOR SELECT USING (status = 'active' OR public.is_tourism_staff(auth.uid()));
CREATE POLICY "info_tourist_spots_insert_staff" ON public.info_tourist_spots
  FOR INSERT WITH CHECK (public.is_tourism_staff(auth.uid()));
CREATE POLICY "info_tourist_spots_update_staff" ON public.info_tourist_spots
  FOR UPDATE USING (public.is_tourism_staff(auth.uid())) WITH CHECK (public.is_tourism_staff(auth.uid()));
CREATE POLICY "info_tourist_spots_delete_staff" ON public.info_tourist_spots
  FOR DELETE USING (public.is_tourism_staff(auth.uid()));

-- ------------------------------------------------------------------
-- 4. Events: tourism officers get the same access as admins.
--    Extra permissive policies are OR'd with the existing ones from 082.
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "info_events_tourism_staff_select" ON public.info_events;
DROP POLICY IF EXISTS "info_events_tourism_staff_insert" ON public.info_events;
DROP POLICY IF EXISTS "info_events_tourism_staff_update" ON public.info_events;
DROP POLICY IF EXISTS "info_events_tourism_staff_delete" ON public.info_events;

CREATE POLICY "info_events_tourism_staff_select" ON public.info_events
  FOR SELECT USING (public.is_tourism_staff(auth.uid()));
CREATE POLICY "info_events_tourism_staff_insert" ON public.info_events
  FOR INSERT WITH CHECK (public.is_tourism_staff(auth.uid()));
CREATE POLICY "info_events_tourism_staff_update" ON public.info_events
  FOR UPDATE USING (public.is_tourism_staff(auth.uid())) WITH CHECK (public.is_tourism_staff(auth.uid()));
CREATE POLICY "info_events_tourism_staff_delete" ON public.info_events
  FOR DELETE USING (public.is_tourism_staff(auth.uid()));

-- The update guard from 082 only exempts admins; exempt tourism staff too so
-- officers can publish, unpublish and edit events. Rewritten in place (same
-- approach as 096) and aborts if the expected text is not found exactly once.
DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_old text := 'IF auth.role() = ''service_role'' OR public.is_admin(auth.uid()) THEN';
  v_new text := 'IF auth.role() = ''service_role'' OR public.is_tourism_staff(auth.uid()) THEN';
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'guard_user_event_moderation';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '097: public.guard_user_event_moderation not found';
  END IF;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  IF position(v_new IN v_def) > 0 THEN
    RETURN; -- already applied
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION '097: unexpected body for public.guard_user_event_moderation';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- ------------------------------------------------------------------
-- 5. Sample listings (clearly marked; safe to delete or edit)
-- ------------------------------------------------------------------
INSERT INTO public.info_tourist_spots (
  name, slug, listing_type, category, description, location, barangay,
  latitude, longitude, opening_hours, entry_fee, price_range, contact_number,
  tags, status, featured, rating, review_count
)
VALUES
  ('Sample Beachfront Inn', 'sample-beachfront-inn', 'accommodation', 'inn',
   'Sample listing for testing — replace with verified details before launch. Simple rooms a short walk from the surf break.',
   'Bagasbas Beach Road, Daet', 'Bagasbas', 14.1340000, 122.9830000,
   'Front desk 24 hours', NULL, '₱₱', '', ARRAY['beachfront', 'surf', 'family'], 'active', false, 0, 0),
  ('Sample Surf Resort', 'sample-surf-resort', 'accommodation', 'resort',
   'Sample listing for testing — replace with verified details before launch. Resort with pool and board rentals.',
   'Bagasbas, Daet', 'Bagasbas', 14.1355000, 122.9850000,
   'Check-in 2:00 PM, check-out 12:00 NN', NULL, '₱₱₱', '', ARRAY['pool', 'surf', 'events venue'], 'active', true, 0, 0),
  ('Sample Seafood Grill', 'sample-seafood-grill', 'restaurant', 'seafood',
   'Sample listing for testing — replace with verified details before launch. Grilled catch of the day and Bicol favourites.',
   'Bagasbas Boulevard, Daet', 'Bagasbas', 14.1330000, 122.9820000,
   '10:00 AM - 10:00 PM', NULL, '₱₱', '', ARRAY['seafood', 'bicol express', 'sunset view'], 'active', false, 0, 0),
  ('Sample Town Café', 'sample-town-cafe', 'restaurant', 'cafe',
   'Sample listing for testing — replace with verified details before launch. Coffee and pastries near the town plaza.',
   'Poblacion, Daet', 'Barangay II (Poblacion)', 14.1125000, 122.9555000,
   '7:00 AM - 9:00 PM', NULL, '₱', '', ARRAY['coffee', 'wifi', 'breakfast'], 'active', false, 0, 0),
  ('Sample Pasalubong Center', 'sample-pasalubong-center', 'business', 'pasalubong',
   'Sample listing for testing — replace with verified details before launch. Local delicacies and Camarines Norte pineapple products.',
   'Vinzons Avenue, Daet', 'Barangay III (Poblacion)', 14.1110000, 122.9560000,
   '8:00 AM - 8:00 PM', NULL, '₱', '', ARRAY['pineapple', 'souvenirs', 'local products'], 'active', false, 0, 0),
  ('Sample Surf School', 'sample-surf-school', 'business', 'surf school',
   'Sample listing for testing — replace with verified details before launch. Beginner lessons and board rentals.',
   'Bagasbas Beach, Daet', 'Bagasbas', 14.1345000, 122.9840000,
   '6:00 AM - 5:00 PM', NULL, '₱₱', '', ARRAY['surfing', 'lessons', 'rentals'], 'active', false, 0, 0)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
