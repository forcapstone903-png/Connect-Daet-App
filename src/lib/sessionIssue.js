import { getAppSetting } from './appSettingsServer'
import { STAFF_ROLES, isStaffRole, normalizePermissionOverrides, normalizeStaffRole } from './staffRoles.mjs'

const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST205', '42703'])

export async function loadPermissionOverrides(client, userId, role) {
  const normalized = normalizeStaffRole(role)
  if (!isStaffRole(normalized) || normalized === STAFF_ROLES.ADMIN) return null
  const { data, error } = await client
    .from('staff_permission_overrides')
    .select('permission, granted')
    .eq('user_id', userId)
  if (error) {
    if (MISSING_RELATION_CODES.has(error.code)) return null
    throw error
  }
  return normalizePermissionOverrides({
    grant: (data || []).filter((row) => row.granted).map((row) => row.permission),
    revoke: (data || []).filter((row) => !row.granted).map((row) => row.permission),
  })
}

/** Options for setSecureSessionCookie from Settings -> Security and the user's overrides. */
export async function loadSessionOptions(client, user) {
  const [security, perms] = await Promise.all([
    getAppSetting('security', client),
    loadPermissionOverrides(client, user.id, user.user_type),
  ])
  return {
    sessionSeconds: security.session_hours * 3600,
    rememberSeconds: security.remember_days * 86400,
    idleSeconds: security.idle_timeout_minutes * 60,
    perms,
  }
}
