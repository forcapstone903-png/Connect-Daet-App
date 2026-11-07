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
  '/info/visitor',
  '/info/login',
  '/info/register',
  '/info/forgot-password',
  '/info/reset-password',
])

const LEGACY_INFO_ROUTE_PREFIXES = [
  '/access-denied',
  '/blog',
  '/callback',
  '/confirm',
  '/events',
  '/forgot-password',
  '/forum',
  '/legal',
  '/login',
  '/register',
  '/reset-password',
  '/search',
  '/tourist-spots',
  '/visitor',
]

const VISITOR_CONTENT_ROUTE_PREFIXES = [
  '/blog',
  '/events',
  '/forum',
  '/search',
  '/tourist-spots',
]

const MAINTENANCE_EXEMPT_PATHS = new Set([
  '/info/maintenance',
  '/info/login',
  '/info/forgot-password',
  '/info/reset-password',
  '/info/confirm',
  '/info/callback',
  '/info/api/login',
  '/info/api/logout',
  '/info/api/forgot-password',
  '/info/api/reset-password',
  '/info/api/resend-verification',
  '/info/api/auth/confirm-email',
])

async function getMaintenanceSettings() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Maintenance status is unavailable because server Supabase credentials are missing.')
    return null
  }

  try {
    const url = new URL('/rest/v1/site_maintenance_settings', supabaseUrl)
    url.searchParams.set('select', 'enabled,message')
    url.searchParams.set('id', 'eq.1')
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    })

    if (!response.ok) {
      console.error('Maintenance status lookup failed with HTTP status:', response.status)
      return null
    }

    const settings = await response.json()
    if (!Array.isArray(settings) || !settings[0] || typeof settings[0].enabled !== 'boolean') {
      console.error('Maintenance status lookup returned an invalid or missing settings record.')
      return null
    }

    return {
      enabled: settings[0].enabled,
      message: typeof settings[0].message === 'string'
        ? settings[0].message.slice(0, 500)
        : 'We are currently performing scheduled maintenance. Please check back soon.',
    }
  } catch (error) {
    console.error('Maintenance status lookup failed; allowing the request through:', error)
    return null
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/'

  if (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/user' ||
    pathname.startsWith('/user/')
  ) {
    const legacyUrl = request.nextUrl.clone()
    legacyUrl.pathname = `/info${pathname}`
    return NextResponse.redirect(legacyUrl)
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const legacyApiUrl = request.nextUrl.clone()
    legacyApiUrl.pathname = `/info${pathname}`
    return NextResponse.rewrite(legacyApiUrl)
  }

  if (LEGACY_INFO_ROUTE_PREFIXES.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ))) {
    const legacyUrl = request.nextUrl.clone()
    legacyUrl.pathname = `/info${pathname}`
    return NextResponse.redirect(legacyUrl)
  }

  if (VISITOR_CONTENT_ROUTE_PREFIXES.some((prefix) => (
    pathname === `/info${prefix}` || pathname.startsWith(`/info${prefix}/`)
  ))) {
    const visitorUrl = request.nextUrl.clone()
    visitorUrl.pathname = `/info/visitor${pathname.slice('/info'.length)}`
    return NextResponse.redirect(visitorUrl)
  }

  // Authorization is based on the signed, HTTP-only server session cookie.
  // The client-facing `daet_auth_session` cookie is treated as display-only
  // state and is never trusted for access control, since it can be forged.
  const serverSession = getServerSession(request)
  const loggedIn = Boolean(serverSession && serverSession.user_id)
  const role = String(serverSession?.role || '').trim().toLowerCase()
  const isAdmin = loggedIn && (role === 'admin' || role === 'administrator')
  const isAdminRoute = pathname === '/info/admin' || pathname.startsWith('/info/admin/')

  const isStaticOrAsset = pathname.startsWith('/_next') || pathname.includes('.')
  if (!isAdmin && !isAdminRoute && !isStaticOrAsset && !MAINTENANCE_EXEMPT_PATHS.has(normalizedPathname)) {
    const maintenance = await getMaintenanceSettings()
    if (maintenance?.enabled) {
      if (pathname === '/info/api' || pathname.startsWith('/info/api/')) {
        return NextResponse.json(
          { success: false, code: 'SITE_MAINTENANCE', message: maintenance.message },
          {
            status: 503,
            headers: {
              'Cache-Control': 'no-store',
              'Retry-After': '60',
            },
          }
        )
      }

      const maintenanceUrl = request.nextUrl.clone()
      maintenanceUrl.pathname = '/info/maintenance'
      maintenanceUrl.search = ''
      maintenanceUrl.searchParams.set('message', maintenance.message)
      return NextResponse.rewrite(maintenanceUrl, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }
  }

  // Logged-in users go straight to their dashboard instead of a landing/auth page.
  if (loggedIn && AUTHD_ONLY_EXIT.has(normalizedPathname)) {
    return NextResponse.redirect(
      new URL(isAdmin ? '/info/admin/dashboard' : '/info/user/dashboard', request.url)
    )
  }

  // Public routes pass through.
  if (
    publicRoutes.isPublicPathname(pathname) ||
    pathname.startsWith('/_next') ||
    pathname === '/info/api' ||
    pathname.startsWith('/info/api/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Everything else requires a valid server session.
  if (!loggedIn) {
    const loginUrl = new URL('/info/login', request.url)
    loginUrl.searchParams.set('message', 'Please sign in to continue.')
    return NextResponse.redirect(loginUrl)
  }

  if (
    (normalizedPathname === '/info/admin' || pathname.startsWith('/info/admin/')) &&
    !isAdmin
  ) {
    return NextResponse.redirect(new URL('/info/access-denied?reason=admin', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:path*',
    '/admin/:path*',
    '/user/:path*',
    '/info/:path*',
    '/',
    '/access-denied',
    '/callback',
    '/blog/:path*',
    '/confirm',
    '/events/:path*',
    '/forgot-password',
    '/forum/:path*',
    '/legal/:path*',
    '/login',
    '/register',
    '/reset-password',
    '/search/:path*',
    '/tourist-spots/:path*',
    '/info/visitor',
    '/visitor',
    '/info/login',
    '/info/register',
    '/info/forgot-password',
    '/info/reset-password',
  ],
}
