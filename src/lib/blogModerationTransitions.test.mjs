import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/110_blog_change_requests_after_approval.sql', import.meta.url),
  'utf8',
)

test('staff can request blog changes after approval and unpublish until resubmission', () => {
  assert.match(migration, /public\.is_moderator\(p_reviewer_id\)/)
  assert.match(migration, /previous_status NOT IN \('pending', 'approved', 'rejected'\)/)
  assert.match(migration, /approval_status = 'changes_requested'/)
  assert.match(migration, /status = 'draft'/)
  assert.match(migration, /published_at = NULL/)
  assert.match(migration, /INSERT INTO public\.blog_moderation_history/)
  assert.match(migration, /INSERT INTO public\.info_notifications/)
})
