import { clearAuthCookie, getStoredSessionObject } from './authCookies'
import { clearUserCache } from './cache'
import { supabase } from './supabase'

/**
 * Centralized client-side logout.
 *
 * Always calls `/info/api/logout` first so the signed, HTTP-only server session
 * (`daet_secure_session`) is invalidated — not just the display-only client
 * cookie. Only best-effort cleanup is performed after that.
 */
export async function performLogout({ serverAlreadyRevoked = false } = {}) {
  const userId = getStoredSessionObject()?.user_id
  clearUserCache(userId)
  let sessionsRevoked = serverAlreadyRevoked

  if (!serverAlreadyRevoked) {
    try {
      const response = await fetch('/info/api/logout', { method: 'POST', credentials: 'same-origin' })
      const result = await response.json().catch(() => ({}))
      sessionsRevoked = response.ok && result.sessionsRevoked === true
      if (!sessionsRevoked) console.error('Server-side app sessions could not all be revoked.')
    } catch (error) {
      console.error('Logout API call failed:', error)
    }
  }

  clearAuthCookie()

  try {
    sessionStorage.removeItem('user_session')
  } catch (error) {
    // ignore storage failures
  }

  try {
    localStorage.removeItem('daet_remember_me_session')
  } catch (error) {
    // ignore storage failures
  }

  try {
    await supabase.auth.signOut()
  } catch (error) {
    console.error('Supabase sign-out failed:', error)
  }

  return { sessionsRevoked }
}