BEGIN;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'content_comments',
    'content_reactions',
    'forum_categories',
    'forum_replies',
    'forum_threads',
    'info_blogs',
    'info_comments',
    'info_user_posts',
    'info_users',
    'system_categories'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = table_name
           AND policyname = 'account_status_read_access'
      )
    THEN
      EXECUTE format(
        'ALTER POLICY account_status_read_access ON public.%I USING (public.current_user_account_can_read())',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
