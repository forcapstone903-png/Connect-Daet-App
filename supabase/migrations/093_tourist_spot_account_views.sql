BEGIN;

CREATE TABLE IF NOT EXISTS public.tourist_spot_account_views (
  tourist_spot_id UUID NOT NULL REFERENCES public.info_tourist_spots(id) ON DELETE CASCADE,
  account_hash TEXT NOT NULL CHECK (account_hash ~ '^[0-9a-f]{64}$'),
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tourist_spot_id, account_hash)
);

CREATE INDEX IF NOT EXISTS tourist_spot_account_views_last_viewed_idx
  ON public.tourist_spot_account_views (last_viewed_at DESC);

ALTER TABLE public.tourist_spot_account_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tourist_spot_account_views FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.tourist_spot_account_views TO service_role;

CREATE OR REPLACE FUNCTION public.record_tourist_spot_account_view(
  p_tourist_spot_id UUID,
  p_account_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  IF p_tourist_spot_id IS NULL
    OR p_account_hash IS NULL
    OR p_account_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid tourist spot account view';
  END IF;

  INSERT INTO public.tourist_spot_account_views (tourist_spot_id, account_hash)
  VALUES (p_tourist_spot_id, p_account_hash)
  ON CONFLICT (tourist_spot_id, account_hash) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    UPDATE public.tourist_spot_account_views
    SET last_viewed_at = NOW()
    WHERE tourist_spot_id = p_tourist_spot_id
      AND account_hash = p_account_hash;
  END IF;

  RETURN inserted_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tourist_spot_account_view_counts(p_days INTEGER DEFAULT 90)
RETURNS TABLE (tourist_spot_id UUID, view_count INTEGER)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH bounds AS (
    SELECT NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 90), 1), 90)) AS since_at
  )
  SELECT
    spots.id AS tourist_spot_id,
    COUNT(views.account_hash) FILTER (
      WHERE views.last_viewed_at >= (SELECT since_at FROM bounds)
    )::INTEGER AS view_count
  FROM public.info_tourist_spots AS spots
  LEFT JOIN public.tourist_spot_account_views AS views
    ON views.tourist_spot_id = spots.id
  GROUP BY spots.id;
$$;

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
      views.tourist_spot_id AS spot_id,
      COUNT(*)::INTEGER AS page_views
    FROM public.tourist_spot_account_views AS views
    CROSS JOIN bounds
    WHERE views.last_viewed_at >= bounds.since_at
    GROUP BY views.tourist_spot_id
  ),
  ranked_destinations AS (
    SELECT
      spots.id,
      spots.name,
      destination_views.page_views
    FROM destination_views
    JOIN public.info_tourist_spots AS spots
      ON spots.id = destination_views.spot_id
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
        'uniqueVisitors', page_views
      )
      ORDER BY page_views DESC, name
    ),
    '[]'::JSONB
  )
  FROM ranked_destinations;
$$;

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

  DELETE FROM public.tourist_spot_account_views
  WHERE last_viewed_at < NOW() - INTERVAL '90 days';

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tourist_spot_account_view(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tourist_spot_account_view(UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.get_tourist_spot_account_view_counts(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tourist_spot_account_view_counts(INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.get_popular_tourist_spots(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_popular_tourist_spots(INTEGER) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cleanup_site_page_views() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_site_page_views() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
