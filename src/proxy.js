import { NextResponse } from 'next/server'
import publicRoutes from './lib/publicRoutes'
import {
  clearSecureSessionCookie,
  getServerSession,
  isSessionIdleExpired,
  refreshSecureSessionActivity,
  sessionNeedsActivityRefresh,
} from './lib/serverAuth'
import { canAccessAdminPage, getStaffHomePath, isStaffRole, normalizeStaffRole } from './lib/staffRoles.mjs'
import {
  isSuspendedAccountApiAllowed,
  isSuspendedAccountPageAllowed,
} from './lib/restrictedAccountAccess.mjs'

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
  '/info/account-suspended',
  '/info/user/moderation-appeals',
  '/info/account-appeal',
  '/info/api/login',
  '/info/api/user/moderation-appeals',
  '/info/api/cron/moderation-lifecycle',
  '/info/account-recovery',
  '/info/api/account/recovery',
  '/info/api/cron/account-deletions',
  '/info/api/cron/backups',
  '/info/api/cron/alerts',
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
  '/info/api/user/moderation-appeals',
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

async function isStaffSessionCurrent(session) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) return null

  const expectedVersion = Number(session.session_version || 0)
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return false

  try {
    const url = new URL('/rest/v1/rpc/is_staff_session_current', supabaseUrl)
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        p_user_id: session.user_id,
        p_role: normalizeStaffRole(session.role),
        p_session_version: expectedVersion,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })

    if (response.status === 404 || response.status >= 500 || response.status === 429) {
      return verifyStaffSessionFallback(session)
    }

    if (!response.ok) {
      console.error('Staff session verification failed with HTTP status:', response.status)
      return false
    }

    const current = await response.json()
    if (typeof current === 'boolean') return current
    console.error('Staff session verification returned an invalid response.')
    return verifyStaffSessionFallback(session)
  } catch (error) {
    console.error('Staff session verification failed:', error)
    return null
  }
}

async function verifyStaffSessionFallback(session) {
  const [versionCurrent, accountCurrent] = await Promise.all([
    isSessionVersionCurrent(session),
    isStaffAccountCurrent(session),
  ])
  if (versionCurrent === false || accountCurrent === false) return false
  return versionCurrent === null || accountCurrent === null ? null : true
}

async function isStaffAccountCurrent(session) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) return null

  try {
    const url = new URL('/rest/v1/info_users', supabaseUrl)
    url.searchParams.set('select', 'user_type,status')
    url.searchParams.set('id', `eq.${session.user_id}`)
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      console.error('Staff account verification failed with HTTP status:', response.status)
      return response.status >= 500 || response.status === 429 ? null : false
    }

    const accounts = await response.json()
    const account = Array.isArray(accounts) ? accounts[0] : null
    return account?.status === 'active'
      && isStaffRole(account.user_type)
      && normalizeStaffRole(account.user_type) === normalizeStaffRole(session.role)
  } catch (error) {
    console.error('Staff account verification failed:', error)
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

async function getCurrentAccountStatus(userId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) return null

  try {
    const accountUrl = new URL('/rest/v1/info_users', supabaseUrl)
    accountUrl.searchParams.set(
      'select',
      'status,deletion_requested_at,account_deactivated_at,admin_user_bans!admin_user_bans_user_id_fkey(ban_type,expires_at,lifted_at)',
    )
    accountUrl.searchParams.set('id', `eq.${userId}`)
    accountUrl.searchParams.set('admin_user_bans.ban_type', 'in.(suspension,permanent)')
    accountUrl.searchParams.set('admin_user_bans.lifted_at', 'is.null')
    accountUrl.searchParams.set(
      'admin_user_bans.or',
      `(expires_at.is.null,expires_at.gt.${new Date().toISOString()})`,
    )
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    }
    const response = await fetch(accountUrl, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      console.error('Account status verification failed with HTTP status:', response.status)
      return null
    }

    const accounts = await response.json()
    const account = Array.isArray(accounts) ? accounts[0] : null
    if (!account) return null
    if (account.deletion_requested_at || account.account_deactivated_at || account.status === 'pending_deletion') {
      return 'pending_deletion'
    }

    const activeBanTypes = Array.isArray(account.admin_user_bans)
      ? account.admin_user_bans.map((item) => item.ban_type)
      : []
    if (account.status === 'banned' || activeBanTypes.includes('permanent')) return 'banned'
    if (account.status === 'suspended' || activeBanTypes.includes('suspension')) return 'suspended'
    return account.status === 'pending' ? 'pending' : 'active'
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      console.warn('Account status verification timed out after 5000ms.')
    } else {
      console.error('Account status verification failed:', error)
    }
    return null
  }
}

function isRestrictedAccountApiAllowed(pathname, method, accountStatus) {
  if (accountStatus === 'suspended') {
    return isSuspendedAccountApiAllowed(pathname, method, publicRoutes.isPublicPathname)
  }

  if ([
    '/info/api/users/following',
    '/info/api/user/feed',
  ].includes(pathname)) {
    return method === 'GET'
  }

  if ([
    '/info/api/account/status',
    '/info/api/notifications',
    '/info/api/user/moderation-appeals',
    '/info/api/user/moderation-details',
    '/info/api/user/settings',
    '/info/api/user/password',
    '/info/api/logout',
  ].includes(pathname)) {
    if (pathname === '/info/api/user/password') return method === 'POST'
    return true
  }
  return method === 'GET' && publicRoutes.isPublicPathname(pathname)
}

function isRestrictedAccountPageAllowed(pathname, method, accountStatus) {
  if (accountStatus === 'suspended') {
    return isSuspendedAccountPageAllowed(pathname, method)
  }

  if (method === 'GET' && (
    publicRoutes.isPublicPathname(pathname)
    || VISITOR_CONTENT_ROUTE_PREFIXES.some((prefix) => (
      pathname === `/info/visitor${prefix}` || pathname.startsWith(`/info/visitor${prefix}/`)
    ))
  )) return true

  return new Set([
    '/info/account-suspended',
    '/info/user/dashboard',
    '/info/user/profile',
    '/info/user/profile/edit',
    '/info/user/notifications',
    '/info/user/moderation-appeals',
    '/info/user/moderation-details',
  ]).has(pathname)
    || pathname.startsWith('/info/user/moderation-details/')
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

// Idle timeout (Settings -> Security): a page navigation or a write counts as
// activity and slides last_active forward; background GET polling does not,
// so an unattended tab still signs out.
export async function proxy(request) {
  const response = await handleRequest(request)
  const session = getServerSession(request)
  const isActivity = request.method !== 'GET'
    || !(request.nextUrl.pathname.startsWith('/info/api/') || request.nextUrl.pathname.startsWith('/_next') || request.nextUrl.pathname.includes('.'))
  const cookieCleared = response.cookies.get('daet_secure_session')?.value === ''
  if (session && isActivity && !cookieCleared && !isSessionIdleExpired(session) && sessionNeedsActivityRefresh(session)) {
    refreshSecureSessionActivity(response, session)
  }
  return response
}

async function handleRequest(request) {
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

  const sessionCurrent = loggedIn && !isStaticOrAsset
    ? isStaffRole(serverSession.role)
      ? await isStaffSessionCurrent(serverSession)
      : await isSessionVersionCurrent(serverSession)
    : true

  if (sessionCurrent === null) {
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

  const idleExpired = loggedIn && !isStaticOrAsset && isSessionIdleExpired(serverSession)

  if (loggedIn && !isStaticOrAsset && (!sessionCurrent || idleExpired)) {
    loggedIn = false
    const expiredMessage = idleExpired
      ? 'You were signed out after a period of inactivity. Please sign in again.'
      : 'Your session has expired. Please sign in again.'
    const isApiRoute = pathname === '/info/api' || pathname.startsWith('/info/api/')
    let response

    if (isApiRoute && !AUTH_INDEPENDENT_API_PATHS.has(normalizedPathname)) {
      response = NextResponse.json(
        { success: false, message: expiredMessage },
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
      if (!deletionPending) loginUrl.searchParams.set('message', expiredMessage)
      response = NextResponse.redirect(loginUrl)
    }

    clearSecureSessionCookie(response)
    return response
  }

  const isUserApiRoute = pathname === '/info/api' || pathname.startsWith('/info/api/')
  const isUserPageRoute = normalizedPathname === '/info/user'
    || normalizedPathname.startsWith('/info/user/')
    || normalizedPathname === '/info/account-suspended'
    || normalizedPathname === '/info/visitor'
    || normalizedPathname.startsWith('/info/visitor/')
  const needsAccountStatus = loggedIn
    && !isStaticOrAsset
    && !isStaffRole(serverSession.role)
    && (isUserApiRoute || isUserPageRoute)
  let currentAccountStatus = null
  if (needsAccountStatus) {
    currentAccountStatus = await getCurrentAccountStatus(serverSession.user_id)
    if (!currentAccountStatus) {
      return NextResponse.json(
        { success: false, message: 'Unable to verify your account status. Please try again.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (currentAccountStatus === 'banned' || currentAccountStatus === 'pending_deletion') {
      const appealEndpoint = normalizedPathname === '/info/api/user/moderation-appeals' && request.method === 'POST'
      const logoutEndpoint = normalizedPathname === '/info/api/logout'
      if (!appealEndpoint && !logoutEndpoint) {
        const blockedResponse = isUserApiRoute
          ? NextResponse.json(
            { success: false, message: currentAccountStatus === 'banned'
              ? 'This account is permanently banned and cannot access Connect Daet.'
              : 'This account is scheduled for deletion.' },
            { status: 403, headers: { 'Cache-Control': 'no-store' } }
          )
          : NextResponse.redirect(new URL(
            currentAccountStatus === 'banned'
              ? '/info/login?message=Your%20account%20has%20been%20permanently%20banned.'
              : '/info/account-recovery',
            request.url
          ))
        clearSecureSessionCookie(blockedResponse)
        blockedResponse.cookies.set('daet_auth_session', '', {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 0,
          path: '/',
        })
        return blockedResponse
      }
    }

    if (['pending', 'suspended'].includes(currentAccountStatus)) {
      const allowed = isUserApiRoute
        ? isRestrictedAccountApiAllowed(normalizedPathname, request.method, currentAccountStatus)
        : isRestrictedAccountPageAllowed(normalizedPathname, request.method, currentAccountStatus)
      if (!allowed) {
        if (isUserApiRoute) {
          return NextResponse.json(
            {
              success: false,
              code: 'ACCOUNT_RESTRICTED',
              accountStatus: currentAccountStatus,
              message: currentAccountStatus === 'pending'
                ? 'Community features are unavailable while this account is pending review.'
                : 'Community features are unavailable while this account is suspended.',
            },
            { status: 403, headers: { 'Cache-Control': 'no-store' } }
          )
        }
        return NextResponse.redirect(new URL('/info/account-suspended', request.url))
      }
    }
  }

  if (!loggedIn && normalizedPathname === '/') {
    const landingUrl = request.nextUrl.clone()
    landingUrl.pathname = '/info/visitor'
    return NextResponse.redirect(landingUrl)
  }

  // "isAdmin" here means any back-office staff role (admin, tourism officer,
  // moderator). Which admin pages each role may open is checked further down.
  const isAdmin = loggedIn && isStaffRole(serverSession?.role)
  const isAdminRoute = pathname === '/info/admin' || pathname.startsWith('/info/admin/')
  const isVisitorRoute = pathname === '/info/visitor' || pathname.startsWith('/info/visitor/')
  // The places directory (list + detail) is shared by guests and signed-in
  // users, so it is exempt from the "signed-in users leave /info/visitor" rule.
  const isVisitorTouristSpotDetailRoute = /^\/info\/visitor\/(tourist-spots|alerts)(\/[^/]+)?$/.test(normalizedPathname)

  if (
    loggedIn
    && isVisitorRoute
    && !isVisitorTouristSpotDetailRoute
    && !['pending', 'suspended'].includes(currentAccountStatus)
  ) {
    return NextResponse.redirect(
      new URL(isAdmin ? getStaffHomePath(serverSession.role) : '/info/user/dashboard', request.url)
    )
  }

  // Public safety alerts stay reachable during maintenance mode.
  const isAlertPath = /^\/info\/(api\/alerts|visitor\/alerts)(\/|$)/.test(normalizedPathname)
  if (!isAdmin && !isAdminRoute && !isStaticOrAsset && !isAlertPath && !MAINTENANCE_EXEMPT_PATHS.has(normalizedPathname)) {
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
      new URL(isAdmin ? getStaffHomePath(serverSession.role) : '/info/user/dashboard', request.url)
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
    if (normalizedPathname.startsWith('/info/user/')) {
      loginUrl.searchParams.set('redirect', `${normalizedPathname}${request.nextUrl.search}`)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (
    (normalizedPathname === '/info/admin' || pathname.startsWith('/info/admin/')) &&
    !isAdmin
  ) {
    return NextResponse.redirect(new URL('/info/access-denied?reason=admin', request.url))
  }

  // Role-based page access inside the console (see src/lib/staffRoles.mjs).
  if (
    isAdminRoute
    && normalizedPathname === '/info/admin/dashboard'
    && normalizeStaffRole(serverSession.role) !== 'admin'
    && isStaffRole(serverSession.role)
  ) {
    return NextResponse.redirect(new URL(getStaffHomePath(serverSession.role), request.url))
  }

  if (isAdminRoute && !canAccessAdminPage(serverSession.role, normalizedPathname, serverSession.perms)) {
    const dashboardUrl = new URL(getStaffHomePath(serverSession.role), request.url)
    dashboardUrl.searchParams.set('denied', '1')
    return NextResponse.redirect(dashboardUrl)
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
