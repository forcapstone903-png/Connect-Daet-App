const test = require('node:test')
const assert = require('node:assert/strict')

const { isValidUuid, filterValidUuidValues } = require('./uuid.js')

test('isValidUuid accepts standard UUIDs and rejects placeholders', () => {
  assert.equal(isValidUuid('2704101a-b4dc-4038-9a6a-a1a59d044b1f'), true)
  assert.equal(isValidUuid('blog'), false)
  assert.equal(isValidUuid('repost-123'), false)
  assert.equal(isValidUuid(''), false)
})

test('filterValidUuidValues removes invalid ids before Supabase queries', () => {
  const filtered = filterValidUuidValues([
    '2704101a-b4dc-4038-9a6a-a1a59d044b1f',
    'repost-123',
    'a001ca87-95ec-482d-bb5a-7177f6d24602',
    null,
    'forum',
    '2704101a-b4dc-4038-9a6a-a1a59d044b1f',
  ])

  assert.deepEqual(filtered, [
    '2704101a-b4dc-4038-9a6a-a1a59d044b1f',
    'a001ca87-95ec-482d-bb5a-7177f6d24602',
  ])
})
