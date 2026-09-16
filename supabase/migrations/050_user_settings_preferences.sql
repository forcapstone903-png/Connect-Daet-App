BEGIN;

-- User settings (Settings page) need storage for preferences that are not
-- covered by the legacy profile columns:
--   privacy_level / language_preference / notification_preferences (migration 008)
-- The new columns keep the extra privacy toggles and the appearance choices so
-- they follow the account across devices.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.privacy_preferences IS
  'User settings > Privacy: { privacyLevel, showOnlineStatus, showActivity, allowMessagesFrom, allowMentions, searchable }';

COMMENT ON COLUMN public.profiles.ui_preferences IS
  'User settings > Appearance: { theme: light|dark|system, reduceMotion: boolean }';

-- Existing rows keep the empty-object default, which the settings page treats as
-- "no preference saved yet" and falls back to defaults. The existing
-- profiles_update_own_or_admin policy already covers owner writes to these
-- columns, so no new policy or grant is required.

COMMIT;