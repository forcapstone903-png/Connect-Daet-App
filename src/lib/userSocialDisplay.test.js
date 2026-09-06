const test = require('node:test')
const assert = require('node:assert/strict')
const { getAuthorDisplayName, getAuthorRoleLabel } = require('./userSocialDisplay')

test('admin authors use their name or a clear administrator label', () => {
  assert.equal(getAuthorDisplayName({ full_name: 'Aimee Dela Cruz', user_type: 'admin' }), 'Aimee Dela Cruz')
  assert.equal(getAuthorDisplayName({ user_type: 'admin' }), 'Administrator')
  assert.equal(getAuthorDisplayName({ full_name: 'Mika Santos', user_type: 'tourist' }), 'Mika Santos')
})

test('admin authors get a consistent role label', () => {
  assert.equal(getAuthorRoleLabel({ user_type: 'admin' }), 'Administrator')
  assert.equal(getAuthorRoleLabel({ full_name: 'Mika Santos', user_type: 'tourist' }), '')
})
