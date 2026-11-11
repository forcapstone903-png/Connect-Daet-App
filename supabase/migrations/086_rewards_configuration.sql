BEGIN;

ALTER TABLE public.admin_app_settings
  DROP CONSTRAINT IF EXISTS admin_app_settings_id_check;

ALTER TABLE public.admin_app_settings
  ADD CONSTRAINT admin_app_settings_id_check
  CHECK (id IN ('general', 'moderation', 'announcement', 'rewards'));

INSERT INTO public.admin_app_settings (id, value)
VALUES (
  'rewards',
  '{
    "actions": {
      "approved_community_post": {"label": "Approved community post", "enabled": true, "points": 10},
      "approved_blog": {"label": "Approved blog post", "enabled": true, "points": 10},
      "comment": {"label": "Helpful comment", "enabled": true, "points": 0.01}
    },
    "rewards": [
      {"id": "local-food-voucher", "title": "Local food voucher", "description": "", "points": 500, "enabled": true},
      {"id": "weekend-attraction-pass", "title": "Weekend attraction pass", "description": "", "points": 900, "enabled": true},
      {"id": "community-souvenir-pack", "title": "Community souvenir pack", "description": "", "points": 1400, "enabled": true}
    ],
    "milestones": [
      {"name": "First Visit", "description": "Joined the community", "points": 0},
      {"name": "Explorer", "description": "Reach 120 points", "points": 120},
      {"name": "Top Contributor", "description": "Reach 350 points", "points": 350},
      {"name": "Community Guide", "description": "Reach 800 points", "points": 800},
      {"name": "Local Legend", "description": "Reach 1,500 points", "points": 1500}
    ]
  }'::JSONB
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.info_user_posts
  DROP CONSTRAINT IF EXISTS info_user_posts_status_check;

ALTER TABLE public.info_user_posts
  ADD CONSTRAINT info_user_posts_status_check
  CHECK (status IN ('draft', 'published', 'pending', 'flagged', 'archived', 'approved', 'rejected'));

CREATE TABLE IF NOT EXISTS public.reward_point_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  points NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (action_key, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  reward_id TEXT NOT NULL,
  reward_title TEXT NOT NULL,
  points_spent INTEGER NOT NULL CHECK (points_spent > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, reward_id)
);

ALTER TABLE public.reward_point_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_point_awards, public.reward_redemptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.reward_point_awards TO service_role;
GRANT SELECT, INSERT ON TABLE public.reward_redemptions TO service_role;

CREATE OR REPLACE FUNCTION public.award_configured_points(
  p_user_id UUID,
  p_action_key TEXT,
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  action_settings JSONB;
  reward_points NUMERIC(12, 2);
  award_id UUID;
BEGIN
  SELECT value->'actions'->p_action_key
    INTO action_settings
    FROM public.admin_app_settings
   WHERE id = 'rewards';

  IF COALESCE((action_settings->>'enabled')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RETURN;
  END IF;

  reward_points := COALESCE(NULLIF(action_settings->>'points', '')::NUMERIC, 0);
  IF reward_points <= 0 OR reward_points > 1000 THEN
    RETURN;
  END IF;

  INSERT INTO public.reward_point_awards (user_id, action_key, entity_type, entity_id, points)
  VALUES (p_user_id, p_action_key, p_entity_type, p_entity_id, reward_points)
  ON CONFLICT (action_key, entity_type, entity_id) DO NOTHING
  RETURNING id INTO award_id;

  IF award_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.info_users
     SET points = COALESCE(points, 0) + reward_points,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.user_points (user_id, points, reason, source)
  VALUES (p_user_id, reward_points, 'Approved content reward', p_action_key);

  INSERT INTO public.reward_history (user_id, subsystem_source, points_earned, description)
  VALUES (p_user_id, p_action_key, reward_points, 'Earned for ' || replace(p_action_key, '_', ' '));
END;
$$;

REVOKE ALL ON FUNCTION public.award_configured_points(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_info_user_post_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('approved', 'rejected')
    AND auth.role() = 'authenticated'
    AND NOT public.is_admin(auth.uid()) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Only an administrator can approve or reject community posts';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Only an administrator can approve or reject community posts';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS info_user_posts_guard_moderation ON public.info_user_posts;
CREATE TRIGGER info_user_posts_guard_moderation
  BEFORE INSERT OR UPDATE ON public.info_user_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_info_user_post_moderation();

CREATE OR REPLACE FUNCTION public.award_info_user_post_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.award_configured_points(NEW.user_id, 'approved_community_post', 'info_user_posts', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS info_user_posts_award_approval_points ON public.info_user_posts;
CREATE TRIGGER info_user_posts_award_approval_points
  AFTER UPDATE OF status ON public.info_user_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.award_info_user_post_approval();

CREATE OR REPLACE FUNCTION public.award_info_blog_approval_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.approval_status = 'approved' AND OLD.approval_status IS DISTINCT FROM NEW.approval_status
    AND NEW.created_by IS NOT NULL THEN
    PERFORM public.award_configured_points(NEW.created_by, 'approved_blog', 'info_blogs', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS info_blogs_award_approval_points ON public.info_blogs;
CREATE TRIGGER info_blogs_award_approval_points
  AFTER UPDATE OF approval_status ON public.info_blogs
  FOR EACH ROW
  EXECUTE FUNCTION public.award_info_blog_approval_points();

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
  reward_points NUMERIC(12, 2);
  reward_enabled BOOLEAN;
BEGIN
  IF char_length(normalized_comment_body) < 3
    OR normalized_comment_body ~ '^(.)\1{2,}$'
    OR normalized_comment_body ~ '^(https?://|www\.)'
  THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(NULLIF(value #>> '{actions,comment,points}', '')::NUMERIC, 0.01),
    COALESCE(NULLIF(value #>> '{actions,comment,enabled}', '')::BOOLEAN, TRUE)
  INTO reward_points, reward_enabled
  FROM public.admin_app_settings
  WHERE id = 'rewards';

  reward_points := COALESCE(reward_points, 0.01);
  reward_enabled := COALESCE(reward_enabled, TRUE);
  IF reward_enabled IS NOT TRUE OR reward_points <= 0 OR reward_points > 1000 THEN
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

CREATE OR REPLACE FUNCTION public.redeem_configured_reward(
  p_user_id UUID,
  p_reward_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reward_config JSONB;
  reward_title TEXT;
  points_required INTEGER;
  current_points NUMERIC(12, 2);
  next_points NUMERIC(12, 2);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Authenticated rewards service access is required';
  END IF;

  SELECT points
    INTO current_points
    FROM public.info_users
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'code', 'user_not_found');
  END IF;

  SELECT redemption.reward_title
    INTO reward_title
    FROM public.reward_redemptions AS redemption
   WHERE redemption.user_id = p_user_id
     AND redemption.reward_id = p_reward_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'code', 'already_redeemed');
  END IF;

  SELECT entry
    INTO reward_config
    FROM public.admin_app_settings AS settings
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(settings.value->'rewards', '[]'::JSONB)) AS reward_items(entry)
   WHERE settings.id = 'rewards'
     AND entry->>'id' = p_reward_id
     AND COALESCE((entry->>'enabled')::BOOLEAN, FALSE);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'code', 'reward_unavailable');
  END IF;

  reward_title := BTRIM(reward_config->>'title');
  points_required := NULLIF(reward_config->>'points', '')::INTEGER;
  IF reward_title IS NULL OR reward_title = '' OR points_required IS NULL OR points_required <= 0 THEN
    RETURN jsonb_build_object('success', FALSE, 'code', 'reward_unavailable');
  END IF;

  current_points := COALESCE(current_points, 0);
  IF current_points < points_required THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'code', 'insufficient_points',
      'missing_points', points_required - current_points
    );
  END IF;

  next_points := current_points - points_required;
  UPDATE public.info_users
     SET points = next_points,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.reward_redemptions (user_id, reward_id, reward_title, points_spent)
  VALUES (p_user_id, p_reward_id, reward_title, points_required);

  INSERT INTO public.user_points (user_id, points, reason, source)
  VALUES (p_user_id, -points_required, 'Redeemed ' || reward_title, 'reward_redemption');

  INSERT INTO public.reward_history (user_id, points_earned, subsystem_source, description)
  VALUES (p_user_id, -points_required, 'reward_redemption', reward_title);

  RETURN jsonb_build_object(
    'success', TRUE,
    'points', next_points,
    'title', reward_title,
    'points_spent', points_required
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_configured_reward(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_configured_reward(UUID, TEXT) TO service_role;

COMMIT;
