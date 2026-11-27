import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import {
  createSecureSessionCookie,
  getServerSession,
} from './serverAuth.js'
import { loginAttemptHash } from './loginLockout.js'

const originalSessionSecret = process.env.SESSION_SECRET
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

before(() => {
  process.env.SESSION_SECRET = 'test-session-signing-secret-with-enough-length-123456'
})

after(() => {
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = originalSessionSecret
  if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey
})

test('administrator sessions do not require an MFA claim', () => {
  const cookie = createSecureSessionCookie({ id: 'admin-id', user_type: 'admin' }, 60, 1)
  const request = { cookies: { get: () => ({ value: cookie }) } }
  assert.equal(getServerSession(request)?.role, 'admin')
})

test('server sessions reject tampered and expired cookies', () => {
  const validCookie = createSecureSessionCookie({ id: 'user-id', user_type: 'tourist' }, 60)
  const [payload, signature] = validCookie.split('.')
  const tamperedRequest = { cookies: { get: () => ({ value: `${payload}x.${signature}` }) } }
  const expiredCookie = createSecureSessionCookie({ id: 'user-id', user_type: 'tourist' }, -1)
  const expiredRequest = { cookies: { get: () => ({ value: expiredCookie }) } }

  assert.equal(getServerSession(tamperedRequest), null)
  assert.equal(getServerSession(expiredRequest), null)
})

test('SESSION_SECRET signs and validates dedicated server sessions', () => {
  process.env.SESSION_SECRET = 'dedicated-test-session-secret-with-enough-length'
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  const cookie = createSecureSessionCookie({ id: 'dedicated-user', user_type: 'tourist' }, 60)
  const request = { cookies: { get: () => ({ value: cookie }) } }
  assert.equal(getServerSession(request)?.user_id, 'dedicated-user')
})

test('service-role fallback signs sessions and emits a warning', () => {
  delete process.env.SESSION_SECRET
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fallback-test-service-role-key-with-enough-length'
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    const cookie = createSecureSessionCookie({ id: 'fallback-user', user_type: 'tourist' }, 60)
    const request = { cookies: { get: () => ({ value: cookie }) } }
    assert.equal(getServerSession(request)?.user_id, 'fallback-user')
  } finally {
    console.warn = originalWarn
  }
  assert.ok(warnings.some((warning) => warning.includes('SESSION_SECRET') && warning.includes('SUPABASE_SERVICE_ROLE_KEY')))
})

test('login lockout keys are deterministic and normalized', () => {
  assert.equal(loginAttemptHash(' Admin@Example.com '), loginAttemptHash('admin@example.com'))
  assert.match(loginAttemptHash('admin@example.com'), /^[0-9a-f]{64}$/)
})
