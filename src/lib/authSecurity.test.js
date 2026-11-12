import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import {
  createSecureSessionCookie,
  getServerSession,
} from './serverAuth.js'
import { loginAttemptHash } from './loginLockout.js'

const originalSessionSecret = process.env.SESSION_SECRET

before(() => {
  process.env.SESSION_SECRET = 'test-session-signing-secret-with-enough-length-123456'
})

after(() => {
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = originalSessionSecret
})

test('administrator sessions do not require an MFA claim', () => {
  const cookie = createSecureSessionCookie({ id: 'admin-id', user_type: 'admin' }, 60, 1)
  const request = { cookies: { get: () => ({ value: cookie }) } }
  assert.equal(getServerSession(request)?.role, 'admin')
})

test('login lockout keys are deterministic and normalized', () => {
  assert.equal(loginAttemptHash(' Admin@Example.com '), loginAttemptHash('admin@example.com'))
  assert.match(loginAttemptHash('admin@example.com'), /^[0-9a-f]{64}$/)
})
