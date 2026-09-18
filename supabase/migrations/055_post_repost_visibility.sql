BEGIN;

ALTER TABLE public.info_user_posts
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE public.info_user_posts
  DROP CONSTRAINT IF EXISTS info_user_posts_visibility_check;

ALTER TABLE public.info_user_posts
  ADD CONSTRAINT info_user_posts_visibility_check
  CHECK (visibility IN ('public', 'followers', 'private'));

ALTER TABLE public.reposts
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE public.reposts
  DROP CONSTRAINT IF EXISTS reposts_visibility_check;

ALTER TABLE public.reposts
  ADD CONSTRAINT reposts_visibility_check
  CHECK (visibility IN ('public', 'followers', 'private'));

CREATE INDEX IF NOT EXISTS idx_info_user_posts_visibility
  ON public.info_user_posts(user_id, visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reposts_visibility
  ON public.reposts(user_id, visibility, created_at DESC);

COMMIT;
