export function setAuthCookie(sessionData, days = 1) {
  if (typeof document === 'undefined') return

  const encodedValue = encodeURIComponent(JSON.stringify(sessionData))
  const maxAge = Math.max(1, days * 24 * 60 * 60)
  document.cookie = `daet_auth_session=${encodedValue}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function clearAuthCookie() {
  if (typeof document === 'undefined') return
  document.cookie = 'daet_auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax'
}

export function getAuthCookieFromDocument() {
  if (typeof document === 'undefined') return null

  const match = document.cookie.match(/(?:^|;\s*)daet_auth_session=([^;]*)/)
  if (!match) return null

  try {
    return JSON.parse(decodeURIComponent(match[1]))
  } catch (error) {
    console.error('Invalid auth session cookie:', error)
    return null
  }
}

export function getAuthCookieFromRequest(req) {
  const cookieValue = req?.cookies?.get('daet_auth_session')?.value
  if (!cookieValue) return null

  try {
    return JSON.parse(decodeURIComponent(cookieValue))
  } catch (error) {
    console.error('Invalid auth session cookie in request:', error)
    return null
  }
}

/**
 * Get the current user session as a raw JSON **string** (so existing
 * `JSON.parse(session)` call sites keep working untouched).
 *
 * Resolution order:
 *  1. The per-tab session in `sessionStorage` (fastest, matches old behaviour).
 *  2. Fall back to the persistent `daet_auth_session` cookie.
 *
 * The cookie fallback fixes the flicker/reload bug: `sessionStorage` is scoped
 * to a single tab, so opening a fresh tab cleared it and pages immediately
 * bounced to `/login`. The cookie survives across tabs and reloads.
 */
export function getStoredSession() {
  if (typeof window === 'undefined') return null

  // 1) Per-tab session
  try {
    const raw = sessionStorage.getItem('user_session')
    if (raw) return raw
  } catch (error) {
    // ignore read failures
  }

  // 2) Persistent cookie fallback
  const cookieSession = getAuthCookieFromDocument()
  if (cookieSession) {
    try {
      return JSON.stringify(cookieSession)
    } catch (error) {
      // ignore serialization failures
    }
  }

  return null
}

/** Like getStoredSession but returns the parsed object (or null). */
export function getStoredSessionObject() {
  try {
    const raw = getStoredSession()
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    return null
  }
}

export function updateStoredSession(patch = {}) {
  const current = getStoredSessionObject() || {}
  const next = { ...current, ...patch }

  try {
    sessionStorage.setItem('user_session', JSON.stringify(next))
  } catch (error) {
    // ignore storage failures
  }

  setAuthCookie(next)
  return next
}
