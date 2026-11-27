import { clearAuthCookie, getStoredSessionObject } from './authCookies'
import { clearUserCache } from './cache'
import { supabase } from './supabase'

/**
 * Centralized client-side logout.
 *
 * Calls `/info/api/logout` first to revoke server-side sessions, then clears
 * the browser's Supabase session, display-only cookie, and cached user data.
 */
export async function performLogout({ serverAlreadyRevoked = false } = {}) {
  const userId = getStoredSessionObject()?.user_id
  clearUserCache(userId)
  let sessionsRevoked = serverAlreadyRevoked
  let supabaseSessionRevoked = false
  let accessToken = null

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) console.error('Supabase session lookup failed during logout:', error)
    accessToken = data?.session?.access_token || null
  } catch (error) {
    console.error('Supabase session lookup failed during logout:', error)
  }

  if (!serverAlreadyRevoked) {
    try {
      const response = await fetch('/info/api/logout', {
        method: 'POST',
        credentials: 'same-origin',
        ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
      })
      const result = await response.json().catch(() => ({}))
      sessionsRevoked = response.ok && result.sessionsRevoked === true
      supabaseSessionRevoked = response.ok && result.supabaseSessionRevoked === true
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
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) console.error('Supabase sign-out failed:', error)
    else supabaseSessionRevoked = true
  } catch (error) {
    console.error('Supabase sign-out failed:', error)
  }

  return { sessionsRevoked, supabaseSessionRevoked }
}