BEGIN;

CREATE OR REPLACE FUNCTION public.notify_event_audience_of_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notification_type TEXT;
  notification_title TEXT;
  notification_message TEXT;
  notification_link TEXT;
  recipient_ids UUID[];
  event_path TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  event_path := '/info/visitor/events/' || NEW.id::TEXT;

  IF NEW.approval_status = 'approved'
    AND NEW.status = 'published'
    AND OLD.approval_status IS DISTINCT FROM 'approved' THEN
    notification_type := 'event';
    notification_title := 'New event is live';
    notification_message := format('"%s" has been approved and is now open to the community.', NEW.title);
    SELECT COALESCE(array_agg(users.id), ARRAY[]::UUID[])
      INTO recipient_ids
      FROM public.info_users AS users
     WHERE users.status = 'active'
       AND users.user_type IN ('tourist', 'business')
       AND users.id IS DISTINCT FROM NEW.created_by;
  ELSIF OLD.status = 'published'
    AND NEW.status = 'cancelled'
    AND OLD.approval_status = 'approved'
    AND NEW.approval_status = 'approved' THEN
    notification_type := 'event_cancelled';
    notification_title := 'Event cancelled';
    notification_message := format('"%s" has been cancelled. Open the event for details.', NEW.title);
    SELECT COALESCE(array_agg(audience.user_id), ARRAY[]::UUID[])
      INTO recipient_ids
      FROM (
        SELECT registrations.user_id
          FROM public.event_registrations AS registrations
         WHERE registrations.event_id = NEW.id
           AND registrations.status = 'confirmed'
           AND NOT EXISTS (
             SELECT 1
               FROM public.user_favorites AS favorites
              WHERE favorites.item_type = 'event'
                AND favorites.item_id = NEW.id
                AND favorites.user_id = registrations.user_id
           )
      ) AS audience
      JOIN public.info_users AS users
        ON users.id = audience.user_id
       AND users.status = 'active'
     WHERE users.id IS DISTINCT FROM NEW.created_by;
  ELSIF OLD.status = 'published'
    AND NEW.status = 'published'
    AND NEW.approval_status = 'approved'
    AND (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.location IS DISTINCT FROM OLD.location
      OR NEW.venue IS DISTINCT FROM OLD.venue
      OR NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date
      OR NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.end_time IS DISTINCT FROM OLD.end_time
      OR NEW.category IS DISTINCT FROM OLD.category
      OR NEW.organizer IS DISTINCT FROM OLD.organizer
      OR NEW.is_free IS DISTINCT FROM OLD.is_free
      OR NEW.ticket_price IS DISTINCT FROM OLD.ticket_price
      OR NEW.featured_image IS DISTINCT FROM OLD.featured_image
      OR NEW.images IS DISTINCT FROM OLD.images
      OR NEW.videos IS DISTINCT FROM OLD.videos
    ) THEN
    notification_type := 'event_update';
    notification_title := 'Event details updated';
    notification_message := format('Details for "%s" have changed. Open the event to review the latest information.', NEW.title);
    SELECT COALESCE(array_agg(audience.user_id), ARRAY[]::UUID[])
      INTO recipient_ids
      FROM (
        SELECT registrations.user_id
          FROM public.event_registrations AS registrations
         WHERE registrations.event_id = NEW.id
           AND registrations.status = 'confirmed'
           AND NOT EXISTS (
             SELECT 1
               FROM public.user_favorites AS favorites
              WHERE favorites.item_type = 'event'
                AND favorites.item_id = NEW.id
                AND favorites.user_id = registrations.user_id
           )
        UNION
        SELECT favorites.user_id
          FROM public.user_favorites AS favorites
         WHERE favorites.item_type = 'event'
           AND favorites.item_id = NEW.id
           AND NEW.start_date IS NOT DISTINCT FROM OLD.start_date
           AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
      ) AS audience
      JOIN public.info_users AS users
        ON users.id = audience.user_id
       AND users.status = 'active'
     WHERE users.id IS DISTINCT FROM NEW.created_by;
  ELSE
    RETURN NEW;
  END IF;

  IF COALESCE(cardinality(recipient_ids), 0) = 0 THEN
    RETURN NEW;
  END IF;

  notification_link := event_path || '?updated='
    || to_char(COALESCE(NEW.updated_at, now()) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSMS');

  INSERT INTO public.info_notifications (
    user_id, title, message, type, link, is_read, created_at, updated_at
  )
  SELECT recipients.user_id,
         notification_title,
         notification_message,
         notification_type,
         notification_link,
         FALSE,
         now(),
         now()
    FROM unnest(recipient_ids) AS recipients(user_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notify_event_audience_of_changes ON public.info_events;
CREATE TRIGGER tr_notify_event_audience_of_changes
  AFTER UPDATE ON public.info_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_event_audience_of_changes();

REVOKE ALL ON FUNCTION public.notify_event_audience_of_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_event_audience_of_changes() TO service_role;

COMMIT;
