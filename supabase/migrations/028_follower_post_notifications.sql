BEGIN;

-- Keep the oldest notification when older code already created duplicates.
DELETE FROM public.info_notifications older
USING public.info_notifications newer
WHERE older.user_id = newer.user_id
  AND older.link IS NOT NULL
  AND older.link = newer.link
  AND older.type = newer.type
  AND (older.created_at > newer.created_at OR (older.created_at = newer.created_at AND older.id > newer.id));

CREATE UNIQUE INDEX IF NOT EXISTS idx_info_notifications_recipient_link_type
  ON public.info_notifications(user_id, link, type)
  WHERE link IS NOT NULL;

COMMIT;