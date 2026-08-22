const bcrypt = require('bcryptjs')

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeMobile(value) {
  return String(value || '').trim().replace(/\s+/g, '')
}

function normalizeRegistrationPayload(payload = {}) {
  const fullName = String(payload.full_name || '').trim()
  const email = normalizeEmail(payload.email)
  const mobileNumber = normalizeMobile(payload.mobile_number)
  const userType = String(payload.user_type || 'tourist').trim().toLowerCase()

  return {
    full_name: fullName,
    email,
    mobile_number: mobileNumber,
    password: String(payload.password || ''),
    user_type: ['admin', 'moderator', 'tourist', 'business', 'artisan', 'operator'].includes(userType)
      ? userType
      : 'tourist',
  }
}

function getPasswordStrength(password = '') {
  const value = String(password)
  const checks = [
    { label: 'At least 8 characters', valid: value.length >= 8 },
    { label: 'One lowercase letter', valid: /[a-z]/.test(value) },
    { label: 'One uppercase letter', valid: /[A-Z]/.test(value) },
    { label: 'One number', valid: /\d/.test(value) },
    { label: 'One special character', valid: /[^a-zA-Z0-9]/.test(value) },
  ]

  let score = 0

  if (value.length === 0) {
    return { score: 0, label: '', color: 'bg-slate-200', width: '0%', checks }
  }

  if (value.length >= 8) score += 25
  else if (value.length >= 6) score += 15

  if (/[a-z]/.test(value)) score += 20
  if (/[A-Z]/.test(value)) score += 20
  if (/[0-9]/.test(value)) score += 20
  if (/[^a-zA-Z0-9]/.test(value)) score += 15

  let label = 'Weak'
  let color = 'bg-red-500'

  if (score < 30) {
    label = 'Weak'
    color = 'bg-red-500'
  } else if (score < 60) {
    label = 'Fair'
    color = 'bg-amber-500'
  } else if (score < 80) {
    label = 'Good'
    color = 'bg-blue-500'
  } else {
    label = 'Strong'
    color = 'bg-emerald-500'
  }

  return {
    score,
    label,
    color,
    width: `${Math.min(score, 100)}%`,
    checks,
  }
}

function getRememberMeStorageKey() {
  return 'daet_remember_me_session'
}

function buildRememberedSession({ userId, email, userName }) {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}-${userId}`
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000

  return {
    userId,
    email: normalizeEmail(email),
    userName: String(userName || '').trim(),
    token,
    expiresAt,
    storageKey: getRememberMeStorageKey(),
  }
}

function isEmailVerificationBlocked(userInfo = {}) {
  const user = userInfo || {}
  const normalizedUser = user.user || user
  const profile = normalizedUser.profile || user.profile || {}

  const emailConfirmedAt = normalizedUser.email_confirmed_at || normalizedUser.email_verified_at || normalizedUser.emailVerifiedAt
  const emailVerifiedFlag = normalizedUser.email_verified === true || normalizedUser.emailVerified === true
  const profileVerifiedFlag = profile.email_verified === true || profile.emailVerified === true
  const message = String(normalizedUser.message || '').toLowerCase()

  if (emailVerifiedFlag || profileVerifiedFlag) return false
  if (emailConfirmedAt) return false
  if (message.includes('email not confirmed')) return true

  return false
}

function isDuplicateEmailError(message = '') {
  const value = String(message || '').toLowerCase()
  return value.includes('already registered')
    || value.includes('email already')
    || value.includes('duplicate key')
    || value.includes('already exists')
    || value.includes('user already')
}

async function hashPasswordForStorage(password) {
  const value = String(password || '')
  if (!value) return ''
  return bcrypt.hash(value, 12)
}

async function verifyPasswordHash(password, hashValue) {
  const value = String(password || '')
  const hash = String(hashValue || '')
  if (!value || !hash) return false
  return bcrypt.compare(value, hash)
}

module.exports = {
  normalizeEmail,
  normalizeMobile,
  normalizeRegistrationPayload,
  getPasswordStrength,
  getRememberMeStorageKey,
  buildRememberedSession,
  isEmailVerificationBlocked,
  isDuplicateEmailError,
  hashPasswordForStorage,
  verifyPasswordHash,
}
