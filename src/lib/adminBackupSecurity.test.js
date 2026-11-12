import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const cronRoute = readFileSync(new URL('../app/(subsystems)/info/api/cron/backups/route.js', import.meta.url), 'utf8')
const adminRoute = readFileSync(new URL('../app/(subsystems)/info/api/admin/data-management/backups/route.js', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../supabase/migrations/095_admin_scheduled_backups.sql', import.meta.url), 'utf8')

test('scheduled backup cron authenticates before creating a service-role client', () => {
  assert.match(cronRoute, /Buffer\.byteLength\(expected\) >= 32/)
  assert.match(cronRoute, /timingSafeEqual/)
  assert.match(cronRoute, /now\.getUTCDay\(\) !== 0/)
  assert.ok(cronRoute.indexOf('if (!isAuthorized(request))') < cronRoute.indexOf('const adminSupabase = createClient('))
})

test('backup administration endpoints use server-side administrator authorization', () => {
  for (const method of ['GET', 'PUT', 'POST']) {
    const handler = adminRoute.slice(adminRoute.indexOf(`export async function ${method}(`))
    assert.ok(handler.indexOf('authorizeAdminApi(request)') >= 0, `${method} must authorize the administrator`)
  }
})

test('scheduled backup storage is private and backup records are service-role only', () => {
  assert.match(migration, /'admin-backups', 'admin-backups', FALSE/)
  assert.match(migration, /ALTER TABLE public\.admin_backup_runs ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.admin_backup_runs FROM PUBLIC, anon, authenticated/)
})
