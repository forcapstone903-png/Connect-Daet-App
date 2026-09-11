BEGIN;

-- Keep one notification per recipient, related post/comment, type, and actor.
-- This allows multiple users to notify the same post owner while making
-- repeated processing of one reaction event harmless.
DELETE FROM public.info_notifications older
USING public.info_notifications newer
WHERE older.user_id = newer.user_id
  AND older.link IS NOT NULL
  AND older.link = newer.link
  AND older.type = newer.type
  AND older.actor_id IS NOT NULL
  AND older.actor_id = newer.actor_id
  AND (older.created_at > newer.created_at OR (older.created_at = newer.created_at AND older.id > newer.id));

DROP INDEX IF EXISTS public.idx_info_notifications_recipient_link_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_info_notifications_recipient_link_type_actor
  ON public.info_notifications(user_id, link, type, actor_id)
  WHERE link IS NOT NULL AND actor_id IS NOT NULL;

COMMIT;
