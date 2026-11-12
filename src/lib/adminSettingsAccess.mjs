import { hasPermission } from './staffRoles.mjs'

export function canManageAppSetting(session, settingId) {
  if (hasPermission(session?.role, 'system.manage', session?.perms)) return true
  return settingId === 'general' && hasPermission(session?.role, 'tourism.manage', session?.perms)
}
