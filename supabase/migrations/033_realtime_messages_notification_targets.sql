BEGIN;

ALTER TABLE public.info_notifications
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES public.content_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_id UUID REFERENCES public.content_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_info_notifications_comment_id
  ON public.info_notifications(comment_id)
  WHERE comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_info_notifications_reply_id
  ON public.info_notifications(reply_id)
  WHERE reply_id IS NOT NULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.content_comments;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END;
$$;

COMMIT;
