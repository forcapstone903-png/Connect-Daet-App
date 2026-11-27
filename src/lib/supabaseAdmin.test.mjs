import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSupabaseServiceRoleClient } from './supabaseAdmin.js'

test('service-role client requires URL and server-only key configuration', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    assert.equal(createSupabaseServiceRoleClient(), null)

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co'
    assert.equal(createSupabaseServiceRoleClient(), null)

    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    assert.ok(createSupabaseServiceRoleClient())
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey
  }
})
