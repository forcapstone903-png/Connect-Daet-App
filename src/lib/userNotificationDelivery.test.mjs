import assert from 'node:assert/strict'
import test from 'node:test'
import { notifyUserRecipients } from './userNotificationDelivery.mjs'

test('notification delivery deduplicates recipients and tolerates already-created notices', async () => {
  const attempts = []
  const client = {
    from(table) {
      assert.equal(table, 'info_notifications')
      return {
        async insert(row) {
          attempts.push(row)
          return { error: attempts.length === 1 ? { code: '23505' } : null }
        },
      }
    },
  }
  const notice = {
    user_id: 'user-1',
    title: 'New activity',
    message: 'A new action needs your attention.',
    type: 'activity',
    link: '/info/user/notifications',
    actor_id: 'actor-1',
  }

  const delivered = await notifyUserRecipients(client, [notice, notice, { ...notice, user_id: 'user-2' }], 'Test')

  assert.equal(delivered, 1)
  assert.deepEqual(attempts.map(({ user_id }) => user_id), ['user-1', 'user-2'])
})
