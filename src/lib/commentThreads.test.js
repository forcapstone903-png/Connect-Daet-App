const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCommentThreads } = require('./commentThreads')

test('own newest comment is prioritized at the top of the thread', () => {
  const comments = [
    {
      id: 'older-1',
      parent_id: null,
      user_id: 'user-b',
      created_at: '2024-01-01T10:00:00.000Z',
      relevance_score: 10,
      children: [],
    },
    {
      id: 'new-1',
      parent_id: null,
      user_id: 'user-a',
      created_at: '2024-01-02T12:00:00.000Z',
      relevance_score: 5,
      children: [],
    },
    {
      id: 'older-2',
      parent_id: null,
      user_id: 'user-c',
      created_at: '2024-01-01T09:00:00.000Z',
      relevance_score: 20,
      children: [],
    },
  ]

  const ordered = buildCommentThreads(comments, 'relevant', 'user-a')
  assert.equal(ordered[0].id, 'new-1')
})

test('new user comment is reordered to the top immediately on optimistic insert', () => {
  const comments = [
    { id: 'older-1', user_id: 'user-b', created_at: '2024-01-01T10:00:00.000Z', relevance_score: 9 },
    { id: 'older-2', user_id: 'user-c', created_at: '2024-01-01T09:00:00.000Z', relevance_score: 7 },
  ]

  const optimistic = [
    ...comments,
    { id: 'new-1', user_id: 'user-a', created_at: '2024-01-02T12:00:00.000Z', relevance_score: 2 },
  ]

  const ordered = buildCommentThreads(optimistic, 'relevant', 'user-a')
  assert.equal(ordered[0].id, 'new-1')
  assert.equal(ordered.at(-1)?.id, 'older-2')
})
