const test = require('node:test')
const assert = require('node:assert/strict')
const { getFeedActionIdentity, buildRepostFeedItem, getRepostTarget } = require('./repostIdentity')

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

const ORIGINAL_AUTHOR = { id: 'author-original', full_name: 'Original Author', profile_image_url: 'original.png', user_type: 'user' }
const REPOSTER = { id: 'user-reposter', full_name: 'Reposter', profile_image_url: 'reposter.png', user_type: 'user' }

function buildRepostItem(originalOverrides = {}, repostOverrides = {}) {
  return buildRepostFeedItem({
    repost: {
      id: 'repost-123',
      user_id: REPOSTER.id,
      original_content_type: 'user_post',
      original_content_id: 'post-456',
      quote_text: null,
      created_at: '2024-02-01T00:00:00.000Z',
      ...repostOverrides,
    },
    original: {
      id: 'post-456',
      user_id: ORIGINAL_AUTHOR.id,
      title: 'An original post',
      content: 'Body copy',
      author: ORIGINAL_AUTHOR,
      ...originalOverrides,
    },
    reposter: REPOSTER,
  })
}

test('a new repost is attributed to the reposter, not the original post author', () => {
  const item = buildRepostItem()

  assert.equal(item.author.id, REPOSTER.id)
  assert.equal(item.author.full_name, 'Reposter')
  assert.equal(item.author.profile_image_url, 'reposter.png')
  assert.notEqual(item.author.id, ORIGINAL_AUTHOR.id)
})

test('the original author stays available for the "Originally shared by" line', () => {
  const item = buildRepostItem()

  assert.equal(item.original_author.id, ORIGINAL_AUTHOR.id)
  assert.equal(item.original_author.full_name, 'Original Author')
  assert.equal(item.original_post.author.id, ORIGINAL_AUTHOR.id)
  assert.equal(item.original_post.user_id, ORIGINAL_AUTHOR.id)
})

test('repost feed item carries the repost identity used by actions', () => {
  const item = buildRepostItem()

  assert.equal(item.id, 'repost-123')
  assert.equal(item.repost_id, 'repost-123')
  assert.equal(item.reposted_by, REPOSTER.id)
  assert.equal(item.created_by, REPOSTER.id)
  assert.equal(item.original_post_id, 'post-456')
  assert.equal(item.original_author_id, ORIGINAL_AUTHOR.id)
  assert.equal(item.is_repost, true)
  assert.equal(item.href, '/user/posts/post-456')
})

test('a new repost keeps its own timestamp instead of the original post date', () => {
  const item = buildRepostItem({ created_at: '2024-01-01T00:00:00.000Z' })

  assert.equal(item.created_at, '2024-02-01T00:00:00.000Z')
  assert.equal(item.reposted_at, '2024-02-01T00:00:00.000Z')
  assert.equal(item.published_at, '2024-02-01T00:00:00.000Z')
  // The embedded original keeps its own date so the inner card still shows it.
  assert.equal(item.original_post.created_at, '2024-01-01T00:00:00.000Z')
})

test('blog reposts link to the blog route', () => {
  const item = buildRepostItem({}, { original_content_type: 'blog' })

  assert.equal(item.type, 'blog')
  assert.equal(item.href, '/user/blogs/post-456')
})

test('reposter falls back to the acting user when the API omits their profile', () => {
  const item = buildRepostFeedItem({
    repost: { id: 'repost-9', user_id: 'user-9', original_content_type: 'user_post', original_content_id: 'post-9' },
    original: { id: 'post-9', user_id: 'author-9', author: { id: 'author-9', full_name: 'Original Author' } },
  })

  assert.equal(item.author.id, 'user-9')
  assert.equal(item.author.id === item.original_author.id, false)
})

test('an incomplete repost payload builds no feed item', () => {
  assert.equal(buildRepostFeedItem({ repost: { id: 'repost-1' }, original: null }), null)
  assert.equal(buildRepostFeedItem({ repost: null, original: { id: 'post-1' } }), null)
})

test('repost target points at the original content, not the repost row', () => {
  const target = getRepostTarget({
    id: 'repost-row',
    repost_id: 'repost-row',
    is_repost: true,
    original_content_type: 'user_post',
    original_content_id: 'post-456',
    original_post: { id: 'post-456' },
  })

  assert.equal(target.contentType, 'user_post')
  assert.equal(target.contentId, 'post-456')
  assert.notEqual(target.contentId, 'repost-row')
})

test('repost target falls back to the embedded original post id', () => {
  const target = getRepostTarget({
    id: 'repost-row',
    original_content_type: 'blog',
    original_post: { id: 'blog-77' },
  })

  assert.equal(target.contentType, 'blog')
  assert.equal(target.contentId, 'blog-77')
})

test('repost target never leaks a repost row id when the original is unknown', () => {
  const target = getRepostTarget({ id: 'repost-row', repost_id: 'repost-row' })

  assert.equal(target.contentId, null)
  assert.equal(target.contentType, 'user_post')
})

test('a fresh repost exposes the original content identity for engagement actions', () => {
  const item = buildRepostItem()

  assert.equal(item.original_content_id, 'post-456')
  assert.equal(item.original_content_type, 'user_post')

  const blogItem = buildRepostItem({}, { original_content_type: 'blog' })
  assert.equal(blogItem.original_content_type, 'blog')
  assert.equal(blogItem.original_content_id, 'post-456')
})

test('repost target resolves through original_post_id when original_content_id is missing', () => {
  const target = getRepostTarget({
    id: 'repost-row',
    original_content_type: 'user_post',
    original_post_id: 'post-456',
    original_post: { id: 'post-456' },
  })

  assert.equal(target.contentId, 'post-456')
})

test('repost target never falls back to the repost row id', () => {
  const target = getRepostTarget({
    id: 'repost-row',
    repost_id: 'repost-row',
    original_post_id: 'post-456',
  })

  assert.equal(target.contentId, 'post-456')
  assert.notEqual(target.contentId, 'repost-row')
})
