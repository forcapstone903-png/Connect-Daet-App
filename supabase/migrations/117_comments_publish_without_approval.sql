BEGIN;

CREATE OR REPLACE FUNCTION public.hold_user_content_for_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  old_data JSONB;
  new_data JSONB := to_jsonb(NEW);
  content_changed BOOLEAN := FALSE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR current_user_id IS NULL
     OR public.is_admin(current_user_id) OR public.is_moderator(current_user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'forum_replies' THEN
    IF EXISTS (
      SELECT 1 FROM public.forum_threads
      WHERE id = NEW.thread_id AND status = 'closed'
    ) THEN
      RAISE EXCEPTION 'This forum thread is locked and no longer accepts replies.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('forum_replies', 'content_comments', 'info_comments') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := CASE TG_TABLE_NAME
        WHEN 'info_comments' THEN 'approved'
        ELSE 'active'
      END;
    ELSE
      NEW.status := OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME IN ('info_user_posts', 'forum_threads')
       AND NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;
    NEW.status := 'pending';
    RETURN NEW;
  END IF;

  old_data := to_jsonb(OLD);
  content_changed :=
    COALESCE(old_data->>'title', '') IS DISTINCT FROM COALESCE(new_data->>'title', '')
    OR COALESCE(old_data->>'content', '') IS DISTINCT FROM COALESCE(new_data->>'content', '')
    OR COALESCE(old_data->>'body', '') IS DISTINCT FROM COALESCE(new_data->>'body', '')
    OR COALESCE(old_data->>'excerpt', '') IS DISTINCT FROM COALESCE(new_data->>'excerpt', '');

  IF content_changed OR OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.info_comments
   SET status = 'approved'
 WHERE status = 'pending';

UPDATE public.content_comments
   SET status = 'active'
 WHERE status = 'pending';

UPDATE public.forum_replies
   SET status = 'active'
 WHERE status = 'pending';

UPDATE public.admin_app_settings
   SET value = jsonb_set(
     value,
     '{content}',
     to_jsonb(replace(
       value->>'content',
       'Submitted blogs, forum posts, replies, and comments are reviewed by moderators before publication.',
       'Submitted blogs, community posts, and forum topics are reviewed by moderators before publication. Comments and replies publish immediately. Reported content may be reviewed by moderators.'
     )),
     true
   )
 WHERE id = 'community-guidelines'
   AND value->>'content' LIKE '%Submitted blogs, forum posts, replies, and comments are reviewed by moderators before publication.%';

NOTIFY pgrst, 'reload schema';

COMMIT;
