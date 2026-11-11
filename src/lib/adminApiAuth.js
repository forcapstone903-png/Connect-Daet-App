import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { getAdminAuthorizationStatus } from '@/lib/adminRolePolicy.mjs'

export function authorizeAdminApi(request) {
  const session = getServerSession(request)
  const status = getAdminAuthorizationStatus(session)

  if (status === 401) {
    return {
      session: null,
      response: NextResponse.json(
        { success: false, message: 'User session is required.' },
        { status: 401 }
      ),
    }
  }

  if (status === 403) {
    return {
      session: null,
      response: NextResponse.json(
        { success: false, message: 'Administrator access is required.' },
        { status: 403 }
      ),
    }
  }

  return { session, response: null }
}
