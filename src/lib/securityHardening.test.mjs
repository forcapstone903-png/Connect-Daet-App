import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publicErrorMessage } from './publicError.js'
import { fileMatchesDeclaredType, safeObjectName } from './uploadValidation.js'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('database and provider errors never reach users; app messages do', () => {
  assert.equal(publicErrorMessage({ message: 'duplicate key value violates unique constraint "x"', code: '23505' }, 'Fallback'), 'Fallback')
  assert.equal(publicErrorMessage({ message: 'relation "public.secret" does not exist' }, 'Fallback'), 'Fallback')
  assert.equal(publicErrorMessage({ message: 'Invalid login credentials', status: 400 }, 'Fallback'), 'Fallback')
  assert.equal(publicErrorMessage(new Error('Choose a category first.'), 'Fallback'), 'Choose a category first.')
  assert.equal(publicErrorMessage(null, 'Fallback'), 'Fallback')
})

test('uploads must match their declared type by content', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]).buffer
  const html = new TextEncoder().encode('<html><script>alert(1)</script>').buffer
  const mp4 = new Uint8Array([0, 0, 0, 0x18, ...'ftypmp42'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0]).buffer
  assert.equal(fileMatchesDeclaredType(png, 'image/png'), true)
  assert.equal(fileMatchesDeclaredType(html, 'image/png'), false)
  assert.equal(fileMatchesDeclaredType(png, 'image/svg+xml'), false)
  assert.equal(fileMatchesDeclaredType(mp4, 'video/mp4'), true)
})

test('stored object names cannot traverse folders or keep a fake extension', () => {
  const name = safeObjectName('../../evil/<script>.php.png', 'image/jpeg')
  assert.doesNotMatch(name, /\/|\.\.|<|>|php\.png/)
  assert.match(name, /\.jpg$/)
})

test('notification links from the browser are restricted to this site', () => {
  const source = read('../app/(subsystems)/info/api/activity/track/route.js')
  assert.match(source, /function safeInternalLink/)
  assert.match(source, /link\.startsWith\('\/info\/'\)/)
  assert.doesNotMatch(source, /metadata\.mentionedUserIds\) \{/)
  assert.match(source, /\.slice\(0, 10\)/)
})

test('password re-checks share the sign-in lockout', () => {
  for (const path of [
    '../app/(subsystems)/info/api/account/recovery/route.js',
    '../app/(subsystems)/info/api/user/password/route.js',
    '../app/(subsystems)/info/api/account/lifecycle/route.js',
  ]) {
    assert.match(read(path), /checkLoginLockout|verifyPasswordWithLockout/, path)
  }
})

test('blog HTML is sanitized where it is rendered', () => {
  for (const path of ['../app/(subsystems)/info/visitor/blog/[id]/page.js', '../app/(subsystems)/info/user/blogs/[id]/page.js']) {
    assert.match(read(path), /__html: [^}]*sanitizeRichText\(blog\.content\)/, path)
  }
})

test('migration 104 hides private account columns from the public key', () => {
  const sql = read('../../supabase/migrations/104_private_user_columns.sql')
  assert.match(sql, /REVOKE SELECT ON TABLE public\.info_users FROM anon, authenticated/)
  for (const column of ['email', 'password', 'phone_number', 'address', 'last_login']) {
    assert.match(sql, new RegExp(`'${column}'`))
  }
})

test('migration 103 lets only active moderators moderate content', () => {
  const sql = read('../../supabase/migrations/103_moderator_access_and_indexes.sql')
  assert.match(sql, /u\.status = 'active'/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.can_moderate\(uuid\) FROM PUBLIC, anon/)
})

test('migration 105 lets guests read active places and events without exposing staff status', () => {
  const sql = read('../../supabase/migrations/105_public_read_policy_functions.sql')
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.is_tourism_staff\(uuid\) TO anon, authenticated, service_role/)
  assert.equal((sql.match(/p_user_id = auth\.uid\(\)/g) || []).length, 2)
})
