import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export function authorizeAdminApi(request) {
  const session = getServerSession(request)

  if (!session?.user_id) {
    return {
      session: null,
      response: NextResponse.json(
        { success: false, message: 'User session is required.' },
        { status: 401 }
      ),
    }
  }

  const role = String(session.role || '').trim().toLowerCase()
  if (role !== 'admin' && role !== 'administrator') {
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
