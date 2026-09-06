import crypto from 'node:crypto'

const COOKIE_NAME = 'daet_secure_session'
const SESSION_TTL_SECONDS = 24 * 60 * 60

function getSigningSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ''
}

function sign(value) {
  return crypto.createHmac('sha256', getSigningSecret()).update(value).digest('base64url')
}

export function createSecureSessionCookie(user) {
  const payload = Buffer.from(JSON.stringify({
    user_id: user.id,
    role: user.user_type || 'tourist',
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function getServerSession(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token || !getSigningSecret()) return null

  const [payload, signature] = token.split('.')
  const expectedSignature = sign(payload)
  if (!payload || !signature || signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null

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

export function setSecureSessionCookie(response, user) {
  response.cookies.set(COOKIE_NAME, createSecureSessionCookie(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
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
