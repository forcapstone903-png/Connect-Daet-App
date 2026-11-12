BEGIN;

ALTER TABLE public.site_page_views
  ADD COLUMN IF NOT EXISTS device_type TEXT NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'site_page_views_device_type_check'
       AND conrelid = 'public.site_page_views'::regclass
  ) THEN
    ALTER TABLE public.site_page_views
      ADD CONSTRAINT site_page_views_device_type_check
      CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'unknown'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS site_page_views_device_viewed_at_idx
  ON public.site_page_views (device_type, viewed_at DESC);
CREATE INDEX IF NOT EXISTS info_audit_log_created_at_idx
  ON public.info_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS attraction_ratings_created_at_idx
  ON public.attraction_ratings (created_at DESC);
CREATE INDEX IF NOT EXISTS info_inquiries_created_at_idx
  ON public.info_inquiries (created_at DESC);

CREATE OR REPLACE FUNCTION public.record_site_page_view(
  p_visitor_hash TEXT,
  p_page_path TEXT,
  p_device_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_device_type TEXT := COALESCE(NULLIF(p_device_type, ''), 'unknown');
BEGIN
  IF p_visitor_hash IS NULL
    OR p_page_path IS NULL
    OR p_visitor_hash !~ '^[0-9a-f]{64}$'
    OR length(p_page_path) > 240
    OR p_page_path !~ '^/info/(visitor|search|tourist-spots|events|blog|forum)(/|$)'
    OR normalized_device_type NOT IN ('mobile', 'tablet', 'desktop', 'unknown')
  THEN
    RAISE EXCEPTION 'Invalid site analytics event';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_visitor_hash), hashtext(p_page_path));

  IF EXISTS (
    SELECT 1
      FROM public.site_page_views
     WHERE visitor_hash = p_visitor_hash
       AND page_path = p_page_path
       AND viewed_at >= NOW() - INTERVAL '10 seconds'
  ) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.site_page_views (visitor_hash, page_path, device_type)
  VALUES (p_visitor_hash, p_page_path, normalized_device_type);

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_site_page_view(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_site_page_view(TEXT, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_report(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH settings AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_days, 30), 7), 90) AS days,
      (NOW() AT TIME ZONE 'UTC')::DATE AS today
  ),
  bounds AS (
    SELECT
      days,
      today - (days - 1) AS first_day,
      today AS last_day,
      ((today - (days - 1))::TIMESTAMP AT TIME ZONE 'UTC') AS since_at
    FROM settings
  ),
  calendar AS (
    SELECT generated_day::DATE AS day
    FROM bounds
    CROSS JOIN LATERAL generate_series(
      bounds.first_day::TIMESTAMP,
      bounds.last_day::TIMESTAMP,
      INTERVAL '1 day'
    ) AS generated(generated_day)
  ),
  traffic_by_day AS (
    SELECT
      (views.viewed_at AT TIME ZONE 'UTC')::DATE AS day,
      COUNT(*)::INTEGER AS page_views,
      COUNT(DISTINCT views.visitor_hash)::INTEGER AS unique_visitors
    FROM public.site_page_views AS views
    CROSS JOIN bounds
    WHERE views.viewed_at >= bounds.since_at
    GROUP BY (views.viewed_at AT TIME ZONE 'UTC')::DATE
  ),
  traffic_summary AS (
    SELECT
      COUNT(*)::INTEGER AS page_views,
      COUNT(DISTINCT views.visitor_hash)::INTEGER AS unique_visitors
    FROM public.site_page_views AS views
    CROSS JOIN bounds
    WHERE views.viewed_at >= bounds.since_at
  ),
  user_by_day AS (
    SELECT
      (users.created_at AT TIME ZONE 'UTC')::DATE AS day,
      COUNT(*)::INTEGER AS new_users
    FROM public.info_users AS users
    CROSS JOIN bounds
    WHERE users.created_at >= bounds.since_at
    GROUP BY (users.created_at AT TIME ZONE 'UTC')::DATE
  ),
  user_growth_rows AS (
    SELECT
      calendar.day,
      COALESCE(user_by_day.new_users, 0) AS new_users,
      (
        SELECT COUNT(*)::INTEGER
        FROM public.info_users AS earlier_users
        CROSS JOIN bounds AS earlier_bounds
        WHERE earlier_users.created_at < earlier_bounds.since_at
      ) + SUM(COALESCE(user_by_day.new_users, 0)) OVER (ORDER BY calendar.day) AS total_users
    FROM calendar
    LEFT JOIN user_by_day USING (day)
  ),
  ratings_by_day AS (
    SELECT
      (ratings.created_at AT TIME ZONE 'UTC')::DATE AS day,
      ROUND(AVG(ratings.rating)::NUMERIC, 2) AS average_rating,
      COUNT(*)::INTEGER AS review_count
    FROM public.attraction_ratings AS ratings
    CROSS JOIN bounds
    WHERE ratings.created_at >= bounds.since_at
    GROUP BY (ratings.created_at AT TIME ZONE 'UTC')::DATE
  ),
  device_totals AS (
    SELECT
      views.device_type,
      COUNT(*)::INTEGER AS page_views,
      COUNT(DISTINCT views.visitor_hash)::INTEGER AS unique_visitors
    FROM public.site_page_views AS views
    CROSS JOIN bounds
    WHERE views.viewed_at >= bounds.since_at
    GROUP BY views.device_type
  ),
  popular_destinations AS (
    SELECT
      spots.id,
      spots.name,
      COUNT(*)::INTEGER AS page_views,
      COUNT(DISTINCT views.visitor_hash)::INTEGER AS unique_visitors
    FROM public.site_page_views AS views
    CROSS JOIN bounds
    JOIN public.info_tourist_spots AS spots
      ON spots.id::TEXT = split_part(views.page_path, '/tourist-spots/', 2)
    WHERE views.viewed_at >= bounds.since_at
      AND views.page_path ~ '^/info/visitor/tourist-spots/[^/]+$'
      AND spots.status = 'active'
    GROUP BY spots.id, spots.name
    ORDER BY page_views DESC, spots.name
    LIMIT 10
  ),
  popular_pages AS (
    SELECT
      views.page_path,
      COUNT(*)::INTEGER AS page_views,
      COUNT(DISTINCT views.visitor_hash)::INTEGER AS unique_visitors
    FROM public.site_page_views AS views
    CROSS JOIN bounds
    WHERE views.viewed_at >= bounds.since_at
    GROUP BY views.page_path
    ORDER BY page_views DESC, views.page_path
    LIMIT 10
  ),
  alert_activity_all AS (
    SELECT
      alerts.id,
      alerts.title,
      alerts.category,
      alerts.severity,
      alerts.sent_at,
      COALESCE(reach.delivered, 0) AS delivered,
      COALESCE(reach.opened, 0) AS opened
    FROM public.alerts
    CROSS JOIN bounds
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::INTEGER AS delivered,
        COUNT(*) FILTER (WHERE notifications.is_read)::INTEGER AS opened
      FROM public.info_notifications AS notifications
      WHERE notifications.alert_id = alerts.id
        AND notifications.type = 'alert'
    ) AS reach ON TRUE
    WHERE alerts.status = 'sent'
      AND alerts.sent_at >= bounds.since_at
    ORDER BY alerts.sent_at DESC
  ),
  alert_activity AS (
    SELECT *
    FROM alert_activity_all
    ORDER BY sent_at DESC
    LIMIT 20
  ),
  staff_activity AS (
    SELECT
      users.id,
      users.full_name,
      users.email,
      users.user_type,
      COUNT(logs.id)::INTEGER AS action_count,
      MAX(logs.created_at) AS last_activity
    FROM public.info_audit_log AS logs
    JOIN public.info_users AS users ON users.id = logs.user_id
    CROSS JOIN bounds
    WHERE logs.created_at >= bounds.since_at
      AND users.user_type IN ('admin', 'administrator', 'tourism_officer', 'moderator')
    GROUP BY users.id, users.full_name, users.email, users.user_type
    ORDER BY action_count DESC, last_activity DESC
    LIMIT 20
  ),
  inquiry_categories AS (
    SELECT inquiries.category, COUNT(*)::INTEGER AS inquiry_count
    FROM public.info_inquiries AS inquiries
    CROSS JOIN bounds
    WHERE inquiries.created_at >= bounds.since_at
    GROUP BY inquiries.category
    ORDER BY inquiry_count DESC, inquiries.category
    LIMIT 10
  ),
  summary AS (
    SELECT jsonb_build_object(
      'totalUsers', (SELECT COUNT(*)::INTEGER FROM public.info_users),
      'activeUsers', (SELECT COUNT(*)::INTEGER FROM public.info_users WHERE status = 'active'),
      'totalStaff', (
        SELECT COUNT(*)::INTEGER
        FROM public.info_users
        WHERE status = 'active'
          AND user_type IN ('admin', 'administrator', 'tourism_officer', 'moderator')
      ),
      'newUsers', (
        SELECT COUNT(*)::INTEGER
        FROM public.info_users AS users
        CROSS JOIN bounds
        WHERE users.created_at >= bounds.since_at
      ),
      'pageViews', (SELECT page_views FROM traffic_summary),
      'uniqueVisitors', (SELECT unique_visitors FROM traffic_summary),
      'totalEvents', (
        SELECT COUNT(*)::INTEGER
        FROM public.info_events
        WHERE status = 'published' AND approval_status = 'approved'
      ),
      'totalPlaces', (
        SELECT COUNT(*)::INTEGER
        FROM public.info_tourist_spots
        WHERE status = 'active'
      ),
      'totalBlogs', (
        SELECT COUNT(*)::INTEGER
        FROM public.info_blogs
        WHERE status = 'published' AND approval_status = 'approved'
      ),
      'feedbackCount', (SELECT COUNT(*)::INTEGER FROM public.info_feedback),
      'openInquiries', (
        SELECT COUNT(*)::INTEGER
        FROM public.info_inquiries
        WHERE status IN ('open', 'reviewing')
      ),
      'averageRating', (
        SELECT ROUND(COALESCE(AVG(rating), 0)::NUMERIC, 1)
        FROM public.attraction_ratings
      ),
      'ratingCount', (SELECT COUNT(*)::INTEGER FROM public.attraction_ratings),
      'sentAlerts', (
        SELECT COUNT(*)::INTEGER
        FROM public.alerts AS alerts
        CROSS JOIN bounds
        WHERE alerts.status = 'sent' AND alerts.sent_at >= bounds.since_at
      ),
      'alertsDelivered', COALESCE((
        SELECT SUM(delivered)::INTEGER FROM alert_activity_all
      ), 0),
      'alertsOpened', COALESCE((
        SELECT SUM(opened)::INTEGER FROM alert_activity_all
      ), 0)
    ) AS value
  )
  SELECT jsonb_build_object(
    'days', bounds.days,
    'generatedAt', NOW(),
    'summary', summary.value,
    'traffic', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', TO_CHAR(calendar.day, 'YYYY-MM-DD'),
          'pageViews', COALESCE(traffic_by_day.page_views, 0),
          'uniqueVisitors', COALESCE(traffic_by_day.unique_visitors, 0)
        ) ORDER BY calendar.day
      )
      FROM calendar
      LEFT JOIN traffic_by_day USING (day)
    ), '[]'::JSONB),
    'userGrowth', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', TO_CHAR(day, 'YYYY-MM-DD'),
          'newUsers', new_users,
          'totalUsers', total_users
        ) ORDER BY day
      )
      FROM user_growth_rows
    ), '[]'::JSONB),
    'ratingsTrend', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', TO_CHAR(calendar.day, 'YYYY-MM-DD'),
          'averageRating', COALESCE(ratings_by_day.average_rating, 0),
          'reviewCount', COALESCE(ratings_by_day.review_count, 0)
        ) ORDER BY calendar.day
      )
      FROM calendar
      LEFT JOIN ratings_by_day USING (day)
    ), '[]'::JSONB),
    'devices', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'deviceType', device_type,
          'pageViews', page_views,
          'uniqueVisitors', unique_visitors
        ) ORDER BY page_views DESC, device_type
      )
      FROM device_totals
    ), '[]'::JSONB),
    'topPages', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'path', page_path,
          'pageViews', page_views,
          'uniqueVisitors', unique_visitors
        ) ORDER BY page_views DESC, page_path
      )
      FROM popular_pages
    ), '[]'::JSONB),
    'popularDestinations', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'pageViews', page_views,
          'uniqueVisitors', unique_visitors
        ) ORDER BY page_views DESC, name
      )
      FROM popular_destinations
    ), '[]'::JSONB),
    'alertActivity', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'title', title,
          'category', category,
          'severity', severity,
          'sentAt', sent_at,
          'delivered', delivered,
          'opened', opened
        ) ORDER BY sent_at DESC
      )
      FROM alert_activity
    ), '[]'::JSONB),
    'staffActivity', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', COALESCE(full_name, email),
          'email', email,
          'role', user_type,
          'actionCount', action_count,
          'lastActivity', last_activity
        ) ORDER BY action_count DESC, last_activity DESC
      )
      FROM staff_activity
    ), '[]'::JSONB),
    'inquiryCategories', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('category', category, 'count', inquiry_count)
        ORDER BY inquiry_count DESC, category
      )
      FROM inquiry_categories
    ), '[]'::JSONB)
  )
  FROM bounds
  CROSS JOIN summary;
$$;

REVOKE ALL ON FUNCTION public.get_admin_analytics_report(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_report(INTEGER)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
