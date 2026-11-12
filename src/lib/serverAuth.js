import crypto from 'node:crypto'

const COOKIE_NAME = 'daet_secure_session'
const SESSION_TTL_SECONDS = 24 * 60 * 60
const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60
const MAX_TTL_SECONDS = 90 * 24 * 60 * 60
// A page view or write refreshes last_active at most once a minute.
const ACTIVITY_REFRESH_SECONDS = 60

function getSigningSecret() {
  const secret = process.env.SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  return Buffer.byteLength(secret, 'utf8') >= 32 ? secret : ''
}

function sign(value) {
  const secret = getSigningSecret()
  if (!secret) throw new Error('A server-side session signing secret is required.')
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

function encodePayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded)}`
}

function cleanPerms(perms) {
  const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 30) : [])
  const grant = list(perms?.grant)
  const revoke = list(perms?.revoke)
  return grant.length || revoke.length ? { grant, revoke } : undefined
}

/**
 * options.perms        per-person permission overrides ({ grant, revoke })
 * options.idleSeconds  sign out after this much inactivity (0 = off)
 */
export function createSecureSessionCookie(user, ttlSeconds = SESSION_TTL_SECONDS, sessionVersion = 0, options = {}) {
  const issuedAt = nowSeconds()
  const idleSeconds = Number.isSafeInteger(options.idleSeconds) && options.idleSeconds > 0 ? options.idleSeconds : 0
  return encodePayload({
    user_id: user.id,
    role: user.user_type || 'tourist',
    expires_at: issuedAt + ttlSeconds,
    session_version: Number.isSafeInteger(Number(sessionVersion)) ? Number(sessionVersion) : 0,
    ...(cleanPerms(options.perms) ? { perms: cleanPerms(options.perms) } : {}),
    ...(idleSeconds ? { idle: idleSeconds, last_active: issuedAt } : {}),
  })
}

export function getServerSession(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token || !getSigningSecret()) return null

  const [payload, signature, ...extraParts] = token.split('.')
  if (!payload || !signature || extraParts.length) return null
  const expectedSignature = Buffer.from(sign(payload))
  const providedSignature = Buffer.from(signature)
  if (providedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(providedSignature, expectedSignature)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!session.user_id || Number(session.expires_at) <= nowSeconds()) return null
    return session
  } catch {
    return null
  }
}

export function isSessionIdleExpired(session) {
  const idle = Number(session?.idle)
  if (!Number.isSafeInteger(idle) || idle <= 0) return false
  return nowSeconds() - Number(session.last_active || 0) > idle
}

export function sessionNeedsActivityRefresh(session) {
  const idle = Number(session?.idle)
  if (!Number.isSafeInteger(idle) || idle <= 0) return false
  return nowSeconds() - Number(session.last_active || 0) >= ACTIVITY_REFRESH_SECONDS
}

/** Re-sign the same session with last_active = now (expiry unchanged). */
export function refreshSecureSessionActivity(response, session) {
  const remaining = Number(session.expires_at) - nowSeconds()
  if (remaining <= 0) return
  response.cookies.set(COOKIE_NAME, encodePayload({ ...session, last_active: nowSeconds() }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: remaining,
    path: '/',
  })
}

export function secureSessionCookieName() {
  return COOKIE_NAME
}

/**
 * options.sessionSeconds / rememberSeconds override the default lifetimes
 * (Settings -> Security); options.perms / idleSeconds go into the payload.
 */
export function setSecureSessionCookie(response, user, remember = false, sessionVersion = 0, ttlOverride = null, options = {}) {
  const sessionSeconds = Number.isSafeInteger(options.sessionSeconds) && options.sessionSeconds > 0
    ? options.sessionSeconds
    : SESSION_TTL_SECONDS
  const rememberSeconds = Number.isSafeInteger(options.rememberSeconds) && options.rememberSeconds > 0
    ? options.rememberSeconds
    : REMEMBER_TTL_SECONDS
  const defaultTtl = Math.min(remember ? rememberSeconds : sessionSeconds, MAX_TTL_SECONDS)
  const ttlSeconds = Number.isSafeInteger(ttlOverride) && ttlOverride > 0
    ? Math.min(ttlOverride, MAX_TTL_SECONDS)
    : defaultTtl
  response.cookies.set(COOKIE_NAME, createSecureSessionCookie(user, ttlSeconds, sessionVersion, options), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ttlSeconds,
    path: '/',
  })
}

export function clearSecureSessionCookie(response) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
