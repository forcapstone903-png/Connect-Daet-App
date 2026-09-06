BEGIN;

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_follows_select_authenticated ON public.user_follows;
CREATE POLICY user_follows_select_authenticated
  ON public.user_follows FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS user_follows_insert_own ON public.user_follows;
CREATE POLICY user_follows_insert_own
  ON public.user_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id AND follower_id <> following_id);

DROP POLICY IF EXISTS user_follows_delete_own ON public.user_follows;
CREATE POLICY user_follows_delete_own
  ON public.user_follows FOR DELETE
  USING (auth.uid() = follower_id);

DROP POLICY IF EXISTS user_points_insert_admin_or_own ON public.user_points;
CREATE POLICY user_points_insert_admin_only
  ON public.user_points FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.user_favorites
  DROP CONSTRAINT IF EXISTS user_favorites_item_type_check;

ALTER TABLE public.user_favorites
  ADD CONSTRAINT user_favorites_item_type_check
  CHECK (item_type IN ('blog', 'event', 'amenity', 'spot', 'forum', 'user_post', 'announcement'));

COMMIT;
