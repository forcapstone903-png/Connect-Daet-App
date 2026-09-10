const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildActivityMeta,
  buildActivityMessage,
  buildUserNotificationTitle,
  buildUserNotificationMessage,
  trackUserActivity,
  normalizeErrorMessage,
} = require('./trackActivity')

test('activity metadata is mapped to the correct admin labels', () => {
  assert.deepEqual(buildActivityMeta('comment'), {
    title: 'New Comment',
    verb: 'commented on',
    userTitle: 'New comment on your post',
    userVerb: 'commented on your post',
  })
  assert.deepEqual(buildActivityMeta('react_content'), {
    title: 'New Reaction',
    verb: 'reacted to',
    userTitle: 'Someone reacted to your post',
    userVerb: 'reacted to your post',
  })
  assert.deepEqual(buildActivityMeta('share_content'), {
    title: 'New Share',
    verb: 'shared',
    userTitle: 'Someone shared your post',
    userVerb: 'shared your post',
  })
  assert.deepEqual(buildActivityMeta('save_content'), {
    title: 'New Save',
    verb: 'saved',
    userTitle: 'Someone saved your post',
    userVerb: 'saved your post',
  })
  assert.deepEqual(buildActivityMeta('new_post'), {
    title: 'New Post',
    verb: 'published a new post',
    userTitle: 'New post from admin',
    userVerb: 'published a new post',
  })
})

test('admin notification message includes the actor and the post title', () => {
  const message = buildActivityMessage({
    actorName: 'Jane Doe',
    activityType: 'save_content',
    contentTitle: 'Sunset beach update',
  })

  assert.equal(message, 'Jane Doe saved "Sunset beach update".')
})

test('trackUserActivity fails silently when the activity endpoint is unavailable', async () => {
  const originalFetch = global.fetch
  const originalConsoleError = console.error
  const logged = []

  global.fetch = async () => {
    throw new Error('Network failure')
  }
  console.error = (...args) => logged.push(args)

  try {
    const result = await trackUserActivity({
      userId: '11111111-1111-1111-1111-111111111111',
      activityType: 'comment',
      entityType: 'user_post',
      entityId: '22222222-2222-2222-2222-222222222222',
      description: 'Commented on a post',
      metadata: { contentTitle: 'Example' },
    })

    assert.deepEqual(result, { success: false })
    assert.equal(logged.length, 0)
  } finally {
    global.fetch = originalFetch
    console.error = originalConsoleError
  }
})

test('follow activity metadata is exposed as a real notification vocabulary entry', () => {
  assert.deepEqual(buildActivityMeta('follow'), {
    title: 'New Follower',
    verb: 'followed you',
    userTitle: 'You have a new follower',
    userVerb: 'followed you',
  })
})

test('user notification title and message include the actor and post details', () => {
  assert.equal(buildUserNotificationTitle('comment'), 'New comment on your post')
  assert.equal(
    buildUserNotificationMessage({
      actorName: 'Jane Doe',
      activityType: 'comment',
      contentTitle: 'Sunset beach update',
    }),
    'Jane Doe commented on your post "Sunset beach update".'
  )
  assert.equal(
    buildUserNotificationMessage({
      actorName: 'Admin Team',
      activityType: 'new_post',
      contentTitle: 'Island Festival Highlights',
    }),
    'Admin Team published a new post: "Island Festival Highlights".'
  )
})

test('normalizeErrorMessage turns a thrown object or route payload into a safe user text', () => {
  assert.equal(normalizeErrorMessage(new Error('Column missing in blog table')), 'Column missing in blog table')
  assert.equal(normalizeErrorMessage({ message: 'Unable to create your blog article.' }), 'Unable to create your blog article.')
  assert.equal(normalizeErrorMessage({}), 'Unable to create your blog article right now.')
})
