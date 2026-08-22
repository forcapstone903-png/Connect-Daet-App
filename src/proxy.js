import { NextResponse } from 'next/server'
import publicRoutes from './lib/publicRoutes'

export function proxy(request) {
  const { pathname } = request.nextUrl

  if (publicRoutes.isPublicPathname(pathname) || pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next()
  }

  const authCookie = request.cookies.get('daet_auth_session')?.value
  if (!authCookie) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('message', 'Please sign in to continue.')
    return NextResponse.redirect(loginUrl)
  }

  try {
    const session = JSON.parse(decodeURIComponent(authCookie))
    const role = String(session.role || '').toLowerCase()
    const loggedIn = Boolean(session.logged_in)

    if (!loggedIn) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('message', 'Your session is invalid. Please sign in again.')
      return NextResponse.redirect(loginUrl)
    }

    if (pathname.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL('/access-denied?reason=admin', request.url))
    }
  } catch (error) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('message', 'Your session is invalid. Please sign in again.')
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/welcome/:path*', '/welcome', '/user/:path*', '/user'],
}