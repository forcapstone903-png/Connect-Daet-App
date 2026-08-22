const test = require('node:test')
const assert = require('node:assert/strict')
const { isPublicPathname } = require('./publicRoutes')

test('welcome routes remain public without login', () => {
  assert.equal(isPublicPathname('/welcome'), true)
  assert.equal(isPublicPathname('/welcome/'), true)
  assert.equal(isPublicPathname('/login'), true)
  assert.equal(isPublicPathname('/dashboard'), false)
})
