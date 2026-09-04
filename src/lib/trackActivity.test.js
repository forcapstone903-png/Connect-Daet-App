const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildActivityMeta,
  buildActivityMessage,
  buildUserNotificationTitle,
  buildUserNotificationMessage,
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
