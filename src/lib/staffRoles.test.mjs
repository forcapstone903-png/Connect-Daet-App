import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  canAccessAdminApi,
  canAccessAdminPage,
  getStaffRoleLabel,
  getStaffHomePath,
  hasPermission,
  isStaffRole,
  normalizeStaffRole,
  resolveAuthenticatedUserRole,
} from './staffRoles.mjs'
import { getAdminAuthorizationStatus } from './adminRolePolicy.mjs'

test('normalizes roles and recognises staff', () => {
  assert.equal(normalizeStaffRole(' Administrator '), 'admin')
  assert.equal(normalizeStaffRole('Tourism Officer'), 'tourism_officer')
  assert.equal(isStaffRole('moderator'), true)
  assert.equal(isStaffRole('tourist'), false)
  assert.equal(isStaffRole(undefined), false)
  assert.equal(getStaffRoleLabel('tourism_officer'), 'Tourism Officer')
})

test('authenticated roles trust the database profile and never staff metadata', () => {
  assert.equal(resolveAuthenticatedUserRole('admin', 'tourist'), 'admin')
  assert.equal(resolveAuthenticatedUserRole('administrator', 'tourist'), 'admin')
  assert.equal(resolveAuthenticatedUserRole('tourism_officer', 'moderator'), 'tourism_officer')
  assert.equal(resolveAuthenticatedUserRole(null, 'moderator'), 'tourist')
  assert.equal(resolveAuthenticatedUserRole(null, 'business'), 'business')
  assert.equal(resolveAuthenticatedUserRole('tourist', 'admin'), 'tourist')
})

test('staff roles have separate dashboard routes with role-specific access', () => {
  assert.equal(getStaffHomePath('admin'), '/info/admin/dashboard')
  assert.equal(getStaffHomePath('tourism_officer'), '/info/admin/tourism-dashboard')
  assert.equal(getStaffHomePath('moderator'), '/info/admin/moderator-dashboard')
  assert.equal(getStaffHomePath('tourist'), '/info/user/dashboard')

  assert.equal(canAccessAdminPage('tourism_officer', '/info/admin/tourism-dashboard'), true)
  assert.equal(canAccessAdminPage('tourism_officer', '/info/admin/moderator-dashboard'), false)
  assert.equal(canAccessAdminPage('moderator', '/info/admin/moderator-dashboard'), true)
  assert.equal(canAccessAdminPage('moderator', '/info/admin/tourism-dashboard'), false)
})

test('admin holds every permission', () => {
  for (const permission of ['system.manage', 'users.manage', 'tourism.manage', 'moderation.manage']) {
    assert.equal(hasPermission('admin', permission), true, permission)
  }
})

test('tourism officer reaches tourism pages only', () => {
  const role = 'tourism_officer'
  assert.equal(canAccessAdminPage(role, '/info/admin/dashboard'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/tourist-spots'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/events'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/notifications/send'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/analytics/reports'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/account/password'), true)
  for (const page of ['general', 'appearance', 'categories', 'rewards']) {
    assert.equal(canAccessAdminPage(role, `/info/admin/settings/${page}`), true, page)
  }

  assert.equal(canAccessAdminPage(role, '/info/admin/moderation'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/users'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/settings/security'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/settings/email'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/settings/maintenance'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/settings'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/data/backups'), false)
  assert.equal(canAccessAdminApi(role, '/info/api/admin/events', 'DELETE'), true)
})

test('moderator reaches community pages only', () => {
  const role = 'moderator'
  assert.equal(canAccessAdminPage(role, '/info/admin/moderation'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/blogs?status=all'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/forum'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/users'), true)
  assert.equal(canAccessAdminApi(role, '/info/api/admin/moderation/user-content', 'DELETE'), true)
  assert.equal(canAccessAdminApi(role, '/info/api/admin/events', 'DELETE'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/announcement'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/community-guidelines'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/moderation/notifications'), true)
  assert.equal(canAccessAdminPage(role, '/info/admin/settings/appearance'), true)

  assert.equal(canAccessAdminPage(role, '/info/admin/tourist-spots'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/notifications/send'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/settings/general'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/settings/categories'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/settings/rewards'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/settings'), false)
  assert.equal(canAccessAdminPage(role, '/info/admin/activity-logs'), false)
  assert.equal(canAccessAdminPage('tourism_officer', '/info/admin/announcement'), false)
})

test('moderator discussion controls require moderation permission', () => {
  const apiPath = '/info/api/admin/moderation/comments'
  assert.equal(canAccessAdminApi('moderator', apiPath, 'GET'), true)
  assert.equal(canAccessAdminApi('moderator', apiPath, 'POST'), true)
  assert.equal(canAccessAdminApi('moderator', apiPath, 'DELETE'), true)
  assert.equal(canAccessAdminApi('tourism_officer', apiPath, 'GET'), false)
})

test('public FAQ management is available to tourism officers and admins, not moderators', () => {
  const page = '/info/admin/faqs'
  const api = '/info/api/admin/faqs'

  assert.equal(canAccessAdminPage('admin', page), true)
  assert.equal(canAccessAdminPage('tourism_officer', page), true)
  assert.equal(canAccessAdminPage('moderator', page), false)
  assert.equal(canAccessAdminApi('admin', api, 'POST'), true)
  assert.equal(canAccessAdminApi('tourism_officer', api, 'PATCH'), true)
  assert.equal(canAccessAdminApi('moderator', api, 'DELETE'), false)
  assert.equal(canAccessAdminApi('tourist', api, 'GET'), false)
})

test('staff notification inbox is limited to signed-in console users', () => {
  const inbox = '/info/admin/notifications/inbox'
  assert.equal(canAccessAdminPage('admin', inbox), true)
  assert.equal(canAccessAdminPage('tourism_officer', inbox), true)
  assert.equal(canAccessAdminPage('moderator', inbox), true)
  assert.equal(canAccessAdminPage('tourist', inbox), false)
})

test('staff chat is available to all staff roles and unavailable to regular users', () => {
  for (const role of ['admin', 'tourism_officer', 'moderator']) {
    assert.equal(canAccessAdminPage(role, '/info/admin/staff-chat'), true, `${role} page`)
    assert.equal(canAccessAdminApi(role, '/info/api/admin/staff-chat', 'GET'), true, `${role} read`)
    assert.equal(canAccessAdminApi(role, '/info/api/admin/staff-chat', 'POST'), true, `${role} send`)
  }
  for (const role of ['tourist', 'business']) {
    assert.equal(canAccessAdminPage(role, '/info/admin/staff-chat'), false, `${role} page`)
    assert.equal(canAccessAdminApi(role, '/info/api/admin/staff-chat', 'GET'), false, `${role} read`)
    assert.equal(canAccessAdminApi(role, '/info/api/admin/staff-chat', 'POST'), false, `${role} send`)
  }
})

test('unknown admin pages and APIs default to admin-only', () => {
  assert.equal(canAccessAdminPage('moderator', '/info/admin/some-new-page'), false)
  assert.equal(canAccessAdminPage('admin', '/info/admin/some-new-page'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/some-new-api', 'GET'), false)
})

test('a prefix rule does not leak to a longer sibling path', () => {
  // /info/admin/blog must not match /info/admin/blogs-export, etc.
  assert.equal(canAccessAdminPage('moderator', '/info/admin/blogsexport'), false)
})

test('API rules are method aware', () => {
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/users', 'GET'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/users', 'PATCH'), false)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/users', 'DELETE'), false)
  assert.equal(canAccessAdminApi('admin', '/info/api/admin/users', 'POST'), true)

  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/tourist-spots/abc', 'PUT'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/tourist-spots/geocode', 'GET'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/tourist-spots/geocode', 'GET'), false)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/blogs', 'GET'), false)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/blogs/abc', 'PATCH'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/community-guidelines', 'PATCH'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/settings', 'GET'), false)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/settings', 'GET'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/settings', 'PUT'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/settings/maintenance', 'GET'), false)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/settings/email', 'PUT'), false)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/alerts/categories', 'POST'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/listing-categories', 'POST'), true)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/rewards', 'PUT'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/audit-logs', 'GET'), false)
  assert.equal(canAccessAdminApi('admin', '/info/api/admin/audit-logs', 'GET'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/media', 'DELETE'), false)
  assert.equal(canAccessAdminApi('tourist', '/info/api/admin/tourist-spots', 'GET'), false)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/analytics', 'GET'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/analytics', 'GET'), false)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/analytics/visits', 'GET'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/analytics/visits', 'GET'), false)
})

test('authorization status maps to 401/403/null', () => {
  assert.equal(getAdminAuthorizationStatus(null, '/info/api/admin/forum'), 401)
  assert.equal(getAdminAuthorizationStatus({ user_id: 'u', role: 'tourist' }, '/info/api/admin/forum'), 403)
  assert.equal(getAdminAuthorizationStatus({ user_id: 'u', role: 'moderator' }, '/info/api/admin/forum', 'POST'), null)
  assert.equal(getAdminAuthorizationStatus({ user_id: 'u', role: 'moderator' }, '/info/api/admin/events', 'POST'), 403)
  // No pathname => legacy admin-only behaviour.
  assert.equal(getAdminAuthorizationStatus({ user_id: 'u', role: 'moderator' }), 403)
})

test('every sidebar link is reachable by at least the admin and gated consistently', () => {
  const source = readFileSync(new URL('../app/(subsystems)/info/components/AdminSidebar.js', import.meta.url), 'utf8')
  const hrefs = [...source.matchAll(/href: '([^']+)'/g)].map((match) => match[1])
  assert.ok(hrefs.length > 10)
  for (const href of hrefs) {
    assert.equal(canAccessAdminPage('admin', href), true, href)
  }
  assert.doesNotMatch(source, /requiredRoles/)
})

test('super-admin sidebar is focused on system administration', () => {
  const source = readFileSync(new URL('../app/(subsystems)/info/components/AdminSidebar.js', import.meta.url), 'utf8')
  const adminNavigation = source.split('const staffNavigationSections = [')[0]

  for (const href of [
    '/info/admin/dashboard',
    '/info/admin/users',
    '/info/admin/analytics',
    '/info/admin/activity-logs',
    '/info/admin/settings/general',
    '/info/admin/settings/appearance',
    '/info/admin/announcement-settings',
    '/info/admin/settings/security',
    '/info/admin/settings/email',
    '/info/admin/data/backups',
  ]) {
    assert.ok(adminNavigation.includes(href), href)
  }
  assert.doesNotMatch(adminNavigation, /href: '\/info\/admin\/(blogs|tourist-spots|events|forum|feedback|moderation)/)
  assert.match(source, /userRole === STAFF_ROLES\.ADMIN\s*\?\s*adminNavigationSections\s*:\s*staffNavigationSections/)
})

test('moderator and tourism officer sidebars show only administration settings', () => {
  const source = readFileSync(new URL('../app/(subsystems)/info/components/AdminSidebar.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /id: 'staff-settings'/)
  assert.match(source, /id: 'administration',\s*label: 'Administration'/)
  assert.match(source, /id: 'settings',\s*label: 'Settings'/)
})

test('migration 096 guards role changes and widens reviewer checks', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/096_staff_roles_rbac.sql', import.meta.url), 'utf8')
  assert.match(sql, /'tourism_officer'/)
  assert.match(sql, /'admin', 'administrator', 'tourism_officer'/)
  assert.match(sql, /guard_info_users_privileged_columns/)
  assert.match(sql, /NEW\.user_type IS DISTINCT FROM OLD\.user_type/)
  assert.match(sql, /admin_set_user_role/)
  assert.match(sql, /last_admin/)
  for (const fn of ['moderate_info_blog', 'admin_transition_info_blog', 'admin_edit_info_blog', 'admin_delete_info_blog', 'moderate_info_event']) {
    assert.match(sql, new RegExp(`'${fn}'`), fn)
  }
})

test('login never grants a staff role from user-editable metadata', () => {
  const source = readFileSync(new URL('../app/(subsystems)/info/api/login/route.js', import.meta.url), 'utf8')
  const callback = readFileSync(new URL('../app/(subsystems)/info/(auth)/callback/route.js', import.meta.url), 'utf8')
  assert.match(source, /sessionAdmin\s*\.from\('info_users'\)/)
  assert.match(source, /resolveAuthenticatedUserRole\(userProfile\.user_type, metadataRole\)/)
  assert.match(callback, /sessionAdmin\s*\.from\('info_users'\)/)
  assert.match(callback, /resolveAuthenticatedUserRole\(profile\?\.user_type,\s*user\.user_metadata\?\.user_type\)/)
})
