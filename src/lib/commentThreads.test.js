const { test } = require('node:test')
const assert = require('node:assert/strict')

const { buildCommentThreads } = require('./commentThreads')

test('buildCommentThreads nests replies under the correct parent comment', () => {
  const comments = [
    { id: 'root-1', parent_id: null, created_at: '2024-01-02T00:00:00Z', relevance_score: 4, is_pinned: true },
    { id: 'reply-1', parent_id: 'root-1', created_at: '2024-01-03T00:00:00Z', relevance_score: 2, is_pinned: false },
    { id: 'reply-2', parent_id: 'root-1', created_at: '2024-01-04T00:00:00Z', relevance_score: 5, is_pinned: false },
    { id: 'nested-1', parent_id: 'reply-1', created_at: '2024-01-05T00:00:00Z', relevance_score: 1, is_pinned: false },
    { id: 'root-2', parent_id: null, created_at: '2024-01-01T00:00:00Z', relevance_score: 0, is_pinned: false },
  ]

  const threads = buildCommentThreads(comments, 'relevant')

  assert.equal(threads.length, 2)
  assert.equal(threads[0].id, 'root-1')
  assert.equal(threads[0].children.length, 2)
  assert.deepEqual(
    threads[0].children.map((child) => child.id),
    ['reply-2', 'reply-1']
  )
  assert.equal(threads[0].children[1].children.length, 1)
  assert.equal(threads[0].children[1].children[0].id, 'nested-1')
})

test('buildCommentThreads keeps top-level comments separate from replies', () => {
  const comments = [
    { id: 'a', parent_id: null, created_at: '2024-01-01T00:00:00Z', relevance_score: 0, is_pinned: false },
    { id: 'b', parent_id: 'a', created_at: '2024-01-02T00:00:00Z', relevance_score: 1, is_pinned: false },
    { id: 'c', parent_id: null, created_at: '2024-01-03T00:00:00Z', relevance_score: 2, is_pinned: false },
  ]

  const threads = buildCommentThreads(comments, 'relevant')

  assert.deepEqual(threads.map((thread) => thread.id), ['c', 'a'])
  assert.equal(threads[1].children[0].id, 'b')
})
