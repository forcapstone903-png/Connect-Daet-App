import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isSuspendedAccountApiAllowed,
  isSuspendedAccountPageAllowed,
} from './restrictedAccountAccess.mjs'

const isPublicPathname = (pathname) => pathname.startsWith('/info/api/public/')

test('suspended accounts can read, comment, react, and appeal but not perform other writes', () => {
  assert.equal(isSuspendedAccountApiAllowed('/info/api/user/feed', 'GET', isPublicPathname), true)
  assert.equal(isSuspendedAccountApiAllowed('/info/api/comments', 'POST', isPublicPathname), true)
  assert.equal(isSuspendedAccountApiAllowed('/info/api/forum-replies', 'POST', isPublicPathname), true)
  assert.equal(isSuspendedAccountApiAllowed('/info/api/reactions', 'DELETE', isPublicPathname), true)
  assert.equal(isSuspendedAccountApiAllowed('/info/api/user/moderation-appeals', 'POST', isPublicPathname), true)
  assert.equal(isSuspendedAccountApiAllowed('/info/api/user/blogs', 'POST', isPublicPathname), false)
  assert.equal(isSuspendedAccountApiAllowed('/info/api/users/123/follow', 'POST', isPublicPathname), false)
  assert.equal(isSuspendedAccountApiAllowed('/info/api/user/settings', 'PATCH', isPublicPathname), false)
  assert.equal(isSuspendedAccountApiAllowed('/info/api/public/visitor-feed', 'GET', isPublicPathname), true)
})

test('suspended accounts can view content and appeal pages but not create or edit content', () => {
  assert.equal(isSuspendedAccountPageAllowed('/info/user/dashboard', 'GET'), true)
  assert.equal(isSuspendedAccountPageAllowed('/info/user/forums/123', 'GET'), true)
  assert.equal(isSuspendedAccountPageAllowed('/info/visitor/blog/123', 'GET'), true)
  assert.equal(isSuspendedAccountPageAllowed('/info/user/moderation-appeals', 'GET'), true)
  assert.equal(isSuspendedAccountPageAllowed('/info/user/blogs/new', 'GET'), false)
  assert.equal(isSuspendedAccountPageAllowed('/info/user/profile/edit', 'GET'), false)
  assert.equal(isSuspendedAccountPageAllowed('/info/user/forums/123', 'POST'), false)
})
