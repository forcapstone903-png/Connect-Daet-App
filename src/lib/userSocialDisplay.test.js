const test = require('node:test')
const assert = require('node:assert/strict')
const { getAuthorDisplayName } = require('./userSocialDisplay')

test('admin authors with generic labels use the tourism admin display name', () => {
  for (const full_name of ['Administrator', 'System Administrator', 'Daet Tourism Administrator']) {
    assert.equal(getAuthorDisplayName({ user_type: 'admin', full_name }), 'Daet Tourism Admin')
  }
})

test('admin authors retain their current custom account name', () => {
  assert.equal(
    getAuthorDisplayName({ user_type: 'admin', full_name: 'Daet Tourism Office' }),
    'Daet Tourism Office',
  )
})
