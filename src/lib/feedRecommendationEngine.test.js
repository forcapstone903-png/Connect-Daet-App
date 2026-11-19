const test = require('node:test')
const assert = require('node:assert/strict')
const { buildRecommendationProfile, rankFeedItems, createColdStartProfile, isUpcomingEvent } = require('./feedRecommendationEngine')

test('user with beach interest ranks beach content above other categories', () => {
  const profile = {
    contentTypes: { blog: 0.2, event: 0.1, tourist_spot: 0.9, forum: 0.2, announcement: 0.1 },
    categories: { beach: 0.9, food: 0.2, local: 0.2 },
    authors: { a1: 0.7 },
    destinations: { beach: 0.9 },
  }

  const scored = rankFeedItems({
    items: [
      { id: '1', type: 'tourist_spot', category: 'Beach', title: 'Beach', created_by: 'a1', published_at: new Date().toISOString(), views: 10 },
      { id: '2', type: 'blog', category: 'Food', title: 'Food', created_by: 'a2', published_at: new Date().toISOString(), views: 40 },
    ],
    profile,
    userFollows: new Set(['a1']),
    now: Date.now(),
  })

  assert.ok(scored[0].recommendationScore > scored[1].recommendationScore)
})

test('canonical interest selections boost matching stories, events, and places', () => {
  const scored = rankFeedItems({
    items: [
      { id: 'beach', type: 'tourist_spot', category: 'Beach', title: 'Coastal destination' },
      { id: 'festival', type: 'event', category: 'Festival', title: 'Local festival' },
      { id: 'food', type: 'blog', category: 'Food', title: 'Local cuisine' },
    ],
    preferredCategories: ['Beaches and Coastal Destinations', 'Festivals and Events'],
    profile: { contentTypes: {}, categories: {}, authors: {}, destinations: {} },
    now: Date.now(),
  })

  assert.deepEqual(scored.slice(0, 2).map((item) => item.id).sort(), ['beach', 'festival'])
})

test('selected beach interest outranks newer, popular nonmatching feed items', () => {
  const scored = rankFeedItems({
    items: [
      {
        id: 'market',
        type: 'blog',
        category: 'Food',
        title: 'Popular local market',
        created_by: 'followed-user',
        published_at: '2026-11-19T06:00:00.000Z',
        likes: 500,
        comments_count: 300,
        views: 10000,
      },
      {
        id: 'beach',
        type: 'post',
        category: 'Community',
        title: 'Sunset at Bagasbas Beach',
        published_at: '2026-11-18T06:00:00.000Z',
      },
    ],
    preferredCategories: ['Beaches and Coastal Destinations'],
    profile: { contentTypes: {}, categories: {}, authors: {}, destinations: {} },
    userFollows: new Set(['followed-user']),
    now: Date.parse('2026-11-19T06:30:00.000Z'),
  })

  assert.equal(scored[0].id, 'beach')
})

test('selected interests match post text and tags even without a category label', () => {
  const scored = rankFeedItems({
    items: [
      { id: 'unrelated', type: 'post', title: 'A day in town', content: 'Visiting the market' },
      { id: 'matching', type: 'post', title: 'Weekend photos', tags: ['travel', 'Bagasbas beach'] },
    ],
    preferredCategories: ['Beaches and Coastal Destinations'],
    profile: { contentTypes: {}, categories: {}, authors: {}, destinations: {} },
  })

  assert.equal(scored[0].id, 'matching')
})

test('interest ranking keeps nonmatching fallback content in the feed', () => {
  const scored = rankFeedItems({
    items: [{ id: 'fallback', type: 'blog', title: 'A community update' }],
    preferredCategories: ['Nature and Adventure'],
    profile: { contentTypes: {}, categories: {}, authors: {}, destinations: {} },
  })

  assert.deepEqual(scored.map((item) => item.id), ['fallback'])
})

test('engagement with user posts boosts compatible post content', () => {
  const profile = buildRecommendationProfile({
    reactions: [{ content_type: 'user_post', content_id: 'post-1' }],
  })
  const publishedAt = '2026-02-20T05:00:00.000Z'
  const ranked = rankFeedItems({
    items: [
      { id: 'blog-1', type: 'blog', title: 'Town update', published_at: publishedAt },
      { id: 'post-1', type: 'post', title: 'Community update', published_at: publishedAt },
    ],
    profile,
    now: Date.parse(publishedAt),
  })

  assert.equal(ranked[0].id, 'post-1')
})

test('only current or future published events qualify for upcoming recommendations', () => {
  const now = Date.parse('2026-02-20T05:00:00.000Z')

  assert.equal(isUpcomingEvent({ status: 'published', start_date: '2026-02-20', end_date: '2026-02-21' }, now), true)
  assert.equal(isUpcomingEvent({ status: 'published', start_date: '2026-02-20', end_date: '2026-02-20', end_time: '15:00:00' }, now), true)
  assert.equal(isUpcomingEvent({ status: 'published', start_date: '2026-02-20', end_date: '2026-02-20', end_time: '12:00:00' }, now), false)
  assert.equal(isUpcomingEvent({ status: 'published', start_date: '2026-02-18', end_date: '2026-02-19' }, now), false)
  assert.equal(isUpcomingEvent({ status: 'cancelled', start_date: '2026-02-21' }, now), false)
  assert.equal(isUpcomingEvent({ status: 'completed', start_date: '2026-02-21' }, now), false)
  assert.equal(isUpcomingEvent({ status: 'draft', start_date: '2026-02-21' }, now), false)
  assert.equal(isUpcomingEvent({ status: 'published', start_date: null }, now), false)
})

test('reposts keep independent feed item identity and are not merged together', () => {
  const profile = { contentTypes: {}, categories: {}, authors: {}, destinations: {} }
  const items = [
    { id: 'repost-1', repost_id: 'repost-1', type: 'post', category: 'Beach', title: 'Repost A', published_at: new Date().toISOString(), created_by: 'u1' },
    { id: 'repost-2', repost_id: 'repost-2', type: 'post', category: 'Beach', title: 'Repost B', published_at: new Date().toISOString(), created_by: 'u2' },
  ]

  const scored = rankFeedItems({ items, profile, now: Date.now() })
  assert.equal(scored[0].recommendationKey, 'feed-item:repost-1')
  assert.equal(scored[1].recommendationKey, 'feed-item:repost-2')
})

test('diversity reduces repeated categories in a row', () => {
  const profile = { contentTypes: {}, categories: {}, authors: {}, destinations: {} }
  const now = Date.parse('2025-01-01T00:00:00.000Z')
  const items = [
    { id: '1', type: 'tourist_spot', category: 'Beach', title: 'Beach 1', published_at: '2025-01-01T00:00:00.000Z' },
    { id: '2', type: 'tourist_spot', category: 'Beach', title: 'Beach 2', published_at: '2025-01-01T00:00:00.000Z' },
    { id: '3', type: 'blog', category: 'Food', title: 'Food 1', published_at: '2025-01-01T00:00:00.000Z' },
  ]

  const scored = rankFeedItems({ items, profile, now })
  const foodIndex = scored.findIndex((item) => item.category === 'Food')
  const secondBeachIndex = scored.findIndex((item, index) => index > 0 && item.category === 'Beach')
  assert.ok(foodIndex >= 0)
  assert.ok(secondBeachIndex >= 0)
  assert.ok(foodIndex < secondBeachIndex)
})

test('cold-start profile still produces a usable score distribution', () => {
  const profile = createColdStartProfile({ userId: 'user-1' })
  assert.ok(profile.contentTypes.blog > 0)
  assert.ok(profile.categories.beach > 0 || profile.categories.events > 0 || profile.categories.food > 0)
})
