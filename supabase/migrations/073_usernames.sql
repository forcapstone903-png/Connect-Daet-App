BEGIN;

ALTER TABLE public.info_users
  ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.info_users
  ADD CONSTRAINT info_users_username_format_check
  CHECK (
    username IS NULL
    OR username ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS info_users_username_lower_unique_idx
  ON public.info_users (lower(username))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.info_users.username IS
  'Optional public username; unique without regard to letter case.';

COMMIT;
