BEGIN;

ALTER TABLE public.attraction_ratings
  DROP CONSTRAINT IF EXISTS attraction_ratings_user_id_attraction_type_attraction_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS attraction_ratings_one_event_per_user
  ON public.attraction_ratings (user_id, attraction_type, attraction_id)
  WHERE attraction_type = 'event';

COMMIT;
