import assert from 'node:assert/strict'
import test from 'node:test'
import {
  notifyBlogAuthorsOfUnpublish,
  notifyContentAuthorOfDeletion,
} from './contentDeletionNotifications.mjs'

test('notifies blog authors of unpublishing and includes an optional reason', async () => {
  let inserted
  const client = {
    from(table) {
      assert.equal(table, 'info_notifications')
      return {
        async insert(notifications) {
          inserted = notifications
          return { error: null }
        },
      }
    },
  }

  const result = await notifyBlogAuthorsOfUnpublish(client, [{
    authorId: 'owner-id',
    actorId: 'moderator-id',
    contentTitle: 'Community update',
  }], 'Needs fact checking.')

  assert.deepEqual(result, { sent: 1, failed: 0, warning: null })
  assert.equal(inserted[0].user_id, 'owner-id')
  assert.equal(inserted[0].title, 'Your blog was unpublished')
  assert.match(inserted[0].message, /"Community update" was unpublished/)
  assert.match(inserted[0].message, /Reason: Needs fact checking\./)
})

test('blog unpublish notification works without a reason', async () => {
  let inserted
  const client = {
    from() {
      return {
        async insert(notifications) {
          inserted = notifications
          return { error: null }
        },
      }
    },
  }

  await notifyBlogAuthorsOfUnpublish(client, [{
    authorId: 'owner-id',
    actorId: 'moderator-id',
  }])

  assert.match(inserted[0].message, /was unpublished by the moderation team\.$/)
  assert.doesNotMatch(inserted[0].message, /Reason:/)
})

test('notifies the content owner after staff deletion', async () => {
  let inserted
  const client = {
    from(table) {
      assert.equal(table, 'info_notifications')
      return {
        async insert(notification) {
          inserted = notification
          return { error: null }
        },
      }
    },
  }

  const result = await notifyContentAuthorOfDeletion(client, {
    authorId: 'owner-id',
    actorId: 'staff-id',
    contentType: 'blog post',
    contentTitle: 'Community update',
  })

  assert.equal(result.sent, true)
  assert.equal(inserted[0].user_id, 'owner-id')
  assert.equal(inserted[0].type, 'moderation')
  assert.match(inserted[0].message, /"Community update" was removed/)
})

test('does not send a deletion notification to the deleting author', async () => {
  const client = {
    from() {
      assert.fail('No notification should be created for the author deleting their own content')
    },
  }

  const result = await notifyContentAuthorOfDeletion(client, {
    authorId: 'same-id',
    actorId: 'same-id',
    contentType: 'post',
  })

  assert.deepEqual(result, { sent: false, warning: null })
})

test('reports notification failures without obscuring the completed deletion', async () => {
  const client = {
    from() {
      return {
        async insert() {
          return { error: new Error('notification insert failed') }
        },
      }
    },
  }

  const originalError = console.error
  console.error = () => {}
  try {
    const result = await notifyContentAuthorOfDeletion(client, {
      authorId: 'owner-id',
      actorId: 'staff-id',
      contentType: 'forum topic',
    })
    assert.equal(result.sent, false)
    assert.match(result.warning, /could not be notified/)
  } finally {
    console.error = originalError
  }
})
