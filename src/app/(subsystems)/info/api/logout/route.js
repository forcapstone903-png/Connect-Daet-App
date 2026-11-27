import { NextResponse } from 'next/server'
import { clearSecureSessionCookie, getServerSession } from '@/lib/serverAuth'
import { createSessionAdminClient, revokeUserSessions } from '@/lib/sessionVersions'

export async function POST(request) {
  const session = getServerSession(request)
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  let adminSupabase = null
  let sessionsRevoked = false
  let supabaseSessionRevoked = false

  if (session?.user_id || accessToken) {
    try {
      adminSupabase = createSessionAdminClient()
    } catch (error) {
      console.error('Logout Supabase admin client initialization failed:', {
        code: error.code || null,
        status: error.status || null,
      })
    }
  }

  if (accessToken) {
    try {
      if (!adminSupabase) throw new Error('Supabase admin client is unavailable.')
      const { error } = await adminSupabase.auth.admin.signOut(accessToken, 'global')
      if (error) throw error
      supabaseSessionRevoked = true
    } catch (error) {
      console.error('Logout Supabase session revocation failed:', {
        code: error.code || null,
        status: error.status || null,
      })
    }
  }

  if (session?.user_id) {
    try {
      await revokeUserSessions(adminSupabase, session.user_id)
      sessionsRevoked = true
    } catch (error) {
      console.error('Logout session revocation failed:', { code: error.code || null })
    }
  }

  try {
    // Clear the auth cookie on the client side by setting Set-Cookie header
    const response = NextResponse.json(
      { success: true, sessionsRevoked, supabaseSessionRevoked, message: 'Logged out successfully' },
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
