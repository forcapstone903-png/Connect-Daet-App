BEGIN;

ALTER TABLE public.info_notifications
  ADD COLUMN IF NOT EXISTS post_owner_id UUID,
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES public.content_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_id UUID REFERENCES public.content_comments(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;