-- 096: Staff roles and role-based access control (Phase 1)
--
-- Adds the Tourism Officer role next to Admin and Moderator, a helper that the
-- database uses to check staff roles, an audited role-assignment function, and
-- widens the existing moderation functions so each role can do its own job:
--
--   admin            everything (unchanged)
--   tourism_officer  approve/reject submitted events
--   moderator        moderate, edit and delete user blogs
--
-- The application-side rules live in src/lib/staffRoles.mjs; this migration
-- keeps the database checks in line with them.

BEGIN;

-- ------------------------------------------------------------------
-- 1. Allow the new role on info_users.user_type
-- ------------------------------------------------------------------
DO $$
DECLARE
  v_constraint text;
BEGIN
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.info_users'::regclass
      AND con.contype = 'c'
      AND att.attname = 'user_type'
  LOOP
    EXECUTE format('ALTER TABLE public.info_users DROP CONSTRAINT %I', v_constraint);
  END LOOP;
END $$;

ALTER TABLE public.info_users
  ADD CONSTRAINT info_users_user_type_check
  CHECK (user_type IN ('tourist', 'business', 'admin', 'administrator', 'tourism_officer', 'moderator'));

-- ------------------------------------------------------------------
-- 2. Helper: is this user an active staff member holding one of p_roles?
--    Admin always passes.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff_in(p_user_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.info_users u
    WHERE u.id = p_user_id
      AND u.status = 'active'
      AND u.user_type = ANY (ARRAY['admin', 'administrator'] || COALESCE(p_roles, ARRAY[]::text[]))
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff_in(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_in(uuid, text[]) TO service_role;

-- ------------------------------------------------------------------
-- 3. Widen reviewer checks in existing moderation functions.
--    The function bodies are long and were defined across migrations
--    080-091, so instead of copying them here we rewrite only the reviewer
--    check inside the current definition. Each rewrite must match exactly
--    once or the migration aborts, so nothing changes silently.
-- ------------------------------------------------------------------
DO $$
DECLARE
  v_target record;
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  FOR v_target IN
    SELECT * FROM (VALUES
      ('moderate_info_blog',
       'SELECT 1 FROM public.info_users WHERE id = p_reviewer_id AND user_type = ''admin''',
       'SELECT 1 WHERE public.is_staff_in(p_reviewer_id, ARRAY[''moderator''])'),
      ('admin_transition_info_blog',
       'SELECT 1 FROM public.info_users WHERE id = p_reviewer_id AND user_type = ''admin''',
       'SELECT 1 WHERE public.is_staff_in(p_reviewer_id, ARRAY[''moderator''])'),
      ('admin_edit_info_blog',
       'SELECT 1 FROM public.info_users WHERE id = p_reviewer_id AND user_type = ''admin''',
       'SELECT 1 WHERE public.is_staff_in(p_reviewer_id, ARRAY[''moderator''])'),
      ('admin_delete_info_blog',
       'SELECT 1 FROM public.info_users WHERE id = p_reviewer_id AND user_type = ''admin''',
       'SELECT 1 WHERE public.is_staff_in(p_reviewer_id, ARRAY[''moderator''])'),
      ('moderate_info_event',
       E'SELECT 1 FROM public.info_users\n    WHERE id = p_reviewer_id AND user_type IN (''admin'', ''administrator'')',
       'SELECT 1 WHERE public.is_staff_in(p_reviewer_id, ARRAY[''tourism_officer''])'),
      ('schedule_admin_account_deletion',
       'OR v_target.user_type IN (''admin'', ''administrator'', ''moderator'')',
       'OR v_target.user_type IN (''admin'', ''administrator'', ''tourism_officer'', ''moderator'')')
    ) AS t(fn, old_text, new_text)
  LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_target.fn) <> 1 THEN
      RAISE EXCEPTION '096: expected exactly one public.% function', v_target.fn;
    END IF;

    SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_target.fn;

    -- Earlier migrations were saved with CRLF line endings; normalise so the
    -- multi-line match below works either way.
    v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

    IF position(v_target.new_text IN v_def) > 0 THEN
      CONTINUE; -- already applied
    END IF;

    IF (length(v_def) - length(replace(v_def, v_target.old_text, ''))) / length(v_target.old_text) <> 1 THEN
      RAISE EXCEPTION '096: expected exactly one reviewer check in public.%, found a different body', v_target.fn;
    END IF;

    v_new := replace(v_def, v_target.old_text, v_target.new_text);
    v_new := replace(v_new, 'must be an administrator', 'must be authorized staff');
    EXECUTE v_new;
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 4. Audited role assignment (called by PATCH /info/api/admin/users)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_admin_user_id uuid,
  p_target_user_id uuid,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := lower(trim(p_role));
  v_old_role text;
  v_target public.info_users%ROWTYPE;
BEGIN
  IF NOT public.is_staff_in(p_admin_user_id, ARRAY[]::text[]) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_role NOT IN ('tourist', 'business', 'admin', 'tourism_officer', 'moderator') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF p_admin_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'cannot_change_own_role';
  END IF;

  SELECT * INTO v_target FROM public.info_users WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  v_old_role := v_target.user_type;
  IF v_old_role = v_role THEN
    RETURN jsonb_build_object('id', v_target.id, 'user_type', v_role, 'changed', false);
  END IF;

  IF v_old_role IN ('admin', 'administrator') AND (
    SELECT count(*) FROM public.info_users
    WHERE user_type IN ('admin', 'administrator') AND status = 'active' AND id <> p_target_user_id
  ) = 0 THEN
    RAISE EXCEPTION 'last_admin';
  END IF;

  UPDATE public.info_users
  SET user_type = v_role, updated_at = now()
  WHERE id = p_target_user_id;

  -- Signed session cookies carry the role, so force a fresh sign-in.
  PERFORM public.revoke_user_sessions(p_target_user_id);

  INSERT INTO public.info_audit_log (user_id, action, table_name, record_id, changes)
  VALUES (
    p_admin_user_id,
    'role_change',
    'info_users',
    p_target_user_id,
    jsonb_build_object('from', v_old_role, 'to', v_role)
  );

  RETURN jsonb_build_object('id', p_target_user_id, 'user_type', v_role, 'previous_role', v_old_role, 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, uuid, text) TO service_role;

-- ------------------------------------------------------------------
-- 5. Close self-promotion through the browser Supabase client.
--    Policy "info_users_update_own_or_admin" (001) lets every signed-in user
--    update their own row, which previously included user_type — so a
--    tourist could make themselves an admin. From now on:
--      * user_type changes only through the server (service role), i.e.
--        admin_set_user_role, which is audited;
--      * status and points change only by an administrator or the server.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_info_users_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  -- Only requests made with the public anon key / a user JWT are restricted.
  -- Service role (our API routes) and direct SQL (migrations) pass through.
  IF v_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_type IS DISTINCT FROM OLD.user_type THEN
    RAISE EXCEPTION 'Roles can only be changed by an administrator from the Users page.'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.points IS DISTINCT FROM OLD.points)
     AND NOT public.is_staff_in(auth.uid(), ARRAY[]::text[]) THEN
    RAISE EXCEPTION 'Only an administrator can change account status or points.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_info_users_privileged_columns ON public.info_users;
CREATE TRIGGER trg_guard_info_users_privileged_columns
BEFORE UPDATE ON public.info_users
FOR EACH ROW
EXECUTE FUNCTION public.guard_info_users_privileged_columns();

COMMIT;
