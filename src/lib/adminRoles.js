// Client-side helpers for the admin console. The authoritative rules live in
// staffRoles.mjs and are enforced server-side by the proxy and admin APIs.
import {
  STAFF_ROLES,
  canAccessAdminPage,
  getStaffHomePath,
  getStaffRoleLabel,
  hasPermission,
  isStaffRole,
  normalizeStaffRole,
} from './staffRoles.mjs'

export const ADMIN_ROLE = STAFF_ROLES.ADMIN

export const normalizeRole = normalizeStaffRole

// True for any back-office role (admin, tourism officer, moderator). Pages use
// this to decide whether to render the console at all; per-page permissions
// are checked by the proxy before the page loads.
export const hasAdminAccess = (role) => isStaffRole(role)

export const isSuperAdmin = (role) => normalizeStaffRole(role) === STAFF_ROLES.ADMIN

export const canAccessAdminDashboard = (sessionUser) => {
  if (!sessionUser || typeof sessionUser !== 'object') return false
  return isStaffRole(sessionUser.role || sessionUser.user_type)
}

export const getAdminRoleLabel = getStaffRoleLabel

export const getAdminHomePath = (role) => (role ? getStaffHomePath(role) : '/info/admin/dashboard')

export { canAccessAdminPage, hasPermission }
