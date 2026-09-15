BEGIN;

CREATE OR REPLACE FUNCTION public.bridge_info_notification_to_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, url, created_at)
  VALUES (
    NEW.user_id,
    NEW.title,
    NEW.message,
    COALESCE(NEW.link, '/user/notifications'),
    COALESCE(NEW.created_at, NOW())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_info_notifications_push_bridge ON public.info_notifications;
CREATE TRIGGER trigger_info_notifications_push_bridge
AFTER INSERT ON public.info_notifications
FOR EACH ROW
EXECUTE FUNCTION public.bridge_info_notification_to_push();

COMMIT;
