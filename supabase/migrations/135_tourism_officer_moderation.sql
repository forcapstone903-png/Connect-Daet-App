BEGIN;

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

DO $$
DECLARE
  v_target record;
  v_oid oid;
  v_definition text;
  v_old_text text;
  v_new_text text;
  v_updated text;
BEGIN
  FOR v_target IN
    SELECT * FROM (VALUES
      ('moderate_info_blog', 'p_reviewer_id'),
      ('admin_transition_info_blog', 'p_reviewer_id'),
      ('admin_edit_info_blog', 'p_reviewer_id'),
      ('admin_delete_info_blog', 'p_reviewer_id'),
      ('create_account_restriction', 'p_actor_id'),
      ('lift_account_restriction', 'p_actor_id'),
      ('decide_account_moderation_report', 'p_reviewer_id'),
      ('review_user_moderation_appeal', 'p_reviewer_id')
    ) AS targets(function_name, actor_parameter)
  LOOP
    IF (
      SELECT count(*)
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = v_target.function_name
    ) <> 1 THEN
      RAISE EXCEPTION '135: expected exactly one public.% function', v_target.function_name;
    END IF;

    SELECT p.oid
      INTO v_oid
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = v_target.function_name;

    v_definition := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
    v_old_text := format(
      'public.is_staff_in(%s, ARRAY[''moderator''])',
      v_target.actor_parameter
    );
    v_new_text := format(
      'public.is_staff_in(%s, ARRAY[''moderator'', ''tourism_officer''])',
      v_target.actor_parameter
    );

    IF position(v_new_text IN v_definition) > 0 THEN
      CONTINUE;
    END IF;

    IF (length(v_definition) - length(replace(v_definition, v_old_text, '')))
       / length(v_old_text) <> 1 THEN
      RAISE EXCEPTION '135: expected exactly one staff-role check in public.%', v_target.function_name;
    END IF;

    v_updated := replace(v_definition, v_old_text, v_new_text);
    v_updated := replace(
      v_updated,
      'An active moderator or administrator is required',
      'An active moderation-authorized staff member is required'
    );
    v_updated := replace(
      v_updated,
      'A moderator escalated an account report with evidence for administrator review.',
      'A moderation reviewer escalated an account report with evidence for administrator review.'
    );
    EXECUTE v_updated;
  END LOOP;
END $$;

COMMIT;
