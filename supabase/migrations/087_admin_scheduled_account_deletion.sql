BEGIN;

COMMENT ON COLUMN public.info_users.deletion_scheduled_for IS
  'Account deletion deadline: 30 days after an owner request or 15 days after an administrator schedules deletion.';

CREATE OR REPLACE FUNCTION public.schedule_admin_account_deletion(
  p_admin_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requested_at timestamptz := clock_timestamp();
  v_scheduled_for timestamptz;
  v_target public.info_users%ROWTYPE;
  v_session_version integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'This operation requires a trusted server request.';
  END IF;

  IF p_admin_user_id IS NULL
    OR p_target_user_id IS NULL
    OR p_admin_user_id = p_target_user_id
    OR NOT EXISTS (
      SELECT 1
      FROM public.info_users admin_user
      WHERE admin_user.id = p_admin_user_id
        AND admin_user.user_type IN ('admin', 'administrator')
        AND admin_user.status = 'active'
        AND admin_user.deletion_requested_at IS NULL
    )
  THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_target
  FROM public.info_users
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_target.user_type IN ('admin', 'administrator', 'moderator')
    OR v_target.status NOT IN ('active', 'pending', 'suspended', 'banned')
    OR v_target.deletion_requested_at IS NOT NULL
    OR v_target.deletion_scheduled_for IS NOT NULL
    OR v_target.deletion_processing_at IS NOT NULL
  THEN
    RETURN NULL;
  END IF;

  v_scheduled_for := v_requested_at + interval '360 hours';

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
  WHERE id = p_target_user_id;

  INSERT INTO public.user_session_versions (user_id, version, updated_at)
  VALUES (p_target_user_id, 1, v_requested_at)
  ON CONFLICT (user_id) DO UPDATE
  SET version = public.user_session_versions.version + 1,
      updated_at = EXCLUDED.updated_at
  RETURNING version INTO v_session_version;

  INSERT INTO public.info_audit_log (user_id, action, table_name, record_id, changes)
  VALUES (
    p_admin_user_id,
    'schedule_account_deletion',
    'info_users',
    p_target_user_id,
    jsonb_build_object(
      'previous_status', v_target.status,
      'status', 'pending_deletion',
      'scheduled_for', v_scheduled_for,
      'grace_period_hours', 360
    )
  );

  RETURN jsonb_build_object(
    'requested_at', v_requested_at,
    'scheduled_for', v_scheduled_for,
    'session_version', v_session_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_admin_account_deletion(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_admin_account_deletion(uuid, uuid) TO service_role;

COMMIT;
