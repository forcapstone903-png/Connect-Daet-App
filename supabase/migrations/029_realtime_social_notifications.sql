BEGIN;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.info_notifications;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.content_reactions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END;
$$;

COMMIT;