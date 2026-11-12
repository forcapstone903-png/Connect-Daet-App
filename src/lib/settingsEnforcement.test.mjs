import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildPublicSettings,
  normalizeSetting,
  passwordPolicyFromSecurity,
  resolveSetting,
} from './siteSettings.mjs'
import { describePasswordPolicy, isPasswordValid } from './passwordPolicy.js'
import {
  GRANTABLE_PERMISSIONS,
  canAccessAdminApi,
  canAccessAdminPage,
  getEffectivePermissions,
  hasPermission,
  normalizePermissionOverrides,
} from './staffRoles.mjs'
import { parseTrafficBucket, buildAnalyticsTables } from './adminAnalytics.mjs'

process.env.SESSION_SECRET ||= 'x'.repeat(40)
const serverAuth = await import('./serverAuth.js')

test('security settings clamp to safe ranges and never weaken the password floor', () => {
  const { value } = normalizeSetting('security', {
    password_min_length: 4,
    session_hours: 0,
    remember_days: 365,
    idle_timeout_minutes: 2,
    lockout_max_attempts: 1,
    lockout_window_minutes: 999,
    lockout_duration_minutes: 99999,
  })
  assert.equal(value.password_min_length, 8)
  assert.equal(value.session_hours, 1)
  assert.equal(value.remember_days, 90)
  assert.equal(value.idle_timeout_minutes, 5)
  assert.equal(value.lockout_max_attempts, 3)
  assert.equal(value.lockout_window_minutes, 120)
  assert.equal(value.lockout_duration_minutes, 1440)
  assert.equal(normalizeSetting('security', { idle_timeout_minutes: 0 }).value.idle_timeout_minutes, 0)
})

test('general settings validate contact details and only allow https links', () => {
  assert.match(normalizeSetting('general', { site_name: 'X', municipality_name: 'Daet', logo_url: 'http://evil.test/a.png' }).error, /https/)
  assert.match(normalizeSetting('general', { site_name: 'X', municipality_name: 'Daet', contact_email: 'nope' }).error, /email/i)
  assert.match(normalizeSetting('general', { site_name: '', municipality_name: 'Daet' }).error, /Site name/)
  const ok = normalizeSetting('general', { site_name: 'Connect Daet', municipality_name: 'Daet', logo_url: 'https://cdn.test/logo.png', contact_phone: '(054) 721-0000' })
  assert.equal(ok.error, undefined)
  assert.equal(ok.value.logo_url, 'https://cdn.test/logo.png')
})

test('unknown settings ids are rejected and stored rows resolve over defaults', () => {
  assert.ok(normalizeSetting('community-guidelines', {}).error)
  assert.ok(normalizeSetting('anything', {}).error)
  const resolved = resolveSetting('notifications', { alert_push_enabled: false, injected: true })
  assert.equal(resolved.alert_push_enabled, false)
  assert.equal(resolved.follower_notifications_enabled, true)
  assert.equal(resolved.injected, undefined)
})

test('public settings expose branding, contact and password rules only', () => {
  const pub = buildPublicSettings({ general: { site_name: 'Daet', contact_email: 'a@b.ph' }, security: { password_min_length: 12 } })
  assert.deepEqual(Object.keys(pub).sort(), ['contact', 'logoUrl', 'municipality', 'passwordPolicy', 'siteName', 'tagline', 'tourismOfficeName'])
  assert.equal(pub.passwordPolicy.minLength, 12)
  assert.equal(pub.contact.email, 'a@b.ph')
})

test('password policy follows the configured rules', () => {
  const policy = passwordPolicyFromSecurity({ password_min_length: 12, password_require_symbol: false })
  assert.equal(isPasswordValid('Abcdefgh1234', policy), true)
  assert.equal(isPasswordValid('Abcdefg1!', policy), false)
  assert.equal(isPasswordValid('Abcdefg1!'), true)
  assert.match(describePasswordPolicy(policy), /12 characters/)
  assert.doesNotMatch(describePasswordPolicy(policy), /special/)
})

test('permission overrides grant and revoke without ever creating an admin', () => {
  const overrides = normalizePermissionOverrides({ grant: ['analytics.view', 'users.manage', 'system.manage'], revoke: ['console.access', 'forum.manage'] })
  assert.deepEqual(overrides, { grant: ['analytics.view'], revoke: ['forum.manage'] })
  assert.ok(!GRANTABLE_PERMISSIONS.includes('users.manage'))

  assert.equal(hasPermission('moderator', 'analytics.view'), false)
  assert.equal(hasPermission('moderator', 'analytics.view', overrides), true)
  assert.equal(hasPermission('moderator', 'forum.manage', overrides), false)
  assert.equal(hasPermission('moderator', 'console.access', { revoke: ['console.access'] }), true)
  assert.equal(hasPermission('tourist', 'analytics.view', { grant: ['analytics.view'] }), false)
  assert.equal(hasPermission('admin', 'system.manage', { revoke: ['system.manage'] }), true)

  assert.equal(canAccessAdminPage('moderator', '/info/admin/analytics', overrides), true)
  assert.equal(canAccessAdminPage('moderator', '/info/admin/forum', overrides), false)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/analytics', 'GET', overrides), true)
  assert.ok(getEffectivePermissions('moderator', overrides).includes('analytics.view'))
})

test('new admin routes are gated to the intended roles', () => {
  assert.equal(canAccessAdminPage('tourism_officer', '/info/admin/reviews'), true)
  assert.equal(canAccessAdminPage('moderator', '/info/admin/reviews'), false)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/feedback', 'PATCH'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/listing-categories', 'POST'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/alerts/categories', 'GET'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/alerts/categories', 'POST'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/alerts/categories', 'POST'), false)
  assert.equal(canAccessAdminApi('admin', '/info/api/admin/alerts/categories', 'POST'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/security/login-failures', 'GET'), false)
  assert.equal(canAccessAdminPage('tourism_officer', '/info/admin/settings/categories'), true)
  assert.equal(canAccessAdminPage('moderator', '/info/admin/settings/categories'), false)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/me', 'GET'), true)
})

test('traffic can be grouped by day, week or month and exports label the bucket', () => {
  assert.equal(parseTrafficBucket(null), 'day')
  assert.equal(parseTrafficBucket('week'), 'week')
  assert.equal(parseTrafficBucket('year'), null)
  const traffic = buildAnalyticsTables({ trafficBucket: 'month', traffic: [{ date: '2026-10-01', pageViews: 3, uniqueVisitors: 2 }] })
    .find((table) => table.name === 'Traffic')
  assert.match(traffic.headers[0], /Month/)
  assert.deepEqual(traffic.rows[0], ['2026-10', 3, 2])
})

test('idle sessions expire and carry per-person permissions', () => {
  const now = Math.floor(Date.now() / 1000)
  assert.equal(serverAuth.isSessionIdleExpired({ idle: 600, last_active: now - 601 }), true)
  assert.equal(serverAuth.isSessionIdleExpired({ idle: 600, last_active: now - 30 }), false)
  assert.equal(serverAuth.isSessionIdleExpired({ last_active: now - 99999 }), false)

  const cookie = serverAuth.createSecureSessionCookie({ id: 'u1', user_type: 'moderator' }, 3600, 2, { perms: { grant: ['analytics.view'], revoke: [] }, idleSeconds: 900 })
  const session = serverAuth.getServerSession({ cookies: { get: () => ({ value: cookie }) } })
  assert.deepEqual(session.perms, { grant: ['analytics.view'], revoke: [] })
  assert.equal(session.idle, 900)
  assert.ok(session.last_active >= now)
})

test('migration 102 protects office replies and keeps restore and lockout server-only', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/102_settings_reviews_enforcement.sql', import.meta.url), 'utf8')
  assert.match(sql, /NEW\.office_reply := OLD\.office_reply/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_restore_backup\(jsonb, text\[\], jsonb\) FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /NOT \(v_table = 'info_users' AND c\.column_name = 'password'\)/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.staff_permission_overrides FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /CHECK \(ban_type IN \('posting', 'suspension'\)\)/)
  assert.match(sql, /v_max integer := LEAST\(GREATEST\(COALESCE\(p_max_attempts, 5\), 3\), 20\)/)
})

test('each admin_app_settings id check keeps every id allowed by earlier migrations', async () => {
  const { readdirSync } = await import('node:fs')
  const dir = new URL('../../supabase/migrations/', import.meta.url)
  let allowed = []
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(new URL(file, dir), 'utf8')
    for (const match of sql.matchAll(/admin_app_settings_id_check\s+CHECK\s*\(\s*id IN\s*\(([^)]*)\)/gi)) {
      const ids = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
      for (const id of allowed) assert.ok(ids.includes(id), `${file} drops settings id "${id}"`)
      allowed = ids
    }
  }
  assert.ok(allowed.includes('rewards'))
})
