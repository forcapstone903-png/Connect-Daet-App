BEGIN;

-- Refresh the reward function before the backfill triggers it. Older databases
-- may still have the ambiguous normalized_body variable from migration 007.
CREATE OR REPLACE FUNCTION public.award_comment_points(
  p_user_id UUID,
  p_content_type TEXT,
  p_content_id UUID,
  p_body TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_comment_body TEXT := lower(regexp_replace(trim(coalesce(p_body, '')), '\s+', ' ', 'g'));
  recent_comments INTEGER;
  reward_points NUMERIC(12, 2) := 0.01;
BEGIN
  IF char_length(normalized_comment_body) < 3
    OR normalized_comment_body ~ '^(.)\1{2,}$'
    OR normalized_comment_body ~ '^(https?://|www\.)'
  THEN
    RETURN;
  END IF;

  SELECT count(*)
    INTO recent_comments
    FROM public.comment_point_rewards AS existing_reward
   WHERE existing_reward.user_id = p_user_id
     AND existing_reward.content_type = p_content_type
     AND existing_reward.content_id = p_content_id
     AND existing_reward.created_at > NOW() - INTERVAL '10 minutes';

  IF recent_comments >= 3 THEN
    RETURN;
  END IF;

  INSERT INTO public.comment_point_rewards (user_id, content_type, content_id, normalized_body, points)
  VALUES (p_user_id, p_content_type, p_content_id, normalized_comment_body, reward_points)
  ON CONFLICT (user_id, content_type, content_id, normalized_body) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.info_users
     SET points = COALESCE(points, 0) + reward_points,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.user_points (user_id, points, reason, source)
  VALUES (p_user_id, reward_points, 'Comment reward', 'comment');

  INSERT INTO public.reward_history (user_id, subsystem_source, points_earned, description)
  VALUES (p_user_id, 'comment', reward_points, 'Earned for a helpful comment');
END;
$$;

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

  INSERT INTO public.content_comments (id, content_type, content_id, user_id, body, status, created_at, updated_at)
  VALUES (NEW.id, 'blog', NEW.blog_id, NEW.user_id, NEW.content, mapped_status, NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET
    content_id = EXCLUDED.content_id,
    user_id = EXCLUDED.user_id,
    body = EXCLUDED.body,
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

  INSERT INTO public.info_comments (id, blog_id, user_id, content, status, created_at, updated_at)
  VALUES (NEW.id, NEW.content_id, NEW.user_id, NEW.body, mapped_status, NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET
    blog_id = EXCLUDED.blog_id,
    user_id = EXCLUDED.user_id,
    content = EXCLUDED.content,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_info_comment_to_content ON public.info_comments;
CREATE TRIGGER tr_sync_info_comment_to_content
AFTER INSERT OR UPDATE OR DELETE ON public.info_comments
FOR EACH ROW EXECUTE FUNCTION public.sync_info_comment_to_content();

DROP TRIGGER IF EXISTS tr_sync_content_comment_to_info ON public.content_comments;
CREATE TRIGGER tr_sync_content_comment_to_info
AFTER INSERT OR UPDATE OR DELETE ON public.content_comments
FOR EACH ROW EXECUTE FUNCTION public.sync_content_comment_to_info();

INSERT INTO public.content_comments (id, content_type, content_id, user_id, body, status, created_at, updated_at)
SELECT id,
       'blog',
       blog_id,
       user_id,
       content,
       CASE status WHEN 'approved' THEN 'active' WHEN 'pending' THEN 'hidden' ELSE 'deleted' END,
       created_at,
       updated_at
  FROM public.info_comments
ON CONFLICT (id) DO NOTHING;

COMMIT;
