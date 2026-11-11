BEGIN;

CREATE OR REPLACE FUNCTION public.get_popular_tourist_spots(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH bounds AS (
    SELECT NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 90)) AS since_at
  ),
  destination_views AS (
    SELECT
      split_part(views.page_path, '/tourist-spots/', 2) AS spot_id,
      COUNT(DISTINCT views.visitor_hash)::INTEGER AS page_views,
      COUNT(DISTINCT views.visitor_hash)::INTEGER AS unique_visitors
    FROM public.site_page_views AS views
    CROSS JOIN bounds
    WHERE views.viewed_at >= bounds.since_at
      AND views.page_path ~ '^/info/visitor/tourist-spots/[^/]+$'
    GROUP BY split_part(views.page_path, '/tourist-spots/', 2)
  ),
  ranked_destinations AS (
    SELECT
      spots.id,
      spots.name,
      destination_views.page_views,
      destination_views.unique_visitors
    FROM destination_views
    JOIN public.info_tourist_spots AS spots
      ON spots.id::TEXT = destination_views.spot_id
    WHERE spots.status = 'active'
    ORDER BY destination_views.page_views DESC, spots.name
    LIMIT 5
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'pageViews', page_views,
        'uniqueVisitors', unique_visitors
      )
      ORDER BY page_views DESC, name
    ),
    '[]'::JSONB
  )
  FROM ranked_destinations;
$$;

REVOKE ALL ON FUNCTION public.get_popular_tourist_spots(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_popular_tourist_spots(INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
