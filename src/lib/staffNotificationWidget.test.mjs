import assert from 'node:assert/strict'
import test from 'node:test'
import { getNewUnreadStaffNotifications } from './staffNotificationWidget.mjs'

test('initial notification load does not show old notifications as new', () => {
  const notifications = [{ id: 'existing', is_read: false }]

  assert.deepEqual(getNewUnreadStaffNotifications(notifications, null), [])
})

test('reconciliation returns only newly observed unread notifications', () => {
  const notifications = [
    { id: 'existing', is_read: false },
    { id: 'new-unread', is_read: false },
    { id: 'new-read', is_read: true },
  ]

  assert.deepEqual(
    getNewUnreadStaffNotifications(notifications, new Set(['existing'])),
    [{ id: 'new-unread', is_read: false }],
  )
})

test('a realtime insert can be announced before the initial load completes', () => {
  const notifications = [
    { id: 'older', is_read: false },
    { id: 'incoming', is_read: false },
  ]

  assert.deepEqual(
    getNewUnreadStaffNotifications(notifications, null, 'incoming'),
    [{ id: 'incoming', is_read: false }],
  )
})
