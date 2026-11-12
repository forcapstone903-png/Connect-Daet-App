import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { getAdminAuthorizationStatus } from '@/lib/adminRolePolicy.mjs'

export function authorizeAdminApi(request) {
  const session = getServerSession(request)
  const pathname = request.nextUrl?.pathname || new URL(request.url).pathname
  const status = getAdminAuthorizationStatus(session, pathname, request.method)

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
        { success: false, message: 'Your role does not have access to this action.' },
        { status: 403 }
      ),
    }
  }

  return { session, response: null }
}
