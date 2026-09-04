const ADMIN_ROLE = 'admin'

const normalizeRole = (role) => {
  if (typeof role !== 'string') return ''
  return role.trim().toLowerCase()
}

const hasAdminAccess = (role) => normalizeRole(role) === ADMIN_ROLE

const canAccessAdminDashboard = (sessionUser) => {
  if (!sessionUser || typeof sessionUser !== 'object') return false
  return hasAdminAccess(sessionUser.role)
}

const getAdminRoleLabel = (role) => {
  const normalized = normalizeRole(role)
  if (normalized === ADMIN_ROLE) return 'Administrator'
  return 'Admin Access'
}

const getAdminHomePath = () => '/admin/dashboard'

module.exports = {
  ADMIN_ROLE,
  normalizeRole,
  hasAdminAccess,
  canAccessAdminDashboard,
  getAdminRoleLabel,
  getAdminHomePath,
}
