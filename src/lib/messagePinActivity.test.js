import assert from 'node:assert/strict'
import test from 'node:test'
import { getPinActivityText } from './messagePinActivity.js'

test('uses viewer-aware naming for pin activity', () => {
  const viewerUser = { id: 'viewer-1', full_name: 'Main User' }
  const otherUser = { id: 'other-2', full_name: 'Juan' }

  assert.equal(
    getPinActivityText({ actor_user_id: 'viewer-1', action_type: 'pinned' }, 'viewer-1', viewerUser, otherUser),
    'You pinned a message.'
  )

  assert.equal(
    getPinActivityText({ actor_user_id: 'other-2', action_type: 'pinned' }, 'viewer-1', viewerUser, otherUser),
    'Juan pinned a message.'
  )

  assert.equal(
    getPinActivityText({ actor_user_id: 'viewer-1', action_type: 'unpinned' }, 'viewer-1', viewerUser, otherUser),
    'You unpinned a message.'
  )

  assert.equal(
    getPinActivityText({ actor_user_id: 'other-2', action_type: 'unpinned' }, 'viewer-1', viewerUser, otherUser),
    'Juan unpinned a message.'
  )
})
