BEGIN;

-- Keep one audit record per moderation decision. Existing applications already
-- enforce report-state concurrency; this index closes retry races as well.
-- Preserve the older entries on the keeper before consolidating duplicate keys.
WITH ranked AS (
  SELECT
    id,
    user_id,
    action,
    table_name,
    record_id,
    created_at,
    changes,
    row_number() OVER (
      PARTITION BY action, table_name, record_id
      ORDER BY created_at DESC, id DESC
    ) AS decision_rank
  FROM public.info_audit_log
  WHERE action IN (
    'approve-suspension',
    'reject-account-report',
    'escalate-account-review'
  )
    AND table_name = 'info_moderation'
    AND record_id IS NOT NULL
),
history AS (
  SELECT
    action,
    table_name,
    record_id,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'user_id', user_id,
        'created_at', created_at,
        'changes', changes
      )
      ORDER BY created_at, id
    ) FILTER (WHERE decision_rank > 1) AS records
  FROM ranked
  GROUP BY action, table_name, record_id
  HAVING count(*) > 1
),
keepers AS (
  SELECT id, action, table_name, record_id
  FROM ranked
  WHERE decision_rank = 1
)
UPDATE public.info_audit_log AS keeper
SET changes = COALESCE(keeper.changes, '{}'::jsonb)
  || jsonb_build_object('duplicateDecisionHistory', history.records)
FROM keepers
JOIN history
  ON history.action = keepers.action
 AND history.table_name = keepers.table_name
 AND history.record_id = keepers.record_id
WHERE keeper.id = keepers.id;

DELETE FROM public.info_audit_log duplicate
USING public.info_audit_log keeper
WHERE duplicate.id <> keeper.id
  AND duplicate.action = keeper.action
  AND duplicate.table_name = 'info_moderation'
  AND duplicate.record_id IS NOT NULL
  AND duplicate.record_id = keeper.record_id
  AND duplicate.action IN (
    'approve-suspension',
    'reject-account-report',
    'escalate-account-review'
  )
  AND (
    duplicate.created_at < keeper.created_at
    OR (duplicate.created_at = keeper.created_at AND duplicate.id < keeper.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS info_audit_log_moderator_review_decision_unique
  ON public.info_audit_log (action, table_name, record_id)
  WHERE action IN (
    'approve-suspension',
    'reject-account-report',
    'escalate-account-review'
  )
  AND table_name = 'info_moderation'
  AND record_id IS NOT NULL;

COMMIT;
