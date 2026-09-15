BEGIN;

-- Older production databases require normalized Web Push fields in addition
-- to the JSON subscription used by the Edge Function.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS subscription_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS p256dh TEXT,
  ADD COLUMN IF NOT EXISTS auth TEXT;

UPDATE public.push_subscriptions
SET
  subscription_endpoint = COALESCE(subscription_endpoint, subscription->>'endpoint'),
  p256dh = COALESCE(p256dh, subscription->'keys'->>'p256dh'),
  auth = COALESCE(auth, subscription->'keys'->>'auth')
WHERE subscription IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON public.push_subscriptions(subscription_endpoint);

COMMIT;
