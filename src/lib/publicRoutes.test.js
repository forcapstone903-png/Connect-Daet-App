const test = require('node:test')
const assert = require('node:assert/strict')
const { isPublicPathname } = require('./publicRoutes')

test('visitor routes remain public without login', () => {
  assert.equal(isPublicPathname('/visitor'), true)
  assert.equal(isPublicPathname('/visitor/'), true)
  assert.equal(isPublicPathname('/login'), true)
  assert.equal(isPublicPathname('/dashboard'), false)
})
