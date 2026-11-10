import { NextResponse } from 'next/server'
import { clearSecureSessionCookie, getServerSession } from '@/lib/serverAuth'
import { createSessionAdminClient, revokeUserSessions } from '@/lib/sessionVersions'

export async function POST(request) {
  const session = getServerSession(request)
  let sessionsRevoked = false

  if (session?.user_id) {
    try {
      await revokeUserSessions(createSessionAdminClient(), session.user_id)
      sessionsRevoked = true
    } catch (error) {
      console.error('Logout session revocation failed:', { code: error.code || null })
    }
  }

  try {
    // Clear the auth cookie on the client side by setting Set-Cookie header
    const response = NextResponse.json(
      { success: true, sessionsRevoked, message: 'Logged out successfully' },
      { status: 200 }
    )

    // Set cookie to expire immediately
    response.cookies.set('daet_auth_session', '', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
    clearSecureSessionCookie(response)

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { success: false, message: 'Logout failed' },
      { status: 500 }
    )
  }
}
