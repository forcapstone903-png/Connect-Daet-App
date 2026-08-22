export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[REDACTED]'

  const trimmed = email.trim()
  if (!trimmed.includes('@')) return '[REDACTED]'

  const [local, domain] = trimmed.split('@')
  const localPreview = local.length <= 2 ? local.slice(0, 1) + '*'.repeat(Math.max(1, local.length - 1)) : local.slice(0, 2) + '*'.repeat(Math.max(1, local.length - 2))
  return `${localPreview}@${domain}`
}

export function sanitizeUserProfileForLog(profile) {
  if (!profile) return null

  return {
    id: profile.id,
    user_type: profile.user_type || profile.role || 'unknown',
    status: profile.status || 'unknown',
    email_verified: Boolean(profile.email_verified),
    has_password: Boolean(profile.password),
    points: profile.points ?? null,
    email: maskEmail(profile.email),
    created_at: profile.created_at ? '[REDACTED]' : null,
    updated_at: profile.updated_at ? '[REDACTED]' : null,
  }
}

export function sanitizeRegistrationBodyForLog(body = {}) {
  if (!body || typeof body !== 'object') return {}

  return {
    full_name: body.full_name ? '[REDACTED]' : null,
    email: maskEmail(body.email),
    mobile_present: Boolean(body.mobile_number),
    user_type: body.user_type || 'unknown',
    password_present: Boolean(body.password),
  }
}
