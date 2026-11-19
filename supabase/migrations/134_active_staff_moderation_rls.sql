BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.info_users AS staff
     WHERE staff.id = p_user_id
       AND staff.status = 'active'
       AND lower(staff.user_type) IN ('admin', 'administrator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_moderator(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.info_users AS staff
     WHERE staff.id = p_user_id
       AND staff.status = 'active'
       AND lower(staff.user_type) IN ('admin', 'administrator', 'moderator', 'tourism_officer')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_session_current(
  p_user_id UUID,
  p_role TEXT,
  p_session_version BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.info_users AS staff
      LEFT JOIN public.user_session_versions AS versions
        ON versions.user_id = staff.id
     WHERE staff.id = p_user_id
       AND staff.status = 'active'
       AND (
         CASE
           WHEN lower(trim(staff.user_type)) IN ('admin', 'administrator') THEN 'admin'
           ELSE lower(trim(staff.user_type))
         END
       ) = (
         CASE
           WHEN lower(trim(p_role)) IN ('admin', 'administrator') THEN 'admin'
           ELSE lower(trim(p_role))
         END
       )
       AND COALESCE(versions.version, 0) = p_session_version
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff_session_current(UUID, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_session_current(UUID, TEXT, BIGINT) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS user_moderation_appeals_one_pending_idx
  ON public.user_moderation_appeals (user_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS info_audit_log_moderator_review_decision_unique
  ON public.info_audit_log (action, table_name, record_id)
  WHERE action IN (
    'approve-suspension',
    'reject-account-report',
    'escalate-account-review'
  )
  AND table_name = 'info_moderation'
  AND record_id IS NOT NULL;

COMMIT;
