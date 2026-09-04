const test = require('node:test')
const assert = require('node:assert/strict')
const { hasAdminAccess, canAccessAdminDashboard } = require('./adminRoles')

test('hasAdminAccess accepts an admin role regardless of casing', () => {
  assert.equal(hasAdminAccess('admin'), true)
  assert.equal(hasAdminAccess('Admin'), true)
  assert.equal(hasAdminAccess('user'), false)
})

test('canAccessAdminDashboard only allows authenticated admin sessions', () => {
  assert.equal(canAccessAdminDashboard({ role: 'admin' }), true)
  assert.equal(canAccessAdminDashboard({ role: 'Admin' }), true)
  assert.equal(canAccessAdminDashboard({ role: 'user' }), false)
  assert.equal(canAccessAdminDashboard(null), false)
})
