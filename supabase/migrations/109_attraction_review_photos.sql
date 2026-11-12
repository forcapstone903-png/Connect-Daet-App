BEGIN;

ALTER TABLE public.attraction_ratings
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE public.attraction_ratings
  DROP CONSTRAINT IF EXISTS attraction_ratings_photo_url_length;

ALTER TABLE public.attraction_ratings
  ADD CONSTRAINT attraction_ratings_photo_url_length
  CHECK (photo_url IS NULL OR char_length(photo_url) <= 2048);

COMMIT;
