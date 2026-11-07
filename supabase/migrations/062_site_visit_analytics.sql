BEGIN;

CREATE TABLE IF NOT EXISTS public.site_page_views (
  visitor_hash TEXT NOT NULL CHECK (visitor_hash ~ '^[0-9a-f]{64}$'),
  page_path TEXT NOT NULL CHECK (
    length(page_path) <= 240
    AND page_path ~ '^/info/(visitor|search|tourist-spots|events|blog|forum)(/|$)'
  ),
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS site_page_views_viewed_at_idx
  ON public.site_page_views (viewed_at DESC);

CREATE INDEX IF NOT EXISTS site_page_views_visitor_viewed_at_idx
  ON public.site_page_views (visitor_hash, viewed_at DESC);

CREATE INDEX IF NOT EXISTS site_page_views_path_viewed_at_idx
  ON public.site_page_views (page_path, viewed_at DESC);

ALTER TABLE public.site_page_views ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.site_page_views FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.site_page_views TO service_role;

CREATE OR REPLACE FUNCTION public.record_site_page_view(
  p_visitor_hash TEXT,
  p_page_path TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_visitor_hash IS NULL
    OR p_page_path IS NULL
    OR p_visitor_hash !~ '^[0-9a-f]{64}$'
    OR length(p_page_path) > 240
    OR p_page_path !~ '^/info/(visitor|search|tourist-spots|events|blog|forum)(/|$)'
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

  INSERT INTO public.site_page_views (visitor_hash, page_path)
  VALUES (p_visitor_hash, p_page_path);

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_site_page_view(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_site_page_view(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.get_site_visit_metrics(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH settings AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_days, 30), 1), 90) AS days,
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
  visits AS (
    SELECT visitor_hash, page_path, viewed_at
    FROM public.site_page_views, bounds
    WHERE viewed_at >= bounds.since_at
  ),
  daily AS (
    SELECT
      (viewed_at AT TIME ZONE 'UTC')::DATE AS visit_day,
      COUNT(*)::INTEGER AS page_views,
      COUNT(DISTINCT visitor_hash)::INTEGER AS unique_visitors
    FROM visits
    GROUP BY (viewed_at AT TIME ZONE 'UTC')::DATE
  ),
  popular_pages AS (
    SELECT page_path, COUNT(*)::INTEGER AS page_views
    FROM visits
    GROUP BY page_path
    ORDER BY page_views DESC, page_path
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'days', bounds.days,
    'pageViews', (SELECT COUNT(*)::INTEGER FROM visits),
    'uniqueVisitors', (SELECT COUNT(DISTINCT visitor_hash)::INTEGER FROM visits),
    'daily', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'date', TO_CHAR(calendar.visit_day, 'YYYY-MM-DD'),
            'pageViews', COALESCE(daily.page_views, 0),
            'uniqueVisitors', COALESCE(daily.unique_visitors, 0)
          )
          ORDER BY calendar.visit_day
        ),
        '[]'::JSONB
      )
      FROM bounds
      CROSS JOIN LATERAL generate_series(
        bounds.first_day::TIMESTAMP,
        bounds.last_day::TIMESTAMP,
        INTERVAL '1 day'
      ) AS calendar(visit_day)
      LEFT JOIN daily ON daily.visit_day = calendar.visit_day::DATE
    ),
    'topPages', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('path', page_path, 'pageViews', page_views)
          ORDER BY page_views DESC, page_path
        ),
        '[]'::JSONB
      )
      FROM popular_pages
    )
  )
  FROM bounds;
$$;

REVOKE ALL ON FUNCTION public.get_site_visit_metrics(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_visit_metrics(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_site_page_views()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.site_page_views
  WHERE viewed_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_site_page_views() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_site_page_views() TO service_role;

COMMIT;
