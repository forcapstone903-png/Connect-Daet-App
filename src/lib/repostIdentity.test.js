const test = require('node:test')
const assert = require('node:assert/strict')
const { getFeedActionIdentity } = require('./repostIdentity')

test('repost action identity stays on the repost instance instead of the original post', () => {
  const identity = getFeedActionIdentity({
    is_repost: true,
    repost_id: 'repost-123',
    original_content_type: 'user_post',
    original_content_id: 'post-456',
    type: 'post',
    id: 'repost-123',
  })

  assert.equal(identity.contentType, 'user_post')
  assert.equal(identity.contentId, 'repost-123')
  assert.equal(identity.originalContentId, 'post-456')
  assert.equal(identity.isRepost, true)
})

test('non-repost content keeps the original content identity', () => {
  const identity = getFeedActionIdentity({
    id: 'post-456',
    type: 'post',
    original_content_type: 'user_post',
    original_content_id: 'post-456',
  })

  assert.equal(identity.contentType, 'user_post')
  assert.equal(identity.contentId, 'post-456')
  assert.equal(identity.isRepost, false)
})
