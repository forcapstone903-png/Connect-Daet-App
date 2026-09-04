BEGIN;

-- ============================================================
-- Allow users to delete their own blog comments, and admins to
-- delete any comment. The info_comments table already grants
-- DELETE to authenticated users and has UPDATE/INSERT policies,
-- but it was missing a FOR DELETE policy, so user-side delete
-- operations would be blocked by RLS.
-- ============================================================

CREATE POLICY "info_comments_delete_own_or_admin" ON public.info_comments
FOR DELETE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

COMMIT;