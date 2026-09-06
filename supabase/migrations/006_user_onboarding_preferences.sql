-- Persist first-login onboarding selections and completion state.
ALTER TABLE public.info_users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_feed_preferences
  ADD COLUMN IF NOT EXISTS favorite_places TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

GRANT UPDATE ON public.info_users, public.user_feed_preferences TO authenticated;
