const test = require('node:test')
const assert = require('node:assert/strict')
const { getSupabaseAuthConfig } = require('./supabaseConfig')

test('prefers the service role key for server-side auth operations', () => {
  const previousEnv = { ...process.env }

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

  try {
    const config = getSupabaseAuthConfig()
    assert.equal(config.url, 'https://example.supabase.co')
    assert.equal(config.key, 'service-role-key')
    assert.equal(config.source, 'service_role')
  } finally {
    process.env = previousEnv
  }
})

test('falls back to the anon key when no service role key is available', () => {
  const previousEnv = { ...process.env }

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  delete process.env.SUPABASE_SERVICE_ROLE_KEY

  try {
    const config = getSupabaseAuthConfig()
    assert.equal(config.key, 'anon-key')
    assert.equal(config.source, 'anon')
  } finally {
    process.env = previousEnv
  }
})

test('trims whitespace from Supabase environment values', () => {
  const previousEnv = { ...process.env }

  process.env.NEXT_PUBLIC_SUPABASE_URL = ' https://example.supabase.co '
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ' anon-key '
  delete process.env.SUPABASE_SERVICE_ROLE_KEY

  try {
    const config = getSupabaseAuthConfig()
    assert.equal(config.url, 'https://example.supabase.co')
    assert.equal(config.key, 'anon-key')
  } finally {
    process.env = previousEnv
  }
})
