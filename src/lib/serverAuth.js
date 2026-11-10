import crypto from 'node:crypto'

const COOKIE_NAME = 'daet_secure_session'
const SESSION_TTL_SECONDS = 24 * 60 * 60
const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60

function getSigningSecret() {
  const secret = process.env.SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  return Buffer.byteLength(secret, 'utf8') >= 32 ? secret : ''
}

function sign(value) {
  const secret = getSigningSecret()
  if (!secret) throw new Error('A server-side session signing secret is required.')
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

export function createSecureSessionCookie(user, ttlSeconds = SESSION_TTL_SECONDS, sessionVersion = 0) {
  const payload = Buffer.from(JSON.stringify({
    user_id: user.id,
    role: user.user_type || 'tourist',
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    session_version: Number.isSafeInteger(Number(sessionVersion)) ? Number(sessionVersion) : 0,
  })).toString('base64url')
  return `${payload}.${sign(payload)}`
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
    if (!session.user_id || Number(session.expires_at) <= Math.floor(Date.now() / 1000)) return null
    return session
  } catch {
    return null
  }
}

export function secureSessionCookieName() {
  return COOKIE_NAME
}

export function setSecureSessionCookie(response, user, remember = false, sessionVersion = 0, ttlOverride = null) {
  const defaultTtl = remember ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS
  const ttlSeconds = Number.isSafeInteger(ttlOverride) && ttlOverride > 0
    ? Math.min(ttlOverride, REMEMBER_TTL_SECONDS)
    : defaultTtl
  response.cookies.set(COOKIE_NAME, createSecureSessionCookie(user, ttlSeconds, sessionVersion), {
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
