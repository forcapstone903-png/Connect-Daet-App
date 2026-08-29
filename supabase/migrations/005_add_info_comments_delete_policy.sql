BEGIN;

-- Allow comment authors (and admins) to delete their own blog comments,
-- enabling a Facebook-style "delete whenever you want" experience.
CREATE POLICY "info_comments_delete_own_or_admin"
ON public.info_comments
FOR DELETE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

COMMIT;