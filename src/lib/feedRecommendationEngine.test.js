const test = require('node:test')
const assert = require('node:assert/strict')
const { rankFeedItems, createColdStartProfile } = require('./feedRecommendationEngine')

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
  const items = [
    { id: '1', type: 'tourist_spot', category: 'Beach', title: 'Beach 1', published_at: new Date().toISOString() },
    { id: '2', type: 'tourist_spot', category: 'Beach', title: 'Beach 2', published_at: new Date().toISOString() },
    { id: '3', type: 'blog', category: 'Food', title: 'Food 1', published_at: new Date().toISOString() },
  ]

  const scored = rankFeedItems({ items, profile, now: Date.now() })
  assert.ok(scored[0].recommendationScore > scored[2].recommendationScore)
  assert.equal(scored[0].category, 'Food')
})

test('cold-start profile still produces a usable score distribution', () => {
  const profile = createColdStartProfile({ userId: 'user-1' })
  assert.ok(profile.contentTypes.blog > 0)
  assert.ok(profile.categories.beach > 0 || profile.categories.events > 0 || profile.categories.food > 0)
})
