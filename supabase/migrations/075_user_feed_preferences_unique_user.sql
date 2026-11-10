BEGIN;

WITH duplicate_users AS (
  SELECT user_id
  FROM public.user_feed_preferences
  GROUP BY user_id
  HAVING COUNT(*) > 1
),
merged_preferences AS (
  SELECT
    duplicate_users.user_id,
    ARRAY(
      SELECT DISTINCT category
      FROM public.user_feed_preferences AS preference_row
      CROSS JOIN LATERAL unnest(preference_row.preferred_categories) AS categories(category)
      WHERE preference_row.user_id = duplicate_users.user_id
      ORDER BY category
    ) AS preferred_categories,
    ARRAY(
      SELECT DISTINCT place
      FROM public.user_feed_preferences AS preference_row
      CROSS JOIN LATERAL unnest(preference_row.favorite_places) AS places(place)
      WHERE preference_row.user_id = duplicate_users.user_id
      ORDER BY place
    ) AS favorite_places,
    BOOL_OR(preference.enabled) AS enabled,
    BOOL_OR(preference.onboarding_completed) AS onboarding_completed,
    MIN(preference.created_at) AS created_at,
    MAX(preference.updated_at) AS updated_at
  FROM duplicate_users
  JOIN public.user_feed_preferences AS preference
    ON preference.user_id = duplicate_users.user_id
  GROUP BY duplicate_users.user_id
),
canonical_preferences AS (
  SELECT DISTINCT ON (user_id)
    id,
    user_id
  FROM public.user_feed_preferences
  ORDER BY user_id, updated_at DESC, created_at DESC, id DESC
)
UPDATE public.user_feed_preferences AS preference
SET
  preferred_categories = merged.preferred_categories,
  favorite_places = merged.favorite_places,
  enabled = merged.enabled,
  onboarding_completed = merged.onboarding_completed,
  created_at = merged.created_at,
  updated_at = merged.updated_at
FROM canonical_preferences AS canonical
JOIN merged_preferences AS merged USING (user_id)
WHERE preference.id = canonical.id;

WITH ranked_preferences AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM public.user_feed_preferences
)
DELETE FROM public.user_feed_preferences AS preference
USING ranked_preferences AS ranked
WHERE preference.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS user_feed_preferences_user_id_uidx
  ON public.user_feed_preferences (user_id);

COMMIT;
