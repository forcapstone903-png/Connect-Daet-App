BEGIN;

WITH RECURSIVE retired_comment_tree(id) AS (
  SELECT id
  FROM public.content_comments
  WHERE content_type = 'amenity'

  UNION

  SELECT child.id
  FROM public.content_comments AS child
  JOIN retired_comment_tree AS parent ON child.parent_id = parent.id
)
DELETE FROM public.content_reactions AS reaction
USING retired_comment_tree AS comment
WHERE reaction.content_type = 'comment'
  AND reaction.content_id = comment.id;

DELETE FROM public.content_reactions
WHERE content_type = 'amenity';

DELETE FROM public.content_shares
WHERE content_type = 'amenity';

DELETE FROM public.reposts
WHERE original_content_type = 'amenity';

DELETE FROM public.user_favorites
WHERE item_type = 'amenity';

DELETE FROM public.info_moderation
WHERE report_type = 'amenity'
   OR reported_item_table = 'info_amenities';

DELETE FROM public.review_helpfulness AS helpfulness
USING public.attraction_ratings AS rating
WHERE helpfulness.review_type = 'attraction_rating'
  AND helpfulness.review_id = rating.id
  AND rating.attraction_type = 'amenity';

DELETE FROM public.attraction_ratings
WHERE attraction_type = 'amenity';

DELETE FROM public.content_comments
WHERE content_type = 'amenity';

DROP TABLE IF EXISTS public.info_amenities;

ALTER TABLE public.content_reactions
  DROP CONSTRAINT IF EXISTS content_reactions_content_type_check;
ALTER TABLE public.content_reactions
  ADD CONSTRAINT content_reactions_content_type_check
  CHECK (content_type IN ('blog', 'event', 'forum_thread', 'forum_reply', 'comment', 'announcement', 'user_post', 'rating', 'poll'));

ALTER TABLE public.content_comments
  DROP CONSTRAINT IF EXISTS content_comments_content_type_check;
ALTER TABLE public.content_comments
  ADD CONSTRAINT content_comments_content_type_check
  CHECK (content_type IN ('blog', 'event', 'forum_thread', 'forum_reply', 'announcement', 'user_post', 'rating', 'poll'));

ALTER TABLE public.content_shares
  DROP CONSTRAINT IF EXISTS content_shares_content_type_check;
ALTER TABLE public.content_shares
  ADD CONSTRAINT content_shares_content_type_check
  CHECK (content_type IN ('blog', 'event', 'forum_thread', 'announcement', 'user_post'));

ALTER TABLE public.reposts
  DROP CONSTRAINT IF EXISTS reposts_original_content_type_check;
ALTER TABLE public.reposts
  ADD CONSTRAINT reposts_original_content_type_check
  CHECK (original_content_type IN ('blog', 'event', 'forum_thread', 'announcement', 'user_post'));

ALTER TABLE public.attraction_ratings
  DROP CONSTRAINT IF EXISTS attraction_ratings_attraction_type_check;
ALTER TABLE public.attraction_ratings
  ADD CONSTRAINT attraction_ratings_attraction_type_check
  CHECK (attraction_type IN ('tourist_spot', 'event'));

ALTER TABLE public.user_favorites
  DROP CONSTRAINT IF EXISTS user_favorites_item_type_check;
ALTER TABLE public.user_favorites
  ADD CONSTRAINT user_favorites_item_type_check
  CHECK (item_type IN ('blog', 'event', 'spot', 'forum', 'user_post', 'announcement'));

COMMIT;
