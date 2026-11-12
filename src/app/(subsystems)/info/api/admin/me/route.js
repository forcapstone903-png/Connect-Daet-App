import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { getEffectivePermissions, normalizePermissionOverrides, normalizeStaffRole } from '@/lib/staffRoles.mjs'

export const dynamic = 'force-dynamic'

// The signed session's role and per-person overrides, so the admin sidebar
// shows exactly the links the proxy and admin APIs will allow.
export async function GET(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const overrides = normalizePermissionOverrides(session.perms)
  return NextResponse.json(
    {
      success: true,
      role: normalizeStaffRole(session.role),
      overrides,
      permissions: getEffectivePermissions(session.role, overrides),
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  )
}
