BEGIN;

CREATE INDEX IF NOT EXISTS idx_attraction_ratings_tourist_spot_recent
  ON public.attraction_ratings(attraction_id, created_at DESC)
  WHERE attraction_type = 'tourist_spot';

ALTER TABLE public.attraction_ratings
  DROP CONSTRAINT IF EXISTS attraction_ratings_tourist_spot_review_not_empty;

ALTER TABLE public.attraction_ratings
  ADD CONSTRAINT attraction_ratings_tourist_spot_review_not_empty
  CHECK (
    attraction_type <> 'tourist_spot'
    OR COALESCE(NULLIF(BTRIM(review_text), '') IS NOT NULL, FALSE)
  ) NOT VALID;

DROP POLICY IF EXISTS "attraction_ratings_delete_own" ON public.attraction_ratings;
CREATE POLICY "attraction_ratings_delete_own"
  ON public.attraction_ratings
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "review_helpfulness_update_own" ON public.review_helpfulness;
CREATE POLICY "review_helpfulness_update_own"
  ON public.review_helpfulness
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_tourist_spot_rating_summary(p_attraction_id UUID)
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
    COUNT(*),
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

CREATE OR REPLACE FUNCTION public.refresh_tourist_spot_rating_summary(p_spot_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_average NUMERIC;
BEGIN
  PERFORM 1
  FROM public.info_tourist_spots
  WHERE id = p_spot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER, COALESCE(AVG(rating), 0)::NUMERIC
  INTO v_count, v_average
  FROM public.attraction_ratings
  WHERE attraction_type = 'tourist_spot'
    AND attraction_id = p_spot_id;

  UPDATE public.info_tourist_spots
  SET rating = ROUND(v_average, 2),
      review_count = v_count
  WHERE id = p_spot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_tourist_spot_rating_summary(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_tourist_spot_rating_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.attraction_type = 'tourist_spot' THEN
      PERFORM public.refresh_tourist_spot_rating_summary(NEW.attraction_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.attraction_type = 'tourist_spot' THEN
      PERFORM public.refresh_tourist_spot_rating_summary(OLD.attraction_id);
      DELETE FROM public.review_helpfulness
      WHERE review_type = 'attraction_rating'
        AND review_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.attraction_type = 'tourist_spot' THEN
    PERFORM public.refresh_tourist_spot_rating_summary(OLD.attraction_id);
  END IF;
  IF NEW.attraction_type = 'tourist_spot'
    AND (
      OLD.attraction_type IS DISTINCT FROM NEW.attraction_type
      OR OLD.attraction_id IS DISTINCT FROM NEW.attraction_id
    )
  THEN
    PERFORM public.refresh_tourist_spot_rating_summary(NEW.attraction_id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_tourist_spot_rating_summary() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_sync_tourist_spot_rating_summary ON public.attraction_ratings;
CREATE TRIGGER tr_sync_tourist_spot_rating_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.attraction_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tourist_spot_rating_summary();

UPDATE public.info_tourist_spots AS spot
SET rating = COALESCE(aggregates.average_rating, 0),
    review_count = COALESCE(aggregates.total_count, 0)
FROM (
  SELECT
    attraction_id,
    ROUND(AVG(rating), 2) AS average_rating,
    COUNT(*)::INTEGER AS total_count
  FROM public.attraction_ratings
  WHERE attraction_type = 'tourist_spot'
  GROUP BY attraction_id
) AS aggregates
WHERE spot.id = aggregates.attraction_id;

UPDATE public.info_tourist_spots AS spot
SET rating = 0,
    review_count = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.attraction_ratings AS rating
  WHERE rating.attraction_type = 'tourist_spot'
    AND rating.attraction_id = spot.id
);

COMMIT;
