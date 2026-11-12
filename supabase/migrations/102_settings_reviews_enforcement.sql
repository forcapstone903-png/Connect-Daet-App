-- 102: Admin system settings, tourism-office review replies, moderation
-- enforcement and audit gaps found in the 2026-11-12 completion audit.
--
--   admin_app_settings          new ids: security, notifications, email, messaging
--   staff_permission_overrides  per-person grants/revokes on top of the role
--   listing_categories          managed category list per listing type
--   attraction_ratings          office_reply / office_reply_by / office_reply_at
--   user_warnings               warning history (count shown to moderators)
--   admin_user_bans.ban_type    'posting' (can sign in, cannot post) or
--                               'suspension' (cannot sign in until expiry)
--   auth_login_failures         masked email hint + configurable thresholds
--   user_favorites              planned_visit_date / trip_notes (trip planner)
--   audit_user_content_deletion every deletion of community content is logged
--   request_push_dispatch       honours the push switches in notification settings
--   admin_restore_backup        whole-snapshot restore in ONE transaction
--   get_site_traffic_buckets    daily / weekly / monthly traffic with real
--                               distinct-visitor counts per bucket

BEGIN;

-- ------------------------------------------------------------------
-- 1. Settings ids
-- ------------------------------------------------------------------
ALTER TABLE public.admin_app_settings
  DROP CONSTRAINT IF EXISTS admin_app_settings_id_check;
ALTER TABLE public.admin_app_settings
  ADD CONSTRAINT admin_app_settings_id_check
  CHECK (id IN (
    'general', 'moderation', 'announcement', 'rewards', 'community-guidelines',
    'security', 'notifications', 'email', 'messaging'
  ));

-- ------------------------------------------------------------------
-- 2. Per-person staff permissions
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_permission_overrides (
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission ~ '^[a-z]+\.[a-z]+$'),
  granted BOOLEAN NOT NULL,
  updated_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission)
);

ALTER TABLE public.staff_permission_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_permission_overrides FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.staff_permission_overrides TO service_role;

-- ------------------------------------------------------------------
-- 3. Managed listing categories
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('attraction', 'accommodation', 'restaurant', 'business')),
  slug TEXT NOT NULL CHECK (slug = lower(slug) AND char_length(slug) BETWEEN 1 AND 50),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_type, slug)
);

ALTER TABLE public.listing_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.listing_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.listing_categories TO anon, authenticated;
GRANT ALL ON TABLE public.listing_categories TO service_role;
DROP POLICY IF EXISTS listing_categories_select_active ON public.listing_categories;
CREATE POLICY listing_categories_select_active
  ON public.listing_categories FOR SELECT
  USING (is_active);

INSERT INTO public.listing_categories (listing_type, slug, name, sort_order)
SELECT seed.listing_type, seed.slug, initcap(seed.slug), seed.sort_order
FROM (VALUES
  ('attraction', 'beach', 10), ('attraction', 'historical', 20), ('attraction', 'nature', 30),
  ('attraction', 'cultural', 40), ('attraction', 'religious', 50), ('attraction', 'park', 60),
  ('attraction', 'market', 70),
  ('accommodation', 'hotel', 10), ('accommodation', 'resort', 20), ('accommodation', 'inn', 30),
  ('accommodation', 'homestay', 40), ('accommodation', 'hostel', 50),
  ('restaurant', 'filipino', 10), ('restaurant', 'seafood', 20), ('restaurant', 'cafe', 30),
  ('restaurant', 'fast food', 40), ('restaurant', 'bakery', 50), ('restaurant', 'bar', 60),
  ('business', 'souvenir', 10), ('business', 'pasalubong', 20), ('business', 'surf school', 30),
  ('business', 'tour operator', 40), ('business', 'transport', 50), ('business', 'services', 60)
) AS seed(listing_type, slug, sort_order)
ON CONFLICT (listing_type, slug) DO NOTHING;

-- Keep every category already used by a listing so existing data stays valid.
INSERT INTO public.listing_categories (listing_type, slug, name)
SELECT DISTINCT
  spots.listing_type,
  lower(left(trim(spots.category), 50)),
  initcap(left(trim(spots.category), 60))
FROM public.info_tourist_spots AS spots
WHERE spots.category IS NOT NULL AND trim(spots.category) <> ''
ON CONFLICT (listing_type, slug) DO NOTHING;

-- ------------------------------------------------------------------
-- 4. Tourism-office replies to reviews
-- ------------------------------------------------------------------
ALTER TABLE public.attraction_ratings
  ADD COLUMN IF NOT EXISTS office_reply TEXT,
  ADD COLUMN IF NOT EXISTS office_reply_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS office_reply_at TIMESTAMPTZ;

ALTER TABLE public.attraction_ratings
  DROP CONSTRAINT IF EXISTS attraction_ratings_office_reply_length;
ALTER TABLE public.attraction_ratings
  ADD CONSTRAINT attraction_ratings_office_reply_length
  CHECK (office_reply IS NULL OR char_length(office_reply) BETWEEN 1 AND 2000);

-- Reviewers edit their own rows from the browser; they must not be able to
-- write (or remove) the office's reply. Only server routes (service role) can.
CREATE OR REPLACE FUNCTION public.guard_attraction_rating_office_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.office_reply := NULL;
      NEW.office_reply_by := NULL;
      NEW.office_reply_at := NULL;
    ELSE
      NEW.office_reply := OLD.office_reply;
      NEW.office_reply_by := OLD.office_reply_by;
      NEW.office_reply_at := OLD.office_reply_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_attraction_rating_office_reply ON public.attraction_ratings;
CREATE TRIGGER tr_guard_attraction_rating_office_reply
  BEFORE INSERT OR UPDATE ON public.attraction_ratings
  FOR EACH ROW EXECUTE FUNCTION public.guard_attraction_rating_office_reply();

CREATE INDEX IF NOT EXISTS attraction_ratings_office_reply_pending_idx
  ON public.attraction_ratings (created_at DESC)
  WHERE office_reply IS NULL;

-- ------------------------------------------------------------------
-- 5. Warning history
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  report_id UUID,
  issued_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_warnings_user_idx ON public.user_warnings (user_id, created_at DESC);

ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_warnings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_warnings TO authenticated;
GRANT ALL ON TABLE public.user_warnings TO service_role;
DROP POLICY IF EXISTS user_warnings_select_own ON public.user_warnings;
CREATE POLICY user_warnings_select_own
  ON public.user_warnings FOR SELECT
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- 6. Posting ban vs. account suspension
-- ------------------------------------------------------------------
ALTER TABLE public.admin_user_bans
  ADD COLUMN IF NOT EXISTS ban_type TEXT NOT NULL DEFAULT 'posting';
ALTER TABLE public.admin_user_bans
  DROP CONSTRAINT IF EXISTS admin_user_bans_ban_type_check;
ALTER TABLE public.admin_user_bans
  ADD CONSTRAINT admin_user_bans_ban_type_check
  CHECK (ban_type IN ('posting', 'suspension'));

-- ------------------------------------------------------------------
-- 7. Configurable login lockout + admin-visible failure list
-- ------------------------------------------------------------------
ALTER TABLE public.auth_login_failures
  ADD COLUMN IF NOT EXISTS email_hint TEXT CHECK (email_hint IS NULL OR char_length(email_hint) <= 120),
  ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.record_auth_login_failure(
  p_email_hash text,
  p_email_hint text,
  p_max_attempts integer,
  p_window_minutes integer,
  p_lockout_minutes integer
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
  v_max integer := LEAST(GREATEST(COALESCE(p_max_attempts, 5), 3), 20);
  v_window interval := make_interval(mins => LEAST(GREATEST(COALESCE(p_window_minutes, 15), 5), 120));
  v_lock interval := make_interval(mins => LEAST(GREATEST(COALESCE(p_lockout_minutes, 15), 5), 1440));
  v_locked_until timestamptz;
BEGIN
  IF p_email_hash IS NULL OR p_email_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login lockout key';
  END IF;

  INSERT INTO public.auth_login_failures (email_hash, failure_count, window_started_at, updated_at, email_hint, last_failed_at)
  VALUES (p_email_hash, 1, v_now, v_now, left(p_email_hint, 120), v_now)
  ON CONFLICT (email_hash) DO UPDATE
  SET failure_count = CASE
        WHEN public.auth_login_failures.window_started_at <= v_now - v_window THEN 1
        ELSE public.auth_login_failures.failure_count + 1
      END,
      window_started_at = CASE
        WHEN public.auth_login_failures.window_started_at <= v_now - v_window THEN v_now
        ELSE public.auth_login_failures.window_started_at
      END,
      locked_until = CASE
        WHEN public.auth_login_failures.window_started_at <= v_now - v_window THEN NULL
        WHEN public.auth_login_failures.failure_count + 1 >= v_max THEN v_now + v_lock
        ELSE public.auth_login_failures.locked_until
      END,
      email_hint = COALESCE(left(EXCLUDED.email_hint, 120), public.auth_login_failures.email_hint),
      last_failed_at = v_now,
      updated_at = v_now
  RETURNING locked_until INTO v_locked_until;

  RETURN v_locked_until;
END;
$$;

REVOKE ALL ON FUNCTION public.record_auth_login_failure(text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_auth_login_failure(text, text, integer, integer, integer) TO service_role;

-- ------------------------------------------------------------------
-- 8. Trip planner fields on saved items
-- ------------------------------------------------------------------
ALTER TABLE public.user_favorites
  ADD COLUMN IF NOT EXISTS planned_visit_date DATE,
  ADD COLUMN IF NOT EXISTS trip_notes TEXT;
ALTER TABLE public.user_favorites
  DROP CONSTRAINT IF EXISTS user_favorites_trip_notes_length;
ALTER TABLE public.user_favorites
  ADD CONSTRAINT user_favorites_trip_notes_length
  CHECK (trip_notes IS NULL OR char_length(trip_notes) <= 500);

-- ------------------------------------------------------------------
-- 9. Audit every deletion of community content
--    Stores only ids (no content text) so purged accounts leave no copy.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_user_content_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row JSONB := to_jsonb(OLD);
  v_actor UUID := auth.uid();
  v_owner_text TEXT := COALESCE(v_row->>'user_id', v_row->>'created_by', v_row->>'author_id');
  v_id_text TEXT := v_row->>'id';
  v_uuid CONSTANT TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  BEGIN
    INSERT INTO public.info_audit_log (user_id, action, table_name, record_id, changes)
    VALUES (
      v_actor,
      CASE
        WHEN v_actor IS NULL THEN 'content_deleted'
        WHEN v_actor::TEXT = v_owner_text THEN 'content_deleted_by_owner'
        ELSE 'content_deleted_by_staff'
      END,
      TG_TABLE_NAME,
      CASE WHEN v_id_text ~ v_uuid THEN v_id_text::UUID ELSE NULL END,
      jsonb_build_object(
        'owner_id', v_owner_text,
        'record_id', v_id_text,
        'via', CASE WHEN v_actor IS NULL THEN 'server' ELSE 'app' END
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Content deletion audit failed for %: %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN OLD;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'info_blogs', 'info_user_posts', 'forum_threads', 'forum_replies',
    'content_comments', 'info_comments', 'attraction_ratings', 'reposts'
  ] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tr_audit_content_deletion ON public.%I', v_table);
      EXECUTE format(
        'CREATE TRIGGER tr_audit_content_deletion AFTER DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.audit_user_content_deletion()',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------
-- 10. Push switches (Settings -> Notifications)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_push_dispatch(p_body jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_settings jsonb;
  v_setting_key text := CASE WHEN p_body->>'mode' = 'alert' THEN 'alert_push_enabled' ELSE 'general_push_enabled' END;
BEGIN
  SELECT value INTO v_settings FROM public.admin_app_settings WHERE id = 'notifications';
  IF COALESCE((v_settings->>v_setting_key)::boolean, true) = false THEN
    RAISE NOTICE 'Push dispatch skipped: % is off in notification settings.', v_setting_key;
    RETURN false;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'push_function_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL OR length(v_secret) < 32 THEN
    RAISE NOTICE 'Push dispatch skipped: push_function_url / push_webhook_secret are not set in Vault.';
    RETURN false;
  END IF;

  PERFORM net.http_post(
    v_url,
    p_body,
    '{}'::jsonb,
    jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    5000
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push dispatch failed: %', SQLERRM;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.request_push_dispatch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_push_dispatch(jsonb) TO service_role;

-- ------------------------------------------------------------------
-- 11. Transactional restore
--     Called by the admin backup route with the validated snapshot. The
--     whole function runs in one transaction: any error rolls back every
--     table. Rows are merged by id; nothing absent from the snapshot is
--     deleted. Only columns present in the snapshot are written, and the
--     stored info_users.password column is never touched.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_restore_backup(
  p_tables jsonb,
  p_table_order text[],
  p_self_refs jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '300s'
AS $$
DECLARE
  v_table text;
  v_rows jsonb;
  v_cols text[];
  v_self text[];
  v_select text;
  v_insert_cols text;
  v_update text;
  v_count integer;
  v_total integer := 0;
  v_tables integer := 0;
  v_col text;
BEGIN
  IF jsonb_typeof(p_tables) <> 'object' THEN
    RAISE EXCEPTION 'Backup tables must be a JSON object';
  END IF;

  FOREACH v_table IN ARRAY p_table_order LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Restore table "%" does not exist', v_table;
    END IF;

    v_rows := COALESCE(p_tables -> v_table, '[]'::jsonb);
    IF jsonb_typeof(v_rows) <> 'array' THEN
      RAISE EXCEPTION 'Backup table "%" must contain an array', v_table;
    END IF;
    CONTINUE WHEN jsonb_array_length(v_rows) = 0;

    SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position)
      INTO v_cols
      FROM information_schema.columns AS c
     WHERE c.table_schema = 'public'
       AND c.table_name = v_table
       AND c.is_generated = 'NEVER'
       AND COALESCE(c.identity_generation, '') <> 'ALWAYS'
       AND NOT (v_table = 'info_users' AND c.column_name = 'password')
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) AS r(row_data) WHERE r.row_data ? c.column_name);

    IF v_cols IS NULL OR NOT ('id' = ANY (v_cols)) THEN
      RAISE EXCEPTION 'Backup table "%" has no id column to merge on', v_table;
    END IF;

    SELECT COALESCE(array_agg(value), ARRAY[]::text[])
      INTO v_self
      FROM jsonb_array_elements_text(COALESCE(p_self_refs -> v_table, '[]'::jsonb));

    v_insert_cols := (SELECT string_agg(format('%I', col), ', ') FROM unnest(v_cols) AS col);
    v_select := (
      SELECT string_agg(CASE WHEN col = ANY (v_self) THEN 'NULL' ELSE format('src.%I', col) END, ', ')
      FROM unnest(v_cols) AS col
    );
    v_update := (
      SELECT string_agg(format('%1$I = EXCLUDED.%1$I', col), ', ')
      FROM unnest(v_cols) AS col
      WHERE col <> 'id' AND NOT (col = ANY (v_self))
    );

    EXECUTE format(
      'INSERT INTO public.%1$I (%2$s) SELECT %3$s FROM jsonb_populate_recordset(NULL::public.%1$I, $1) AS src '
      'ON CONFLICT (id) DO %4$s',
      v_table,
      v_insert_cols,
      v_select,
      CASE WHEN v_update IS NULL THEN 'NOTHING' ELSE 'UPDATE SET ' || v_update END
    ) USING v_rows;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    v_tables := v_tables + 1;
  END LOOP;

  -- Second pass: self references, now that every referenced row exists.
  FOR v_table IN SELECT jsonb_object_keys(COALESCE(p_self_refs, '{}'::jsonb)) LOOP
    CONTINUE WHEN NOT (v_table = ANY (p_table_order));
    v_rows := COALESCE(p_tables -> v_table, '[]'::jsonb);
    CONTINUE WHEN jsonb_typeof(v_rows) <> 'array' OR jsonb_array_length(v_rows) = 0;
    FOR v_col IN SELECT jsonb_array_elements_text(p_self_refs -> v_table) LOOP
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_table AND column_name = v_col
      );
      CONTINUE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) AS r(row_data) WHERE r.row_data ? v_col);
      EXECUTE format(
        'UPDATE public.%1$I AS target SET %2$I = src.%2$I '
        'FROM jsonb_populate_recordset(NULL::public.%1$I, $1) AS src '
        'WHERE target.id = src.id AND target.%2$I IS DISTINCT FROM src.%2$I',
        v_table,
        v_col
      ) USING v_rows;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('restoredRows', v_total, 'restoredTables', v_tables);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_restore_backup(jsonb, text[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_backup(jsonb, text[], jsonb) TO service_role;

-- ------------------------------------------------------------------
-- 12. Daily / weekly / monthly traffic
--     Distinct visitors are counted per bucket, not summed from days.
--     Weeks start on Monday (ISO). Page views are retained for 90 days.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_site_traffic_buckets(p_days integer DEFAULT 30, p_bucket text DEFAULT 'day')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH settings AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_days, 30), 7), 90) AS days,
      CASE WHEN p_bucket IN ('day', 'week', 'month') THEN p_bucket ELSE 'day' END AS bucket,
      (NOW() AT TIME ZONE 'UTC')::date AS today
  ),
  bounds AS (
    SELECT bucket, ((today - (days - 1))::timestamp AT TIME ZONE 'UTC') AS since_at,
           (today - (days - 1)) AS first_day, today
    FROM settings
  ),
  calendar AS (
    SELECT DISTINCT date_trunc(bounds.bucket, generated_day)::date AS bucket_start
    FROM bounds
    CROSS JOIN LATERAL generate_series(bounds.first_day::timestamp, bounds.today::timestamp, INTERVAL '1 day') AS g(generated_day)
  ),
  counted AS (
    SELECT
      date_trunc(bounds.bucket, views.viewed_at AT TIME ZONE 'UTC')::date AS bucket_start,
      COUNT(*)::integer AS page_views,
      COUNT(DISTINCT views.visitor_hash)::integer AS unique_visitors
    FROM public.site_page_views AS views
    CROSS JOIN bounds
    WHERE views.viewed_at >= bounds.since_at
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', to_char(calendar.bucket_start, 'YYYY-MM-DD'),
    'pageViews', COALESCE(counted.page_views, 0),
    'uniqueVisitors', COALESCE(counted.unique_visitors, 0)
  ) ORDER BY calendar.bucket_start), '[]'::jsonb)
  FROM calendar
  LEFT JOIN counted USING (bucket_start);
$$;

REVOKE ALL ON FUNCTION public.get_site_traffic_buckets(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_traffic_buckets(integer, text) TO service_role;

COMMIT;
