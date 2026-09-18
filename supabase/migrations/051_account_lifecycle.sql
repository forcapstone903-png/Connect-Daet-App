BEGIN;

ALTER TABLE public.info_users
  ADD COLUMN IF NOT EXISTS account_deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS info_users_deletion_scheduled_idx
  ON public.info_users (deletion_scheduled_for)
  WHERE deletion_scheduled_for IS NOT NULL;

COMMENT ON COLUMN public.info_users.account_deactivated_at IS
  'Set when the account owner deactivates their account.';

COMMENT ON COLUMN public.info_users.deletion_requested_at IS
  'When the account owner requested account deletion.';

COMMENT ON COLUMN public.info_users.deletion_scheduled_for IS
  'Account deletion deadline, normally 30 days after the request.';

COMMIT;
