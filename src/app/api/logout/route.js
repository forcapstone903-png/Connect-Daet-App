import { NextResponse } from 'next/server'
import { clearAuthCookie } from '@/lib/authCookies'
import { clearSecureSessionCookie } from '@/lib/serverAuth'

export async function POST(request) {
  try {
    // Clear the auth cookie on the client side by setting Set-Cookie header
    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully' },
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
