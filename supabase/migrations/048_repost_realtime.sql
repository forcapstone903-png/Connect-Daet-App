BEGIN;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reposts;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END;
$$;

COMMIT;