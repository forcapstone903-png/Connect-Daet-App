BEGIN;

ALTER TABLE public.reposts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.reposts
  DROP CONSTRAINT IF EXISTS reposts_status_check;

ALTER TABLE public.reposts
  ADD CONSTRAINT reposts_status_check CHECK (status IN ('active', 'archived'));

ALTER TABLE public.info_user_posts
  DROP CONSTRAINT IF EXISTS info_user_posts_status_check;

ALTER TABLE public.info_user_posts
  ADD CONSTRAINT info_user_posts_status_check
  CHECK (status IN ('draft', 'published', 'pending', 'flagged', 'archived'));

CREATE INDEX IF NOT EXISTS idx_reposts_user_status
  ON public.reposts(user_id, status, created_at DESC);

DROP POLICY IF EXISTS "reposts_update_own" ON public.reposts;
CREATE POLICY "reposts_update_own"
  ON public.reposts FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

COMMIT;
