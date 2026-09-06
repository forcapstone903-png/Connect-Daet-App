import { clearAuthCookie } from './authCookies'
import { supabase } from './supabase'

/**
 * Centralized client-side logout.
 *
 * Always calls `/api/logout` first so the signed, HTTP-only server session
 * (`daet_secure_session`) is invalidated — not just the display-only client
 * cookie. Only best-effort cleanup is performed after that.
 */
export async function performLogout() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
  } catch (error) {
    console.error('Logout API call failed:', error)
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
}