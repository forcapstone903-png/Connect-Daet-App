BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'info_user_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.info_user_posts;
  END IF;
END;
$$;

COMMIT;
