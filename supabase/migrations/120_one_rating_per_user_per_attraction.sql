BEGIN;

LOCK TABLE public.attraction_ratings IN ACCESS EXCLUSIVE MODE;

WITH ranked_ratings AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, attraction_type, attraction_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS duplicate_number
  FROM public.attraction_ratings
)
DELETE FROM public.attraction_ratings AS rating
USING ranked_ratings
WHERE rating.id = ranked_ratings.id
  AND ranked_ratings.duplicate_number > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attraction_ratings_user_id_attraction_type_attraction_id_key'
      AND conrelid = 'public.attraction_ratings'::regclass
  ) THEN
    ALTER TABLE public.attraction_ratings
      ADD CONSTRAINT attraction_ratings_user_id_attraction_type_attraction_id_key
      UNIQUE (user_id, attraction_type, attraction_id);
  END IF;
END
$$;

DROP INDEX IF EXISTS public.attraction_ratings_one_event_per_user;

COMMIT;
