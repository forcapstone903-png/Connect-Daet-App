-- 105: Restore public (guest) reads of places and events.
--
-- 097 added SELECT policies such as
--   USING (status = 'active' OR public.is_tourism_staff(auth.uid()))
-- but revoked EXECUTE on is_tourism_staff from anon. PostgreSQL checks the
-- privilege before evaluating the OR, so every guest query on
-- info_tourist_spots and info_events failed with
-- "permission denied for function is_tourism_staff".
--
-- Fix: anon may execute the helpers, and the helpers only ever answer for the
-- caller's own account (p_user_id must equal auth.uid()), so they cannot be
-- used to discover which accounts are staff. For guests auth.uid() is NULL,
-- so they always return false. Policies are unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_tourism_staff(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
     AND p_user_id = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.info_users u
       WHERE u.id = p_user_id
         AND u.status = 'active'
         AND u.user_type IN ('admin', 'administrator', 'tourism_officer')
     );
$$;

REVOKE ALL ON FUNCTION public.is_tourism_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tourism_staff(uuid) TO anon, authenticated, service_role;

-- Same treatment for the moderator helper from 103.
CREATE OR REPLACE FUNCTION public.can_moderate(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
     AND p_user_id = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.info_users u
       WHERE u.id = p_user_id
         AND u.status = 'active'
         AND u.user_type IN ('admin', 'administrator', 'moderator')
     );
$$;

REVOKE ALL ON FUNCTION public.can_moderate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_moderate(uuid) TO anon, authenticated, service_role;

COMMIT;
