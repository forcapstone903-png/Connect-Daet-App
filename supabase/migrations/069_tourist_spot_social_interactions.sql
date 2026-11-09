BEGIN;

ALTER TABLE public.content_reactions
  DROP CONSTRAINT IF EXISTS content_reactions_content_type_check;

ALTER TABLE public.content_reactions
  ADD CONSTRAINT content_reactions_content_type_check
  CHECK (content_type IN ('blog', 'event', 'forum_thread', 'forum_reply', 'comment', 'announcement', 'user_post', 'rating', 'poll', 'tourist_spot'));

ALTER TABLE public.content_comments
  DROP CONSTRAINT IF EXISTS content_comments_content_type_check;

ALTER TABLE public.content_comments
  ADD CONSTRAINT content_comments_content_type_check
  CHECK (content_type IN ('blog', 'event', 'forum_thread', 'forum_reply', 'announcement', 'user_post', 'rating', 'poll', 'tourist_spot'));

COMMIT;
