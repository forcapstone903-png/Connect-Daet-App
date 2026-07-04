-- Allow authenticated users to read their own profile row and public reads for role-based access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'info_users'
      AND policyname = 'users_select_own_or_admin'
  ) THEN
    CREATE POLICY "users_select_own_or_admin" ON public.info_users
      FOR SELECT
      USING (
        auth.uid()::text = id::text
        OR auth.role() = 'authenticated'
        OR user_type = 'admin'
      );
  END IF;
END $$;

-- Allow authenticated users to create their own profile row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'info_users'
      AND policyname = 'users_insert_own'
  ) THEN
    CREATE POLICY "users_insert_own" ON public.info_users
      FOR INSERT
      WITH CHECK (
        auth.uid()::text = id::text
        OR auth.role() = 'authenticated'
      );
  END IF;
END $$;

-- Allow authenticated users to update their own profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'info_users'
      AND policyname = 'users_update_own_v2'
  ) THEN
    CREATE POLICY "users_update_own_v2" ON public.info_users
      FOR UPDATE
      USING (auth.uid()::text = id::text)
      WITH CHECK (auth.uid()::text = id::text);
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.info_users ENABLE ROW LEVEL SECURITY;
