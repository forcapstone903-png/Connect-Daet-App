import { NextResponse } from 'next/server'
import publicRoutes from './lib/publicRoutes'
import { getServerSession } from './lib/serverAuth'

// Routes that already-authenticated users should never sit on. Sitting on these
// was the source of the flicker/glitch: pages like /visitor pushed an authed
// user to /dashboard (or an admin page to /login) while the destination page
// immediately bounced back because per-tab sessionStorage was empty on a fresh
// tab, producing very fast repeated redirects/reloads.
const AUTHD_ONLY_EXIT = new Set([
  '/',
  '/visitor',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
])

export function proxy(request) {
  const { pathname } = request.nextUrl
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/'

  // Authorization is based on the signed, HTTP-only server session cookie.
  // The client-facing `daet_auth_session` cookie is treated as display-only
  // state and is never trusted for access control, since it can be forged.
  const serverSession = getServerSession(request)
  const loggedIn = Boolean(serverSession && serverSession.user_id)
  const role = String(serverSession?.role || '').trim().toLowerCase()
  const isAdmin = loggedIn && role === 'admin'

  // Logged-in users go straight to their dashboard instead of a landing/auth page.
  if (loggedIn && AUTHD_ONLY_EXIT.has(normalizedPathname)) {
    return NextResponse.redirect(
      new URL(isAdmin ? '/admin/dashboard' : '/user/dashboard', request.url)
    )
  }

  // Public routes pass through.
  if (
    publicRoutes.isPublicPathname(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Everything else requires a valid server session.
  if (!loggedIn) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('message', 'Please sign in to continue.')
    return NextResponse.redirect(loginUrl)
  }

  if (pathname.startsWith('/admin') && !isAdmin) {
    return NextResponse.redirect(new URL('/access-denied?reason=admin', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/user/:path*',
    '/',
    '/visitor',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
  ],
}
