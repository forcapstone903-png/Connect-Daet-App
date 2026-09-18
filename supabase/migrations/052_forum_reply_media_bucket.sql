BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

COMMIT;