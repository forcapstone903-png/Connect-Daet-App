BEGIN;

DROP POLICY IF EXISTS info_user_posts_delete_own_or_admin ON public.info_user_posts;
CREATE POLICY info_user_posts_delete_own_or_admin
  ON public.info_user_posts FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS info_user_posts_update_own_or_admin ON public.info_user_posts;
CREATE POLICY info_user_posts_update_own_or_admin
  ON public.info_user_posts FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS reposts_update_own ON public.reposts;
CREATE POLICY reposts_update_own
  ON public.reposts FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

COMMIT;