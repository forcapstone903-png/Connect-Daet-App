const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getPasswordStrength,
  normalizeRegistrationPayload,
  buildRememberedSession,
  getRememberMeStorageKey,
  isEmailVerificationBlocked,
  hashPasswordForStorage,
  verifyPasswordHash,
  isDuplicateEmailError,
} = require('./authFlow')

test('registration payload keeps required fields and normalizes email/mobile values', () => {
  const payload = normalizeRegistrationPayload({
    full_name: ' Jane Doe ',
    email: 'JANE@EXAMPLE.COM',
    mobile_number: '09171234567',
    password: 'SecurePass!123',
    user_type: 'tourist',
  })

  assert.equal(payload.full_name, 'Jane Doe')
  assert.equal(payload.email, 'jane@example.com')
  assert.equal(payload.mobile_number, '09171234567')
  assert.equal(payload.user_type, 'tourist')
})

test('password strength returns a strong score for stronger passwords', () => {
  const result = getPasswordStrength('SecurePass!123')
  assert.equal(result.label, 'Strong')
  assert.ok(result.score >= 80)
})

test('remember me creates a secure session token with expiry', () => {
  const session = buildRememberedSession({
    userId: 'user-123',
    email: 'jane@example.com',
    userName: 'Jane Doe',
  })

  assert.equal(session.userId, 'user-123')
  assert.equal(session.email, 'jane@example.com')
  assert.ok(session.token.length > 20)
  assert.ok(session.expiresAt > Date.now())
  assert.equal(session.storageKey, getRememberMeStorageKey())
})

test('login is blocked when the user has not confirmed their email', () => {
  const blocked = isEmailVerificationBlocked({
    email_verified: false,
    message: 'Email not confirmed',
  })

  assert.equal(blocked, true)
})

test('login is allowed when the profile record marks the email as verified even if auth payload is stale', () => {
  const blocked = isEmailVerificationBlocked({
    user: {
      email_verified: false,
      message: 'Email not confirmed',
      profile: {
        email_verified: true,
      },
    },
  })

  assert.equal(blocked, false)
})

test('password requirements only show unresolved checks, and stored passwords are bcrypt hashed', async () => {
  const hashed = await hashPasswordForStorage('SecurePass!123')
  const strength = getPasswordStrength('SecurePass!123')
  const unresolved = strength.checks.filter((item) => !item.valid)

  assert.equal(typeof hashed, 'string')
  assert.notEqual(hashed, 'SecurePass!123')
  assert.ok(await verifyPasswordHash('SecurePass!123', hashed))
  assert.equal(unresolved.length, 0)
})

test('duplicate email errors are detected for registration guard checks', () => {
  assert.equal(isDuplicateEmailError('User already registered'), true)
  assert.equal(isDuplicateEmailError('duplicate key value violates unique constraint'), true)
  assert.equal(isDuplicateEmailError('invalid password'), false)
})
