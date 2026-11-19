import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { canAccessAdminApi, canAccessAdminPage } from './staffRoles.mjs'
import { formatSuspensionDuration, getTotalSuspensionDays } from './suspensionDuration.mjs'

const root = process.cwd()
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8')

test('Account Oversight page and API are administrator-only', () => {
  for (const role of ['moderator', 'tourism_officer', 'tourist']) {
    assert.equal(canAccessAdminPage(role, '/info/admin/account-oversight'), false)
    assert.equal(canAccessAdminApi(role, '/info/api/admin/account-oversight', 'PATCH'), false)
  }
  assert.equal(canAccessAdminPage('admin', '/info/admin/account-oversight'), true)
  assert.equal(canAccessAdminApi('admin', '/info/api/admin/account-oversight', 'PATCH'), true)

  const route = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'account-oversight', 'route.js')
  assert.match(route, /authorizeAdminApi\(request\)/)
  assert.match(route, /normalizeStaffRole\(authorization\.session\.role\) !== 'admin'/)
  assert.match(route, /admin_account_oversight_action/)
})

test('Permanent bans, exceptional suspensions, lifting, and reversal are audited admin transactions', () => {
  const migration = read('supabase', 'migrations', '142_system_administrator_account_oversight.sql')
  assert.match(migration, /Only an active System Administrator/)
  assert.match(migration, /v_new_status := 'banned'/)
  assert.match(migration, /v_investigation_status := 'pending_tourism_officer_review'/)
  assert.match(migration, /'approve_exceptional_suspension'/)
  assert.match(migration, /p_duration_days < 1 OR p_duration_days > 365/)
  assert.match(migration, /'lift_suspension'/)
  assert.match(migration, /'reverse_decision'/)
  assert.match(migration, /original_decision_id/)
  assert.match(migration, /INSERT INTO public\.moderation_decisions/)
  assert.match(migration, /INSERT INTO public\.info_audit_log/)
  assert.match(migration, /'previousStatus', v_previous_status/)
  assert.match(migration, /'newStatus', v_new_status/)
})

test('Account status and audit history cannot be directly changed by authenticated clients', () => {
  const migration = read('supabase', 'migrations', '142_system_administrator_account_oversight.sql')
  const usersApi = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'users', 'route.js')
  const usersPage = read('src', 'app', '(subsystems)', 'info', 'admin', 'users', 'page.js')
  const moderationApi = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'route.js')

  assert.match(migration, /Account status changes must use the authorized review workflow/)
  assert.match(migration, /REVOKE UPDATE, DELETE, TRUNCATE ON public\.info_audit_log FROM PUBLIC, anon, authenticated/)
  assert.match(usersApi, /hasOwnProperty\.call\(body \|\| \{\}, 'status'\)/)
  assert.doesNotMatch(usersPage, /onChange=\{e => updateStatus\(u\.id/)
  assert.doesNotMatch(moderationApi, /\.from\('info_audit_log'\)\s*\.update\(/)
})

test('Tourism Officer permanent-ban decisions are routed through administrator authorization', () => {
  const reviewApi = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'suspension-review', 'route.js')
  const migration = read('supabase', 'migrations', '142_system_administrator_account_oversight.sql')
  assert.match(reviewApi, /role === 'admin'[\s\S]*?admin_account_oversight_action/)
  assert.match(reviewApi, /administratorDecisions = new Set\(\['approve_permanent_ban', 'reject_permanent_ban'\]\)/)
  assert.match(migration, /Administrator decisions must use the Account Oversight workflow/)
})

test('Account status dropdown routes supported changes through audited actions instead of direct writes', () => {
  const page = read('src', 'app', '(subsystems)', 'info', 'admin', 'account-oversight', 'page.js')
  const usersPage = read('src', 'app', '(subsystems)', 'info', 'admin', 'users', 'page.js')
  const api = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'account-oversight', 'route.js')
  const statusControl = read('src', 'app', '(subsystems)', 'info', 'components', 'admin', 'AccountStatusSelect.js')

  assert.match(statusControl, /id=\{`account-status-\$\{account\.id\}`\}/)
  assert.match(statusControl, /Full access to permitted user features/)
  assert.match(statusControl, /Limited access while the account is awaiting verification or approval/)
  assert.match(statusControl, /Temporarily restricted from accessing community features/)
  assert.match(statusControl, /Permanently prohibited from using the account/)
  assert.match(page, /openAction\('lift_suspension', account\)/)
  assert.match(page, /openAction\('reverse_decision', account\)/)
  assert.match(page, /Related open report/)
  assert.match(page, /Suspension duration/)
  assert.match(page, /Confirm Permanent Ban/)
  assert.match(page, /Moderation history/)
  assert.doesNotMatch(page, /status:\s*targetStatus/)
  assert.match(usersPage, /<AccountStatusSelect/)
  assert.match(usersPage, /requestedStatus=/)
  assert.match(api, /admin_account_oversight_action/)
  assert.doesNotMatch(api, /status:\s*body\.status/)
})

test('direct status changes use one audited transaction and unique user notifications', () => {
  const migration = read('supabase', 'migrations', '145_admin_account_status_workflow.sql')
  const api = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'account-oversight', 'route.js')
  const emailHelper = read('src', 'lib', 'moderatorReviewEmail.js')
  const lifecycle = read('src', 'app', '(subsystems)', 'info', 'api', 'cron', 'moderation-lifecycle', 'route.js')

  assert.match(api, /admin_set_account_status/)
  assert.match(migration, /Only an active System Administrator or Moderator/)
  assert.match(migration, /p_new_status NOT IN \('active', 'pending', 'suspended', 'banned'\)/)
  assert.match(migration, /Suspension duration must be between 1 and 365 days/)
  assert.match(migration, /v_actor_role = 'moderator' AND p_new_status NOT IN \('suspended', 'banned'\)/)
  assert.match(migration, /Your account has been reported and is currently under review/)
  assert.match(migration, /Your account has been temporarily suspended/)
  assert.match(migration, /Your account has been permanently banned/)
  assert.match(migration, /Your account is now active again/)
  assert.match(migration, /moderation_decision_id/)
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS info_notifications_moderation_decision_id_idx/)
  assert.match(migration, /INSERT INTO public\.moderation_decisions/)
  assert.match(migration, /INSERT INTO public\.info_audit_log/)
  assert.match(migration, /process_expired_admin_suspensions/)
  assert.match(migration, /'ACCOUNT_REVIEW_PENDING'/)
  assert.match(migration, /'account_review_pending'/)
  assert.match(migration, /'SUSPENSION_EXPIRED'/)
  assert.match(migration, /'ACCOUNT_RESTORED'/)
  assert.match(emailHelper, /sendAccountReviewPendingEmail/)
  assert.match(lifecycle, /case 'account_review_pending'/)
})

test('suspension months use fixed 30-day units and reject invalid totals', () => {
  assert.equal(getTotalSuspensionDays('1', '5'), 35)
  assert.equal(getTotalSuspensionDays('12', '5'), 365)
  assert.equal(getTotalSuspensionDays('12', '6'), null)
  assert.equal(getTotalSuspensionDays('0', '0'), null)
  assert.equal(getTotalSuspensionDays('1', '30'), null)
  assert.equal(formatSuspensionDuration(35), '1 month and 5 days')
})

test('restricted sign-in and routes deny banned users without reactivating expired accounts at login', () => {
  const login = read('src', 'app', '(subsystems)', 'info', 'api', 'login', 'route.js')
  const callback = read('src', 'app', '(subsystems)', 'info', '(auth)', 'callback', 'route.js')
  const proxy = read('src', 'proxy.js')
  const migration = read('supabase', 'migrations', '145_admin_account_status_workflow.sql')

  assert.match(login, /getActivePermanentBan/)
  assert.match(login, /userProfile\?\.status === 'banned'/)
  assert.match(login, /includes\(userProfile\.status\)/)
  assert.doesNotMatch(login, /\.update\(\{ status: 'active'/)
  assert.match(callback, /profile\?\.status === 'banned'/)
  assert.doesNotMatch(callback, /\.update\(\{ status: 'active'/)
  assert.match(proxy, /getCurrentAccountStatus/)
  assert.match(proxy, /'pending', 'suspended'/)
  assert.match(proxy, /ACCOUNT_RESTRICTED/)
  assert.match(migration, /current_user_account_is_active\(\)/)
  assert.match(migration, /account_status_active_insert/)
})
