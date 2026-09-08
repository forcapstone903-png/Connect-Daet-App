BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('announcements', 'announcements', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

COMMIT;