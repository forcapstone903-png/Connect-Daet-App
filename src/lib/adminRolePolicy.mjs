import { canAccessAdminApi, hasPermission, isStaffRole } from './staffRoles.mjs'

// Returns 401 (no session), 403 (not allowed) or null (allowed).
// Without a pathname the check is admin-only, which keeps older callers safe.
export function getAdminAuthorizationStatus(session, pathname = null, method = 'GET') {
  if (!session?.user_id) return 401
  if (!isStaffRole(session.role)) return 403
  if (!pathname) return hasPermission(session.role, 'system.manage', session.perms) ? null : 403
  return canAccessAdminApi(session.role, pathname, method, session.perms) ? null : 403
}
