BEGIN;

CREATE OR REPLACE FUNCTION public.sync_info_comment_to_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mapped_status TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.content_comments WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  mapped_status := CASE NEW.status WHEN 'approved' THEN 'active' WHEN 'pending' THEN 'hidden' ELSE 'deleted' END;

  INSERT INTO public.content_comments (id, content_type, content_id, user_id, body, mention_data, status, created_at, updated_at)
  VALUES (NEW.id, 'blog', NEW.blog_id, NEW.user_id, NEW.content, COALESCE(NEW.mention_data, '[]'::jsonb), mapped_status, NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET
    content_id = EXCLUDED.content_id,
    user_id = EXCLUDED.user_id,
    body = EXCLUDED.body,
    mention_data = EXCLUDED.mention_data,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_content_comment_to_info()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mapped_status TEXT;
BEGIN
  IF NEW.content_type <> 'blog' OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.info_comments WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  mapped_status := CASE NEW.status WHEN 'active' THEN 'approved' WHEN 'hidden' THEN 'pending' ELSE 'rejected' END;

  INSERT INTO public.info_comments (id, blog_id, user_id, content, mention_data, status, created_at, updated_at)
  VALUES (NEW.id, NEW.content_id, NEW.user_id, NEW.body, COALESCE(NEW.mention_data, '[]'::jsonb), mapped_status, NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET
    blog_id = EXCLUDED.blog_id,
    user_id = EXCLUDED.user_id,
    content = EXCLUDED.content,
    mention_data = EXCLUDED.mention_data,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

UPDATE public.content_comments AS content_comment
SET mention_data = COALESCE(info_comment.mention_data, '[]'::jsonb)
FROM public.info_comments AS info_comment
WHERE content_comment.id = info_comment.id;

UPDATE public.info_comments AS info_comment
SET mention_data = COALESCE(content_comment.mention_data, '[]'::jsonb)
FROM public.content_comments AS content_comment
WHERE info_comment.id = content_comment.id;

NOTIFY pgrst, 'reload schema';

COMMIT;
