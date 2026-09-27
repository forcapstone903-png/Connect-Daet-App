const test = require('node:test')
const assert = require('node:assert/strict')
const { prioritizePinnedFeedItems } = require('./feedOrdering')

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
