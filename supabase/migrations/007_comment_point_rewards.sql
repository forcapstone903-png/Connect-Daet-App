BEGIN;

-- Points can include fractional rewards such as 0.01 points per comment.
ALTER TABLE public.info_users
  ALTER COLUMN points TYPE NUMERIC(12, 2) USING points::NUMERIC(12, 2);

ALTER TABLE public.user_points
  ALTER COLUMN points TYPE NUMERIC(12, 2) USING points::NUMERIC(12, 2);

ALTER TABLE public.reward_history
  ALTER COLUMN points_earned TYPE NUMERIC(12, 2) USING points_earned::NUMERIC(12, 2);

CREATE TABLE IF NOT EXISTS public.comment_point_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  normalized_body TEXT NOT NULL,
  points NUMERIC(12, 2) NOT NULL DEFAULT 0.01,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content_type, content_id, normalized_body)
);

CREATE INDEX IF NOT EXISTS idx_comment_point_rewards_user
  ON public.comment_point_rewards(user_id, created_at DESC);

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
  -- Short, repeated, link-only, and rapid-fire comments do not earn points.
  IF char_length(normalized_comment_body) < 3
    OR normalized_comment_body ~ '^(.)\1{2,}$'
    OR normalized_comment_body ~ '^(https?://|www\.)'
  THEN
    RETURN;
  END IF;

  SELECT count(*)
    INTO recent_comments
    FROM public.comment_point_rewards
   WHERE user_id = p_user_id
     AND content_type = p_content_type
    AND content_id = p_content_id
    AND comment_point_rewards.created_at > NOW() - INTERVAL '10 minutes';

  IF recent_comments >= 3 THEN
    RETURN;
  END IF;

  INSERT INTO public.comment_point_rewards AS comment_reward (user_id, content_type, content_id, normalized_body, points)
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

CREATE OR REPLACE FUNCTION public.award_info_comment_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'approved' THEN
    PERFORM public.award_comment_points(NEW.user_id, 'blog', NEW.blog_id, NEW.content);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.award_comment_points(NEW.user_id, 'blog', NEW.blog_id, NEW.content);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_content_comment_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM public.award_comment_points(NEW.user_id, NEW.content_type, NEW.content_id, NEW.body);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_award_info_comment_points ON public.info_comments;
CREATE TRIGGER tr_award_info_comment_points
AFTER INSERT OR UPDATE OF status ON public.info_comments
FOR EACH ROW EXECUTE FUNCTION public.award_info_comment_points();

DROP TRIGGER IF EXISTS tr_award_content_comment_points ON public.content_comments;
CREATE TRIGGER tr_award_content_comment_points
AFTER INSERT ON public.content_comments
FOR EACH ROW EXECUTE FUNCTION public.award_content_comment_points();

ALTER TABLE public.comment_point_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_point_rewards_select_own_or_admin"
  ON public.comment_point_rewards FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

GRANT SELECT ON public.comment_point_rewards TO authenticated;

COMMIT;