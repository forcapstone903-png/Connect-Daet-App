import { createHmac } from 'node:crypto'
import { maskEmail } from './safeLogging.js'

function getLockoutHashSecret() {
  const secret = process.env.SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('A server-side lockout hashing secret is required.')
  }
  return secret
}

export function loginAttemptHash(email) {
  return createHmac('sha256', getLockoutHashSecret())
    .update(String(email || '').trim().toLowerCase())
    .digest('hex')
}

export async function checkLoginLockout(adminClient, email) {
  const { data, error } = await adminClient.rpc('check_auth_login_lockout', {
    p_email_hash: loginAttemptHash(email),
  })
  if (error) throw error
  return data || null
}

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883'])

// Thresholds come from Settings -> Security. Before migration 102 the
// five-argument function does not exist, so fall back to the fixed 5 / 15 min.
export async function recordLoginFailure(adminClient, email, security = null) {
  const { data, error } = await adminClient.rpc('record_auth_login_failure', {
    p_email_hash: loginAttemptHash(email),
    p_email_hint: maskEmail(email),
    p_max_attempts: security?.lockout_max_attempts ?? 5,
    p_window_minutes: security?.lockout_window_minutes ?? 15,
    p_lockout_minutes: security?.lockout_duration_minutes ?? 15,
  })
  if (error && MISSING_FUNCTION_CODES.has(error.code)) {
    const legacy = await adminClient.rpc('record_auth_login_failure', { p_email_hash: loginAttemptHash(email) })
    if (legacy.error) throw legacy.error
    return legacy.data || null
  }
  if (error) throw error
  return data || null
}

export async function clearLoginFailures(adminClient, email) {
  const { error } = await adminClient.rpc('clear_auth_login_failures', {
    p_email_hash: loginAttemptHash(email),
  })
  if (error) throw error
}

/**
 * Re-verify a password (password change, account deletion) under the same
 * per-email lockout as sign-in. Returns { locked } | { ok: false } | { ok: true, authData }.
 */
export async function verifyPasswordWithLockout({ adminClient, authClient, email, password, security }) {
  const lockedUntil = await checkLoginLockout(adminClient, email)
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) return { locked: true }

  const { data: authData, error } = await authClient.auth.signInWithPassword({ email, password })
  if (error || !authData?.user?.id) {
    if (!error || /invalid login credentials/i.test(error.message || '')) {
      const nowLocked = await recordLoginFailure(adminClient, email, security)
      if (nowLocked && new Date(nowLocked).getTime() > Date.now()) return { locked: true }
    }
    return { ok: false }
  }
  await clearLoginFailures(adminClient, email)
  return { ok: true, authData }
}
