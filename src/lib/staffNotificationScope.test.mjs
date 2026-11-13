import assert from 'node:assert/strict'
import test from 'node:test'
import { applyStaffNotificationScope, isStaffNotificationChange } from './staffNotificationScope.mjs'

function createQuery() {
  const calls = []
  return {
    calls,
    is(...args) {
      calls.push(['is', ...args])
      return this
    },
    not(...args) {
      calls.push(['not', ...args])
      return this
    },
  }
}

test('staff notification scope excludes alert deliveries and all-clear notices', () => {
  const query = createQuery()

  assert.equal(applyStaffNotificationScope(query, 'staff'), query)
  assert.deepEqual(query.calls, [
    ['is', 'alert_id', null],
    ['not', 'type', 'in', '(alert,alert_all_clear)'],
  ])
})

test('default notification scope leaves user notifications unchanged', () => {
  const query = createQuery()

  assert.equal(applyStaffNotificationScope(query, undefined), query)
  assert.deepEqual(query.calls, [])
})

test('staff realtime refresh ignores alert broadcasts and accepts inquiry notifications', () => {
  assert.equal(isStaffNotificationChange({ new: { type: 'info', alert_id: null } }), true)
  assert.equal(isStaffNotificationChange({ new: { type: 'alert', alert_id: 'alert-1' } }), false)
  assert.equal(isStaffNotificationChange({ new: { type: 'alert_all_clear', alert_id: null } }), false)
  assert.equal(isStaffNotificationChange({ old: { id: 'deleted-row' } }), false)
})
