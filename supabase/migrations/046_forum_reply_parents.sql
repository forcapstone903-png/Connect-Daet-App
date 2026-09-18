BEGIN;

ALTER TABLE public.forum_replies
  ADD COLUMN IF NOT EXISTS parent_reply_id UUID REFERENCES public.forum_replies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_forum_replies_parent_reply_id
  ON public.forum_replies(parent_reply_id);

COMMIT;
