BEGIN;

ALTER TABLE public.info_inquiries
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

COMMIT;