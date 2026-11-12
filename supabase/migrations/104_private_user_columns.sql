-- 104: Stop exposing private account columns through the public API key.
--
-- 001/004 ran "GRANT SELECT ON ALL TABLES ... TO anon, authenticated" and the
-- info_users read policy shows every active non-admin row, so any visitor
-- could read email, phone_number, address, last_login, deletion timestamps
-- and the legacy password column of other users. Row policies cannot hide
-- columns, so table-level SELECT is replaced with a column list that omits
-- the private ones. Server routes use the service role and are unaffected;
-- the browser reads its own private fields through /info/api/profile.
-- No data is modified or removed.

BEGIN;

REVOKE SELECT ON TABLE public.info_users FROM anon, authenticated;

DO $$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_columns
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'info_users'
     AND column_name NOT IN (
       'email', 'password', 'phone_number', 'address', 'last_login',
       'account_deactivated_at'
     )
     AND column_name NOT LIKE 'deletion\_%';

  EXECUTE format('GRANT SELECT (%s) ON TABLE public.info_users TO anon, authenticated', v_columns);
END;
$$;

COMMIT;
