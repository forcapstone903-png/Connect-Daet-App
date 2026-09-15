BEGIN;

CREATE OR REPLACE FUNCTION public.notify_saved_event_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_record public.info_events%ROWTYPE;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  IF NEW.item_type <> 'event' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO event_record
  FROM public.info_events
  WHERE id = NEW.item_id;

  IF event_record.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF event_record.status = 'cancelled' THEN
    notification_title := 'Saved event cancelled';
    notification_message := format('%s has been cancelled.', event_record.title);
  ELSIF event_record.start_date IS NOT NULL AND event_record.start_date >= CURRENT_DATE THEN
    notification_title := 'Upcoming event saved';
    notification_message := format('%s is scheduled for %s.', event_record.title, to_char(event_record.start_date, 'Mon DD, YYYY'));
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.info_notifications (user_id, title, message, type, link)
  VALUES (NEW.user_id, notification_title, notification_message, 'event', format('/user/events/%s', event_record.id));

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_saved_event_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    notification_title := 'Saved event cancelled';
    notification_message := format('%s has been cancelled.', NEW.title);
  ELSIF (NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date)
    AND NEW.status <> 'cancelled'
    AND NEW.start_date IS NOT NULL THEN
    notification_title := 'Saved event rescheduled';
    notification_message := format('%s was rescheduled to %s.', NEW.title, to_char(NEW.start_date, 'Mon DD, YYYY'));
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.info_notifications (user_id, title, message, type, link)
  SELECT favorites.user_id, notification_title, notification_message, 'event', format('/user/events/%s', NEW.id)
  FROM public.user_favorites AS favorites
  WHERE favorites.item_type = 'event'
    AND favorites.item_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_saved_event_on_favorite ON public.user_favorites;
CREATE TRIGGER notify_saved_event_on_favorite
after INSERT ON public.user_favorites
FOR EACH ROW
EXECUTE FUNCTION public.notify_saved_event_users();

DROP TRIGGER IF EXISTS notify_saved_event_on_change ON public.info_events;
CREATE TRIGGER notify_saved_event_on_change
after UPDATE OF status, start_date, end_date ON public.info_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_saved_event_changes();

COMMIT;
