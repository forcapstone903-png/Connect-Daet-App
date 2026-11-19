BEGIN;

ALTER TABLE public.attraction_ratings
  ALTER COLUMN rating DROP NOT NULL;

DROP FUNCTION IF EXISTS public.get_tourist_spot_rating_summary(UUID);

CREATE FUNCTION public.get_tourist_spot_rating_summary(p_attraction_id UUID)
RETURNS TABLE (
  total_count BIGINT,
  average_rating NUMERIC,
  five_star_count BIGINT,
  four_star_count BIGINT,
  three_star_count BIGINT,
  two_star_count BIGINT,
  one_star_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    COUNT(rating),
    ROUND(AVG(rating)::NUMERIC, 1),
    COUNT(*) FILTER (WHERE rating = 5),
    COUNT(*) FILTER (WHERE rating = 4),
    COUNT(*) FILTER (WHERE rating = 3),
    COUNT(*) FILTER (WHERE rating = 2),
    COUNT(*) FILTER (WHERE rating = 1)
  FROM public.attraction_ratings
  WHERE attraction_type = 'tourist_spot'
    AND attraction_id = p_attraction_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_tourist_spot_rating_summary(UUID) TO anon, authenticated;

COMMIT;