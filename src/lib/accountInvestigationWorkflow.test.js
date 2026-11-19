import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const srcRoot = new URL('../', import.meta.url)

test('account investigation API requires the exact moderator role', async () => {
  const route = await readFile(new URL('app/(subsystems)/info/api/admin/moderation/route.js', srcRoot), 'utf8')
  assert.match(route, /normalizeStaffRole\(authorization\.session\.role\) !== 'moderator'/)
  assert.match(route, /submit-moderator-account-investigation/)
})

test('account investigation submission does not update account status or bans', async () => {
  const migration = await readFile(new URL('../../supabase/migrations/140_moderator_account_investigations.sql', import.meta.url), 'utf8')
  assert.match(migration, /pending_tourism_officer_review/)
  assert.doesNotMatch(migration, /UPDATE public\.info_users[\s\S]*status\s*=\s*'suspended'/)
  assert.doesNotMatch(migration, /INSERT INTO public\.admin_user_bans/)
})

test('moderator account suspension and permanent-ban actions require an audited status transaction', async () => {
  const route = await readFile(new URL('app/(subsystems)/info/api/admin/moderation/route.js', srcRoot), 'utf8')
  const migration = await readFile(new URL('../../supabase/migrations/145_admin_account_status_workflow.sql', import.meta.url), 'utf8')
  assert.match(route, /if \(banType === 'suspension' \|\| banType === 'permanent'\)/)
  assert.match(route, /if \(!\['moderator', 'admin'\]\.includes\(actorRole\)\)/)
  assert.match(route, /client\.rpc\('admin_set_account_status'/)
  assert.match(route, /if \(!userId \|\| userId === actorId \|\| !reason/)
  assert.match(route, /A temporary suspension must be between 1 and 365 days/)
  assert.match(migration, /v_actor_role = 'moderator' AND p_new_status NOT IN \('suspended', 'banned'\)/)
  assert.match(migration, /A moderation reason is required/)
})
