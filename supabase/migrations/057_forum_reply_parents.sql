BEGIN;

-- Nested forum replies (parent/child reply tree).
-- This content was first written as 046_forum_reply_parents.sql, but version 046
-- was already recorded in the remote migration history by
-- 046_saved_event_notifications.sql, so the ALTER never ran and
-- forum_replies.parent_reply_id was missing in the database. Renumbering it here
-- (and dropping the duplicate 046 file) applies it and keeps future
-- `supabase db push` runs free of duplicate versions.
ALTER TABLE public.forum_replies
  ADD COLUMN IF NOT EXISTS parent_reply_id UUID REFERENCES public.forum_replies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_forum_replies_parent_reply_id
  ON public.forum_replies(parent_reply_id);

COMMIT;
