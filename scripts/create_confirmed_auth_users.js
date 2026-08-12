#!/usr/bin/env node
// Script: create_confirmed_auth_users.js
// Creates confirmed Supabase Auth users from existing `info_users` rows
// Usage: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env, then run:
//   node scripts/create_confirmed_auth_users.js

require('dotenv').config()

(async () => {
  try {
    const { createClient } = await import('@supabase/supabase-js')

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
      process.exit(1)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    console.log('Fetching rows from info_users...')
    const { data: rows, error: fetchErr } = await admin
      .from('info_users')
      .select('id, email, password, full_name, user_type, status')

    if (fetchErr) {
      console.error('Failed to fetch info_users:', fetchErr.message || fetchErr)
      process.exit(1)
    }

    if (!rows || rows.length === 0) {
      console.log('No rows found in info_users. Exiting.')
      process.exit(0)
    }

    const results = []

    for (const r of rows) {
      const email = (r.email || '').toLowerCase().trim()
      if (!email) {
        results.push({ email: null, status: 'skipped', reason: 'no email' })
        continue
      }

      if (r.status && r.status !== 'active') {
        results.push({ email, status: 'skipped', reason: `info_users.status=${r.status}` })
        continue
      }

      // Determine password: use existing plaintext password if present, otherwise generate one
      const pwd = r.password && String(r.password).trim().length >= 6 ? String(r.password).trim() : generatePassword()

      const payload = {
        email,
        password: pwd,
        user_metadata: {
          full_name: r.full_name || '',
          user_type: r.user_type || 'tourist',
        },
        email_confirm: true,
      }

      // If an id exists in info_users, attempt to set the same id for the auth user
      if (r.id) payload.id = r.id

      try {
        const { data, error } = await admin.auth.admin.createUser(payload)
        if (error) {
          // If user already exists, log and continue
          const msg = error.message || error
          console.warn('createUser error for', email, msg)
          results.push({ email, status: 'error', error: msg })
          continue
        }

        console.log('Created auth user for', email, 'id=', data?.id)
        results.push({ email, status: 'created', id: data?.id })
      } catch (e) {
        console.error('Unexpected error creating user', email, e.message || e)
        results.push({ email, status: 'error', error: e.message || e })
      }
    }

    console.log('\nSummary:')
    console.table(results)
    process.exit(0)

  } catch (err) {
    console.error('Fatal error:', err.message || err)
    process.exit(1)
  }
})()

function generatePassword(len = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-='"
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}
