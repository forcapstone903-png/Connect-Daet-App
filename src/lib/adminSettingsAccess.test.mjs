import assert from 'node:assert/strict'
import test from 'node:test'
import { canManageAppSetting } from './adminSettingsAccess.mjs'

test('tourism officers can only access general app settings', () => {
  const session = { role: 'tourism_officer' }
  assert.equal(canManageAppSetting(session, 'general'), true)
  for (const setting of ['security', 'notifications', 'email', 'messaging', 'rewards', 'unknown']) {
    assert.equal(canManageAppSetting(session, setting), false, setting)
  }
})

test('administrators retain access to every app setting', () => {
  const session = { role: 'admin' }
  for (const setting of ['general', 'security', 'notifications', 'email', 'messaging', 'rewards']) {
    assert.equal(canManageAppSetting(session, setting), true, setting)
  }
})

test('roles without tourism or system permissions cannot access app settings', () => {
  assert.equal(canManageAppSetting({ role: 'moderator' }, 'general'), false)
  assert.equal(canManageAppSetting({ role: 'tourist' }, 'general'), false)
})
