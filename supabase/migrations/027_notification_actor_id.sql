BEGIN;

ALTER TABLE public.info_notifications
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_info_notifications_actor_id
  ON public.info_notifications(actor_id);

UPDATE public.info_notifications
SET actor_id = substring(link FROM '/user/profile/([0-9a-fA-F-]{36})')::UUID
WHERE actor_id IS NULL
  AND link ~ '^/user/profile/[0-9a-fA-F-]{36}(/|$)';

UPDATE public.info_notifications
SET actor_id = substring(link FROM '/user/messaging/([0-9a-fA-F-]{36})')::UUID
WHERE actor_id IS NULL
  AND link ~ '^/user/messaging/[0-9a-fA-F-]{36}(/|$)';

UPDATE public.info_notifications AS notification
SET actor_id = actor.id
FROM public.info_users AS actor
WHERE notification.actor_id IS NULL
  AND notification.message LIKE actor.full_name || ' %';

COMMIT;
