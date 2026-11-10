BEGIN;

ALTER TABLE public.info_users
  DROP CONSTRAINT IF EXISTS info_users_status_check;

ALTER TABLE public.info_users
  ADD CONSTRAINT info_users_status_check
  CHECK (status IN ('active', 'pending', 'suspended', 'pending_deletion', 'banned'));

UPDATE public.info_users
SET status = 'pending_deletion'
WHERE deletion_requested_at IS NOT NULL
  AND deletion_scheduled_for IS NOT NULL
  AND status = 'suspended';

INSERT INTO public.user_session_versions (user_id, version, updated_at)
SELECT id, 1, clock_timestamp()
FROM public.info_users
WHERE status = 'pending_deletion'
ON CONFLICT (user_id) DO UPDATE
SET version = public.user_session_versions.version + 1,
    updated_at = EXCLUDED.updated_at;

ALTER TABLE public.info_users
  ADD COLUMN IF NOT EXISTS deletion_reminder_7_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reminder_7_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reminder_1_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reminder_1_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_processing_at timestamptz;

CREATE INDEX IF NOT EXISTS info_users_pending_deletion_due_idx
  ON public.info_users (deletion_scheduled_for)
  WHERE status = 'pending_deletion';

CREATE TABLE IF NOT EXISTS public.user_storage_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, object_path)
);

CREATE INDEX IF NOT EXISTS user_storage_objects_user_id_idx
  ON public.user_storage_objects (user_id);

ALTER TABLE public.user_storage_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_storage_objects FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_storage_objects TO service_role;

CREATE OR REPLACE FUNCTION public.current_user_account_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.info_users
    WHERE id = auth.uid()
      AND status = 'active'
      AND deletion_requested_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_account_is_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_account_is_active() TO authenticated, service_role;

DO $$
DECLARE
  v_table record;
BEGIN
  FOR v_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS account_active_required ON public.%I',
      v_table.relname
    );
    EXECUTE format(
      'CREATE POLICY account_active_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.current_user_account_is_active()) WITH CHECK (public.current_user_account_is_active())',
      v_table.relname
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requested_at timestamptz := clock_timestamp();
  v_scheduled_for timestamptz;
  v_version integer;
BEGIN
  v_scheduled_for := v_requested_at + interval '720 hours';

  UPDATE public.info_users
  SET status = 'pending_deletion',
      account_deactivated_at = NULL,
      deletion_requested_at = v_requested_at,
      deletion_scheduled_for = v_scheduled_for,
      deletion_reminder_7_claimed_at = NULL,
      deletion_reminder_7_sent_at = NULL,
      deletion_reminder_1_claimed_at = NULL,
      deletion_reminder_1_sent_at = NULL,
      deletion_processing_at = NULL,
      updated_at = v_requested_at
  WHERE id = p_user_id
    AND status = 'active'
    AND deletion_requested_at IS NULL
    AND deletion_scheduled_for IS NULL
    AND account_deactivated_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.user_session_versions (user_id, version, updated_at)
  VALUES (p_user_id, 1, v_requested_at)
  ON CONFLICT (user_id) DO UPDATE
  SET version = public.user_session_versions.version + 1,
      updated_at = EXCLUDED.updated_at
  RETURNING version INTO v_version;

  RETURN jsonb_build_object(
    'deletion_requested_at', v_requested_at,
    'deletion_scheduled_for', v_scheduled_for,
    'session_version', v_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version integer;
BEGIN
  UPDATE public.info_users
  SET status = 'active',
      deletion_requested_at = NULL,
      deletion_scheduled_for = NULL,
      deletion_reminder_7_claimed_at = NULL,
      deletion_reminder_7_sent_at = NULL,
      deletion_reminder_1_claimed_at = NULL,
      deletion_reminder_1_sent_at = NULL,
      deletion_processing_at = NULL,
      updated_at = clock_timestamp()
  WHERE id = p_user_id
    AND status = 'pending_deletion'
    AND deletion_requested_at IS NOT NULL
    AND deletion_scheduled_for > clock_timestamp()
    AND deletion_processing_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.user_session_versions (user_id, version, updated_at)
  VALUES (p_user_id, 1, clock_timestamp())
  ON CONFLICT (user_id) DO UPDATE
  SET version = public.user_session_versions.version + 1,
      updated_at = clock_timestamp()
  RETURNING version INTO v_version;

  RETURN jsonb_build_object('status', 'active', 'session_version', v_version);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_expired_account_deletion(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.info_users
  SET deletion_processing_at = clock_timestamp()
  WHERE id = p_user_id
    AND status = 'pending_deletion'
    AND deletion_requested_at IS NOT NULL
    AND deletion_scheduled_for <= clock_timestamp()
    AND (deletion_processing_at IS NULL OR deletion_processing_at < clock_timestamp() - interval '30 minutes');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_expired_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_account_deletion(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_expired_account_deletion(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.info_users
  SET deletion_processing_at = NULL
  WHERE id = p_user_id
    AND status = 'pending_deletion';
$$;

REVOKE ALL ON FUNCTION public.release_expired_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_account_deletion(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_account_deletion_reminders(p_limit integer DEFAULT 100)
RETURNS TABLE(user_id uuid, email text, deletion_scheduled_for timestamptz, reminder_days integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT u.id,
      CASE
        WHEN u.deletion_scheduled_for > clock_timestamp() + interval '6 days'
          THEN 7
        ELSE 1
      END AS days
    FROM public.info_users u
    WHERE u.status = 'pending_deletion'
      AND u.deletion_scheduled_for > clock_timestamp()
      AND (
        (
          u.deletion_scheduled_for <= clock_timestamp() + interval '7 days'
          AND u.deletion_scheduled_for > clock_timestamp() + interval '6 days'
          AND u.deletion_reminder_7_sent_at IS NULL
          AND (u.deletion_reminder_7_claimed_at IS NULL OR u.deletion_reminder_7_claimed_at < clock_timestamp() - interval '30 minutes')
        )
        OR
        (
          u.deletion_scheduled_for <= clock_timestamp() + interval '1 day'
          AND u.deletion_reminder_1_sent_at IS NULL
          AND (u.deletion_reminder_1_claimed_at IS NULL OR u.deletion_reminder_1_claimed_at < clock_timestamp() - interval '30 minutes')
        )
      )
    ORDER BY u.deletion_scheduled_for
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.info_users u
    SET deletion_reminder_7_claimed_at = CASE WHEN c.days = 7 THEN clock_timestamp() ELSE u.deletion_reminder_7_claimed_at END,
        deletion_reminder_1_claimed_at = CASE WHEN c.days = 1 THEN clock_timestamp() ELSE u.deletion_reminder_1_claimed_at END
    FROM candidates c
    WHERE u.id = c.id
    RETURNING u.id, u.email, u.deletion_scheduled_for, c.days
  )
  SELECT claimed.id, claimed.email, claimed.deletion_scheduled_for, claimed.days
  FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_account_deletion_reminders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_reminders(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_account_deletion_reminder(
  p_user_id uuid,
  p_reminder_days integer,
  p_sent boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_reminder_days = 7 THEN
    UPDATE public.info_users
    SET deletion_reminder_7_sent_at = CASE WHEN p_sent THEN clock_timestamp() ELSE deletion_reminder_7_sent_at END,
        deletion_reminder_7_claimed_at = NULL
    WHERE id = p_user_id
      AND status = 'pending_deletion'
      AND deletion_reminder_7_claimed_at IS NOT NULL
      AND deletion_reminder_7_sent_at IS NULL;
  ELSIF p_reminder_days = 1 THEN
    UPDATE public.info_users
    SET deletion_reminder_1_sent_at = CASE WHEN p_sent THEN clock_timestamp() ELSE deletion_reminder_1_sent_at END,
        deletion_reminder_1_claimed_at = NULL
    WHERE id = p_user_id
      AND status = 'pending_deletion'
      AND deletion_reminder_1_claimed_at IS NOT NULL
      AND deletion_reminder_1_sent_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Unsupported account deletion reminder interval';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_account_deletion_reminder(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_account_deletion_reminder(uuid, integer, boolean) TO service_role;

COMMIT;
