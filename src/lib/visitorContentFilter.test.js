const test = require('node:test')
const assert = require('node:assert/strict')
const { getVisitorEngagementScore, isVisitorVisibleContent, VISITOR_TRENDING_THRESHOLD } = require('./visitorContentFilter')

test('tourist content is hidden from the public visitor feed until it trends or crosses the engagement threshold', () => {
  const touristPost = { likes: 600, comments_count: 200, shares_count: 150, views: 50, author_type: 'tourist' }
  const trendingTouristPost = { likes: 600, comments_count: 200, shares_count: 150, views: 50, author_type: 'tourist', is_trending: true }

  assert.equal(isVisitorVisibleContent(touristPost), false)
  assert.equal(isVisitorVisibleContent(trendingTouristPost), true)
  assert.ok(getVisitorEngagementScore(touristPost) < VISITOR_TRENDING_THRESHOLD)
})

test('admin content remains public and non-tourist authors remain visible by default', () => {
  assert.equal(isVisitorVisibleContent({ author_type: 'admin' }), true)
  assert.equal(isVisitorVisibleContent({ author_type: 'artisan', likes: 5 }), true)
})
