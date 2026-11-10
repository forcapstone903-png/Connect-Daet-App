BEGIN;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.info_announcements,
                 public.info_events,
                 public.info_tourist_spots,
                 public.forum_threads,
                 public.forum_replies;
  EXCEPTION WHEN duplicate_object THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'info_announcements'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.info_announcements;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'info_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.info_events;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'info_tourist_spots'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.info_tourist_spots;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'forum_threads'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_threads;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'forum_replies'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_replies;
    END IF;
  END;
END;
$$;

DROP POLICY IF EXISTS "info_announcements_select_public" ON public.info_announcements;
CREATE POLICY "info_announcements_select_public" ON public.info_announcements
FOR SELECT
USING (
  (
    status = 'published'
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (
      audience IN ('all', 'tourists')
      OR (
        audience = 'businesses'
        AND EXISTS (
          SELECT 1
          FROM public.info_users AS recipient
          WHERE recipient.id = auth.uid()
            AND recipient.user_type = 'business'
        )
      )
    )
  )
  OR public.is_admin(auth.uid())
);

COMMIT;
