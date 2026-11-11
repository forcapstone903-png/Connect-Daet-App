import { NextResponse } from 'next/server'
import publicRoutes from './lib/publicRoutes'
import { clearSecureSessionCookie, getServerSession } from './lib/serverAuth'

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
  '/info/account-recovery',
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
  '/info/account-recovery',
  '/info/api/account/recovery',
  '/info/api/cron/account-deletions',
  '/info/api/logout',
  '/info/api/forgot-password',
  '/info/api/reset-password',
  '/info/api/resend-verification',
  '/info/api/auth/confirm-email',
])

const AUTH_INDEPENDENT_API_PATHS = new Set([
  '/info/api/login',
  '/info/api/register',
  '/info/api/forgot-password',
  '/info/api/reset-password',
  '/info/api/account/recovery',
  '/info/api/resend-verification',
  '/info/api/auth/confirm-email',
])

const MAINTENANCE_LOOKUP_TIMEOUT_MS = 3000

async function isSessionVersionCurrent(session) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) return null

  const expectedVersion = Number(session.session_version || 0)
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return false

  try {
    const url = new URL('/rest/v1/user_session_versions', supabaseUrl)
    url.searchParams.set('select', 'version')
    url.searchParams.set('user_id', `eq.${session.user_id}`)
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })

    if (response.status === 404 && expectedVersion === 0) return true
    if (!response.ok) {
      console.error('Session version lookup failed with HTTP status:', response.status)
      return response.status >= 500 || response.status === 429 ? null : false
    }

    const rows = await response.json()
    if (!Array.isArray(rows)) return null
    const activeVersion = Number(rows[0]?.version || 0)
    if (!Number.isSafeInteger(activeVersion) || activeVersion < 0) return null
    return activeVersion === expectedVersion
  } catch (error) {
    console.error('Session version lookup failed:', error)
    return null
  }
}

async function isAccountDeletionPending(userId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) return false

  try {
    const url = new URL('/rest/v1/info_users', supabaseUrl)
    url.searchParams.set('select', 'status')
    url.searchParams.set('id', `eq.${userId}`)
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })

    if (!response.ok) {
      console.error('Account deletion status lookup failed with HTTP status:', response.status)
      return false
    }

    const accounts = await response.json()
    return Array.isArray(accounts) && accounts[0]?.status === 'pending_deletion'
  } catch (error) {
    console.error('Account deletion status lookup failed:', error)
    return false
  }
}

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
      signal: AbortSignal.timeout(MAINTENANCE_LOOKUP_TIMEOUT_MS),
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
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      console.warn(`Maintenance status lookup timed out after ${MAINTENANCE_LOOKUP_TIMEOUT_MS}ms; allowing the request through.`)
    } else {
      console.error('Maintenance status lookup failed; allowing the request through:', error)
    }
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
  let loggedIn = Boolean(serverSession && serverSession.user_id)
  const isStaticOrAsset = pathname.startsWith('/_next') || pathname.includes('.')

  const sessionVersionCurrent = loggedIn && !isStaticOrAsset
    ? await isSessionVersionCurrent(serverSession)
    : true

  if (sessionVersionCurrent === null) {
    const isApiRoute = pathname === '/info/api' || pathname.startsWith('/info/api/')
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, message: 'Authentication status is temporarily unavailable. Please try again.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const retryPath = `${request.nextUrl.pathname}${request.nextUrl.search}`.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character])
    return new NextResponse(
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Connection temporarily unavailable</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#172033;font-family:Arial,sans-serif">
    <main style="width:min(100% - 32px,420px);box-sizing:border-box;padding:28px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 32px #0f172a12">
      <h1 style="margin:0;font-size:20px">We couldn’t verify your session</h1>
      <p style="margin:12px 0 20px;color:#64748b;font-size:14px;line-height:1.6">Your sign-in has not been cleared. Please try again when the connection is restored.</p>
      <a href="${retryPath}" style="display:inline-flex;align-items:center;min-height:42px;padding:0 18px;border-radius:12px;background:#2563eb;color:#fff;font-size:14px;font-weight:700;text-decoration:none">Try again</a>
    </main>
  </body>
</html>`,
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/html; charset=utf-8',
        },
      }
    )
  }

  if (loggedIn && !isStaticOrAsset && !sessionVersionCurrent) {
    loggedIn = false
    const isApiRoute = pathname === '/info/api' || pathname.startsWith('/info/api/')
    let response

    if (isApiRoute && !AUTH_INDEPENDENT_API_PATHS.has(normalizedPathname)) {
      response = NextResponse.json(
        { success: false, message: 'Your session has expired. Please sign in again.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    } else if (isApiRoute) {
      response = NextResponse.next()
    } else if (
      publicRoutes.isPublicPathname(pathname)
      || AUTHD_ONLY_EXIT.has(normalizedPathname)
      || isStaticOrAsset
    ) {
      response = NextResponse.next()
    } else {
      const deletionPending = await isAccountDeletionPending(serverSession.user_id)
      const loginUrl = new URL(deletionPending ? '/info/account-recovery' : '/info/login', request.url)
      if (!deletionPending) loginUrl.searchParams.set('message', 'Your session has expired. Please sign in again.')
      response = NextResponse.redirect(loginUrl)
    }

    clearSecureSessionCookie(response)
    return response
  }

  const role = String(serverSession?.role || '').trim().toLowerCase()
  const isAdmin = loggedIn && (role === 'admin' || role === 'administrator')
  const isAdminRoute = pathname === '/info/admin' || pathname.startsWith('/info/admin/')
  const isVisitorRoute = pathname === '/info/visitor' || pathname.startsWith('/info/visitor/')
  const isVisitorTouristSpotDetailRoute = /^\/info\/visitor\/tourist-spots\/[^/]+$/.test(normalizedPathname)

  if (loggedIn && isVisitorRoute && !isVisitorTouristSpotDetailRoute) {
    return NextResponse.redirect(
      new URL(isAdmin ? '/info/admin/dashboard' : '/info/user/dashboard', request.url)
    )
  }

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
