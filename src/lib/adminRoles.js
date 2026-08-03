export const ADMIN_ROLE = 'admin'

export const normalizeRole = (role) => {
  if (typeof role !== 'string') return ''
  return role.trim().toLowerCase()
}

export const hasAdminAccess = (role) => normalizeRole(role) === ADMIN_ROLE

export const getAdminRoleLabel = (role) => {
  const normalized = normalizeRole(role)
  if (normalized === ADMIN_ROLE) return 'Administrator'
  return 'Admin Access'
}

export const getAdminHomePath = () => '/admin/dashboard'
