// Single source of truth for back-office role-based access control (RBAC).
//
// Three staff roles share one admin console at /info/admin. Each role sees only
// the menus it is allowed to use (AdminSidebar), each admin page is gated in the
// proxy (src/proxy.js), and each admin API is gated in authorizeAdminApi
// (src/lib/adminApiAuth.js). All three read the rules below, so a route added
// here is enforced consistently in the UI, the page router and the API.
//
// Anything under /info/admin or /info/api/admin that matches no rule is
// admin-only (deny by default).

export const STAFF_ROLES = Object.freeze({
  ADMIN: 'admin',
  TOURISM_OFFICER: 'tourism_officer',
  MODERATOR: 'moderator',
})

const ROLE_ALIASES = Object.freeze({
  administrator: STAFF_ROLES.ADMIN,
  'super_admin': STAFF_ROLES.ADMIN,
  'tourism officer': STAFF_ROLES.TOURISM_OFFICER,
  'tourism-officer': STAFF_ROLES.TOURISM_OFFICER,
})

export const STAFF_ROLE_LABELS = Object.freeze({
  [STAFF_ROLES.ADMIN]: 'Administrator',
  [STAFF_ROLES.TOURISM_OFFICER]: 'Tourism Officer',
  [STAFF_ROLES.MODERATOR]: 'Moderator',
})

// Permission → roles that hold it. Admin holds every permission implicitly.
export const PERMISSIONS = Object.freeze({
  'console.access': ['tourism_officer', 'moderator'],
  'account.self': ['tourism_officer', 'moderator'],
  'media.use': ['tourism_officer', 'moderator'],
  'content.notify': ['tourism_officer', 'moderator'],
  'tourism.manage': ['tourism_officer'],
  'alerts.broadcast': ['tourism_officer'],
  'announcements.manage': ['moderator'],
  'feedback.manage': ['tourism_officer'],
  'analytics.view': ['tourism_officer'],
  'moderation.manage': ['moderator'],
  'forum.manage': ['moderator'],
  'users.view': ['moderator'],
  'users.manage': [],
  'system.manage': [],
})

// Page rules: first match wins, so more specific prefixes come first.
const PAGE_RULES = [
  ['/info/admin/tourism-dashboard', 'tourism.manage'],
  ['/info/admin/moderator-dashboard', 'moderation.manage'],
  ['/info/admin/dashboard', 'console.access'],
  ['/info/admin/account', 'account.self'],
  ['/info/admin/community-guidelines', 'moderation.manage'],
  ['/info/admin/faqs', 'feedback.manage'],
  ['/info/admin/moderation/notifications', 'moderation.manage'],
  ['/info/admin/notifications/inbox', 'console.access'],
  ['/info/admin/staff-chat', 'console.access'],

  ['/info/admin/settings/general', 'tourism.manage'],
  ['/info/admin/settings/appearance', 'account.self'],
  ['/info/admin/settings/categories', 'tourism.manage'],
  ['/info/admin/settings/rewards', 'tourism.manage'],
  ['/info/admin/tourist-spots', 'tourism.manage'],
  ['/info/admin/events', 'tourism.manage'],
  ['/info/admin/event-approvals', 'tourism.manage'],
  ['/info/admin/content/attractions', 'tourism.manage'],
  ['/info/admin/content/events', 'tourism.manage'],
  ['/info/admin/content/blogs', 'moderation.manage'],
  ['/info/admin/content', 'tourism.manage'],
  ['/info/admin/alerts', 'alerts.broadcast'],
  ['/info/admin/announcement-settings', 'system.manage'],
  ['/info/admin/announcement', 'announcements.manage'],
  ['/info/admin/notifications', 'alerts.broadcast'],
  ['/info/admin/feedback', 'feedback.manage'],
  ['/info/admin/reviews', 'feedback.manage'],
  ['/info/admin/community/feedback', 'feedback.manage'],
  ['/info/admin/analytics', 'analytics.view'],
  ['/info/admin/engagement', 'analytics.view'],

  ['/info/admin/moderation', 'moderation.manage'],
  ['/info/admin/community/moderation', 'moderation.manage'],
  ['/info/admin/blogs', 'moderation.manage'],
  ['/info/admin/blog', 'moderation.manage'],
  ['/info/admin/forum', 'forum.manage'],
  ['/info/admin/community/forum', 'forum.manage'],
  ['/info/admin/community/users', 'users.view'],
  ['/info/admin/community', 'moderation.manage'],
  ['/info/admin/users', 'users.view'],
]

// API rules: [prefix, permission, methods?]. A rule with methods only applies
// to those HTTP methods; otherwise the next matching rule is tried.
const API_RULES = [
  ['/info/api/admin/me', 'console.access', ['GET']],
  ['/info/api/admin/staff-chat', 'console.access'],
  ['/info/api/admin/users', 'users.view', ['GET']],
  ['/info/api/admin/users', 'users.manage'],

  ['/info/api/admin/tourist-spots', 'tourism.manage'],
  ['/info/api/admin/alerts/categories', 'alerts.broadcast', ['GET']],
  ['/info/api/admin/alerts/categories', 'tourism.manage'],
  ['/info/api/admin/alerts', 'alerts.broadcast'],
  ['/info/api/admin/listing-categories', 'tourism.manage'],
  ['/info/api/admin/settings/maintenance', 'system.manage'],
  ['/info/api/admin/settings/email', 'system.manage'],
  ['/info/api/admin/settings', 'tourism.manage', ['GET', 'PUT']],
  ['/info/api/admin/rewards', 'tourism.manage'],
  ['/info/api/admin/reviews', 'feedback.manage'],
  ['/info/api/admin/feedback', 'feedback.manage'],
  ['/info/api/admin/faqs', 'feedback.manage'],
  ['/info/api/admin/events', 'tourism.manage'],
  ['/info/api/admin/weather', 'console.access', ['GET']],
  ['/info/api/admin/analytics', 'analytics.view', ['GET']],
  ['/info/api/admin/audit-logs', 'system.manage', ['GET']],
  ['/info/api/admin/content-notifications', 'content.notify'],
  ['/info/api/analytics/visits', 'analytics.view', ['GET']],
  ['/info/api/admin/media', 'media.use', ['GET', 'POST']],

  ['/info/api/admin/blogs', 'moderation.manage'],
  ['/info/api/admin/moderation', 'moderation.manage'],
  ['/info/api/admin/community-guidelines', 'moderation.manage'],
  ['/info/api/admin/forum', 'forum.manage'],
]

const pathMatches = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)

const cleanPath = (pathname) => {
  const path = String(pathname || '').split('?')[0].split('#')[0]
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

export function normalizeStaffRole(role) {
  if (typeof role !== 'string') return ''
  const normalized = role.trim().toLowerCase()
  return ROLE_ALIASES[normalized] || normalized
}

export function isStaffRole(role) {
  return Object.values(STAFF_ROLES).includes(normalizeStaffRole(role))
}

export function resolveAuthenticatedUserRole(profileRole, metadataRole) {
  const storedRole = normalizeStaffRole(profileRole)
  if (isStaffRole(storedRole) || storedRole === 'tourist' || storedRole === 'business') {
    return storedRole
  }

  const fallbackRole = String(metadataRole || '').trim().toLowerCase()
  return fallbackRole === 'business' ? 'business' : 'tourist'
}

export function getStaffRoleLabel(role) {
  return STAFF_ROLE_LABELS[normalizeStaffRole(role)] || 'Staff'
}

// Per-person adjustments on top of a staff role (staff_permission_overrides,
// carried in the signed session as `perms`). Admin always holds everything.
// Granting is limited so an override can never create a second administrator,
// and console access / own account can never be revoked.
export const ALL_PERMISSIONS = Object.freeze(Object.keys(PERMISSIONS))
export const GRANTABLE_PERMISSIONS = Object.freeze(
  ALL_PERMISSIONS.filter((permission) => !['users.manage', 'system.manage'].includes(permission))
)
export const REVOCABLE_PERMISSIONS = Object.freeze(
  ALL_PERMISSIONS.filter((permission) => !['console.access', 'account.self'].includes(permission))
)

export function normalizePermissionOverrides(overrides) {
  const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).filter((item) => allowed.includes(item)))].sort()
  const grant = pick(overrides?.grant, GRANTABLE_PERMISSIONS)
  const revoke = pick(overrides?.revoke, REVOCABLE_PERMISSIONS).filter((item) => !grant.includes(item))
  return { grant, revoke }
}

export function hasPermission(role, permission, overrides = null) {
  const normalized = normalizeStaffRole(role)
  if (normalized === STAFF_ROLES.ADMIN) return true
  if (!isStaffRole(normalized)) return false
  const adjusted = overrides ? normalizePermissionOverrides(overrides) : null
  if (adjusted?.revoke.includes(permission)) return false
  if (adjusted?.grant.includes(permission)) return true
  return Boolean(PERMISSIONS[permission]?.includes(normalized))
}

export function getEffectivePermissions(role, overrides = null) {
  return ALL_PERMISSIONS.filter((permission) => hasPermission(role, permission, overrides))
}

export function getRequiredPagePermission(pathname) {
  const path = cleanPath(pathname)
  if (path === '/info/admin') return 'console.access'
  const rule = PAGE_RULES.find(([prefix]) => pathMatches(path, prefix))
  return rule ? rule[1] : 'system.manage'
}

export function getRequiredApiPermission(pathname, method = 'GET') {
  const path = cleanPath(pathname)
  const verb = String(method || 'GET').toUpperCase()
  const rule = API_RULES.find(([prefix, , methods]) =>
    pathMatches(path, prefix) && (!methods || methods.includes(verb))
  )
  return rule ? rule[1] : 'system.manage'
}

export function canAccessAdminPage(role, pathname, overrides = null) {
  return isStaffRole(role) && hasPermission(role, getRequiredPagePermission(pathname), overrides)
}

export function canAccessAdminApi(role, pathname, method, overrides = null) {
  return isStaffRole(role) && hasPermission(role, getRequiredApiPermission(pathname, method), overrides)
}

export function getStaffHomePath(role) {
  switch (normalizeStaffRole(role)) {
    case STAFF_ROLES.ADMIN:
      return '/info/admin/dashboard'
    case STAFF_ROLES.TOURISM_OFFICER:
      return '/info/admin/tourism-dashboard'
    case STAFF_ROLES.MODERATOR:
      return '/info/admin/moderator-dashboard'
    default:
      return '/info/user/dashboard'
  }
}

// Roles an administrator may assign from the Users page.
export const ASSIGNABLE_ROLES = Object.freeze(['tourist', 'business', ...Object.values(STAFF_ROLES)])
