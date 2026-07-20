export const SUPERADMIN_ROLE = 'superadmin'
export const ADMIN_ROLE = 'admin'

export const normalizeRole = (role) => {
  if (typeof role !== 'string') return ''
  return role.trim().toLowerCase()
}

export const hasAdminAccess = (role) => {
  const normalized = normalizeRole(role)
  return normalized === ADMIN_ROLE || normalized === SUPERADMIN_ROLE
}

export const hasSuperAdminAccess = (role) => normalizeRole(role) === SUPERADMIN_ROLE

export const getAdminRoleLabel = (role) => {
  const normalized = normalizeRole(role)
  if (normalized === SUPERADMIN_ROLE) return 'Super Administrator'
  if (normalized === ADMIN_ROLE) return 'Administrator'
  return 'Admin Access'
}

export const getAdminHomePath = (role) => {
  return hasSuperAdminAccess(role) ? '/superadmin/dashboard' : '/admin/dashboard'
}
