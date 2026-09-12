const { test } = require('node:test')
const assert = require('node:assert/strict')

const { renderMentionText } = require('./mentions')

test('renderMentionText removes the @ symbol from displayed mentions while preserving the linked user id', () => {
  const parts = renderMentionText('Hello @Maria Santos, thank you!', [
    {
      mentioned_user_id: 'user-123',
      display_name: 'Maria Santos',
    },
  ])

  assert.deepEqual(parts, [
    { type: 'text', value: 'Hello ' },
    { type: 'mention', value: 'Maria Santos', userId: 'user-123' },
    { type: 'text', value: ', thank you!' },
  ])
})

test('renderMentionText also handles plain display names without @ symbols', () => {
  const parts = renderMentionText('Hello Marvin Sarmiento, thank you!', [
    {
      mentioned_user_id: 'user-456',
      display_name: 'Marvin Sarmiento',
    },
  ])

  assert.deepEqual(parts, [
    { type: 'text', value: 'Hello ' },
    { type: 'mention', value: 'Marvin Sarmiento', userId: 'user-456' },
    { type: 'text', value: ', thank you!' },
  ])
})
