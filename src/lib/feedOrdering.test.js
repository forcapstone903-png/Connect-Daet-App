const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ANNOUNCEMENT_PIN_DURATION_MS,
  getPinnedAnnouncement,
  isHiddenByFeedPreferences,
  prioritizeAnnouncement,
  prioritizeNewestCommunityPost,
  prioritizeOwnerFeedItems,
  prioritizePinnedFeedItems,
} = require('./feedOrdering')

test('saved items are moved to the front of the feed', () => {
  const items = [
    { type: 'post', id: 'older', title: 'Older' },
    { type: 'post', id: 'save-me', title: 'Saved post' },
    { type: 'post', id: 'newer', title: 'Newer' },
  ]

  const ordered = prioritizePinnedFeedItems(items, new Set(['post-save-me']), new Set())

  assert.equal(ordered[0].id, 'save-me')
  assert.equal(ordered[1].id, 'older')
  assert.equal(ordered.at(-1).id, 'newer')
})

test('new reposts stay pinned at the top until the user clears them', () => {
  const items = [
    { type: 'post', id: 'older', title: 'Older', is_repost: false },
    { type: 'post', id: 'new-repost', title: 'New repost', is_repost: true },
    { type: 'post', id: 'latest', title: 'Latest', is_repost: false },
  ]

  const ordered = prioritizePinnedFeedItems(items, new Set(), new Set(['new-repost']))

  assert.equal(ordered[0].id, 'new-repost')
  assert.equal(ordered[1].id, 'older')
})

test('the newest admin announcement is pinned for one day', () => {
  const now = Date.parse('2026-11-10T00:00:00.000Z')
  const recent = {
    id: 'notice',
    type: 'announcement',
    author: { user_type: 'admin' },
    published_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  }
  const older = {
    id: 'old-notice',
    type: 'announcement',
    author: { user_type: 'admin' },
    published_at: new Date(now - ANNOUNCEMENT_PIN_DURATION_MS - 1).toISOString(),
  }
  const feed = [{ id: 'post', type: 'post' }, recent, older]

  assert.equal(getPinnedAnnouncement(feed, now).id, 'notice')
  assert.deepEqual(prioritizeAnnouncement(feed, 'notice').map((item) => item.id), ['notice', 'post', 'old-notice'])
  assert.equal(getPinnedAnnouncement(feed, now + 23 * 60 * 60 * 1000), null)
})

test('expired, future, and non-admin announcements are not pinned', () => {
  const now = Date.parse('2026-11-10T00:00:00.000Z')
  const feed = [
    { id: 'expired', type: 'announcement', author: { user_type: 'admin' }, published_at: new Date(now - 60 * 60 * 1000).toISOString(), expires_at: new Date(now - 1).toISOString() },
    { id: 'future', type: 'announcement', author: { user_type: 'admin' }, published_at: new Date(now + 1000).toISOString() },
    { id: 'member', type: 'announcement', author: { user_type: 'member' }, published_at: new Date(now - 1000).toISOString() },
  ]

  assert.equal(getPinnedAnnouncement(feed, now), null)
})

test('owner posts are newest-first and stay ahead of pinned announcements', () => {
  const ownerId = 'account-owner-id'
  const items = [
    { type: 'post', id: 'community', created_by: 'another-account' },
    { type: 'announcement', id: 'notice', published_at: '2026-11-10T00:00:00Z' },
    { type: 'post', id: 'owner-old', user_id: ownerId, published_at: '2026-11-09T00:00:00Z' },
    { type: 'post', id: 'owner-new', created_by: ownerId, published_at: '2026-11-11T00:00:00Z' },
  ]

  const ordered = prioritizeOwnerFeedItems(items, ownerId, 'notice')

  assert.deepEqual(ordered.map((item) => item.id), ['owner-new', 'owner-old', 'notice', 'community'])
})

test('the newest community post stays at the top after feed ranking', () => {
  const items = [
    { type: 'post', id: 'ranked-first', published_at: '2026-11-09T00:00:00Z' },
    { type: 'announcement', id: 'notice', published_at: '2026-11-11T00:00:00Z' },
    { type: 'post', id: 'newest', published_at: '2026-11-10T00:00:00Z' },
    { type: 'post', id: 'repost', is_repost: true, published_at: '2026-11-12T00:00:00Z' },
  ]

  assert.deepEqual(
    prioritizeNewestCommunityPost(items).map((item) => item.id),
    ['newest', 'ranked-first', 'notice', 'repost'],
  )
})

test('reposts are not treated as original owner posts', () => {
  const ownerId = 'account-owner-id'
  const items = [
    { type: 'post', id: 'community', created_by: 'another-account' },
    { type: 'post', id: 'owner-repost', user_id: ownerId, is_repost: true },
    { type: 'post', id: 'owner-post', user_id: ownerId, published_at: '2026-11-11T00:00:00Z' },
  ]

  const ordered = prioritizeOwnerFeedItems(items, ownerId)

  assert.deepEqual(ordered.map((item) => item.id), ['owner-post', 'community', 'owner-repost'])
})

test('owner posts are not hidden by the owner’s local feed preferences', () => {
  const ownerId = 'account-owner-id'
  const ownPost = {
    type: 'blog',
    id: 'my-post',
    created_by: ownerId,
    category: 'Travel',
    author: { id: ownerId },
  }
  const hiddenPosts = new Set(['blog-my-post'])
  const notInterestedTopics = new Set([`author:${ownerId}`, 'category:travel'])

  assert.equal(isHiddenByFeedPreferences(ownPost, ownerId, hiddenPosts, notInterestedTopics), false)
  assert.equal(isHiddenByFeedPreferences({ ...ownPost, id: 'other-post', created_by: 'another-account' }, ownerId, hiddenPosts, notInterestedTopics), true)
})
