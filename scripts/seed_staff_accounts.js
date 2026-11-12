#!/usr/bin/env node
// Script: seed_staff_accounts.js
// Creates (or updates) one sample account per role so each role can be tested:
//   Admin, Tourism Officer, Moderator, and a registered Tourist.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
// .env.local / .env). Run after applying migration 096:
//   node scripts/seed_staff_accounts.js
//
// Passwords: set SEED_STAFF_PASSWORD to choose one for all four accounts;
// otherwise a strong random password is generated per account and printed
// once. Passwords are stored only by Supabase Auth (hashed), never in
// info_users. Do not run this against production.

require('dotenv').config({ path: '.env.local' })
require('dotenv').config()
const crypto = require('node:crypto')

const ACCOUNTS = [
  { email: 'admin@connectdaet.test', full_name: 'Sample Administrator', role: 'admin' },
  { email: 'tourism.officer@connectdaet.test', full_name: 'Sample Tourism Officer', role: 'tourism_officer' },
  { email: 'moderator@connectdaet.test', full_name: 'Sample Moderator', role: 'moderator' },
  { email: 'tourist@connectdaet.test', full_name: 'Sample Tourist', role: 'tourist' },
]

function generatePassword() {
  // Guarantees every character class required by src/lib/passwordPolicy.js.
  return `Daet-${crypto.randomBytes(9).toString('base64url')}a9!`
}

;(async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }
  if (/prod/i.test(process.env.NODE_ENV || '')) {
    console.error('Refusing to seed sample staff accounts with NODE_ENV=production.')
    process.exit(1)
  }

  const admin = createClient(url, key, { auth: { persistSession: false } })
  const sharedPassword = process.env.SEED_STAFF_PASSWORD?.trim()
  const results = []

  // Supabase has no "get user by email"; one page is plenty for a dev project.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) {
    console.error('Unable to list auth users:', listError.message)
    process.exit(1)
  }

  for (const account of ACCOUNTS) {
    const password = sharedPassword || generatePassword()
    let authUser = list.users.find((u) => (u.email || '').toLowerCase() === account.email)

    if (authUser) {
      const { error } = await admin.auth.admin.updateUserById(authUser.id, { password, email_confirm: true })
      if (error) { results.push({ ...account, status: `error: ${error.message}` }); continue }
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: account.full_name },
      })
      if (error) { results.push({ ...account, status: `error: ${error.message}` }); continue }
      authUser = data.user
    }

    // Service-role writes bypass the user_type guard trigger from migration 096.
    const now = new Date().toISOString()
    const { error: upsertError } = await admin.from('info_users').upsert({
      id: authUser.id,
      email: account.email,
      full_name: account.full_name,
      user_type: account.role,
      status: 'active',
      email_verified: true,
      updated_at: now,
    }, { onConflict: 'id' })

    if (upsertError) { results.push({ ...account, status: `error: ${upsertError.message}` }); continue }
    const { error: revokeError } = await admin.rpc('revoke_user_sessions', {
      p_user_id: authUser.id,
    })
    if (revokeError) {
      results.push({ ...account, status: `error: profile updated but session revocation failed: ${revokeError.message}` })
      continue
    }
    results.push({ ...account, password: sharedPassword ? '(SEED_STAFF_PASSWORD)' : password, status: 'ready' })
  }

  console.table(results.map(({ email, role, password, status }) => ({ email, role, password, status })))
  if (!sharedPassword) console.log('Save these passwords now; they are not stored anywhere else.')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
