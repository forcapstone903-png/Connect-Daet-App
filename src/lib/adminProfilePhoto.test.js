import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const accountPage = readFileSync(new URL('../app/(subsystems)/info/admin/account/page.js', import.meta.url), 'utf8')
const uploadRoute = readFileSync(new URL('../app/(subsystems)/info/api/upload/route.js', import.meta.url), 'utf8')
const sidebar = readFileSync(new URL('../app/(subsystems)/info/components/AdminSidebar.js', import.meta.url), 'utf8')

test('administrator profile saves the uploaded image to account and public profile records', () => {
  assert.match(accountPage, /profile_image_url:\s*profile\.profile_image_url\s*\|\|\s*null/)
  assert.match(accountPage, /from\('profiles'\)/)
  assert.match(accountPage, /updateStoredSession\(updatedUser\)/)
})

test('profile media uploads are restricted to the signed-in user folders', () => {
  assert.match(uploadRoute, /folder === `users\/\$\{userId\}`/)
  assert.match(uploadRoute, /folder === `covers\/\$\{userId\}`/)
  assert.match(uploadRoute, /You can only upload profile images to your own account/)
})

test('admin sidebar renders the saved profile picture when available', () => {
  assert.match(sidebar, /user\?\.profile_image_url/)
  assert.match(sidebar, /src=\{user\.profile_image_url\}/)
})
