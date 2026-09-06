BEGIN;

-- Keep the profile fields written by onboarding and profile settings in sync with the schema.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS privacy_level TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS language_preference TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Authenticated users may discover active, non-admin community accounts.
CREATE POLICY "info_users_select_active_public"
  ON public.info_users FOR SELECT
  USING (
    (status = 'active' AND user_type <> 'admin')
    OR auth.uid() = id
    OR public.is_admin(auth.uid())
  );

-- Published user posts are part of the social feed; drafts and flagged posts remain private.
CREATE POLICY "info_user_posts_select_published_public"
  ON public.info_user_posts FOR SELECT
  USING (
    (status = 'published' AND auth.uid() IS NOT NULL)
    OR auth.uid() = user_id
    OR public.is_admin(auth.uid())
  );

-- Keep the legacy blog aggregate in sync with the per-user reaction system.
CREATE OR REPLACE FUNCTION public.sync_blog_reaction_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_blog_id UUID;
BEGIN
  affected_blog_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.content_id ELSE NEW.content_id END;

  IF (CASE WHEN TG_OP = 'DELETE' THEN OLD.content_type ELSE NEW.content_type END) = 'blog' THEN
    UPDATE public.info_blogs
       SET likes = (
         SELECT count(*)
           FROM public.content_reactions
          WHERE content_type = 'blog'
            AND content_id = affected_blog_id
       ),
           updated_at = NOW()
     WHERE id = affected_blog_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_blog_reaction_count ON public.content_reactions;
CREATE TRIGGER tr_sync_blog_reaction_count
AFTER INSERT OR UPDATE OR DELETE ON public.content_reactions
FOR EACH ROW EXECUTE FUNCTION public.sync_blog_reaction_count();

COMMIT;