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
