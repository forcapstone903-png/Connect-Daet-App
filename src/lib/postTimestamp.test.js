const assert = require('node:assert/strict')
const test = require('node:test')

let formatPostTimestamp
let getPostTimestampRefreshDelay

test('formats recent posts relatively until they reach one day old', async () => {
  const timestamps = await import('./postTimestamp.mjs')
  formatPostTimestamp = timestamps.formatPostTimestamp

  const now = Date.parse('2026-11-11T12:00:00.000Z')
  assert.equal(formatPostTimestamp('2026-11-11T11:30:00.000Z', now), '30m ago')
  assert.equal(formatPostTimestamp('2026-11-11T09:00:00.000Z', now), '3h ago')
})

test('shows the calendar date and age starting one day after posting', async () => {
  const timestamps = await import('./postTimestamp.mjs')
  formatPostTimestamp = timestamps.formatPostTimestamp

  const now = Date.parse('2026-11-11T12:00:00.000Z')
  assert.match(formatPostTimestamp('2026-11-10T12:00:00.000Z', now), /· 1 day ago$/)
  assert.match(formatPostTimestamp('2026-11-09T12:00:00.000Z', now), /· 2 days ago$/)
  assert.match(formatPostTimestamp('2026-11-03T12:00:00.000Z', now), /Nov 3/)
  assert.equal(formatPostTimestamp('not-a-date', now), 'Recently')
})

test('schedules a label refresh at the next relative-time boundary', async () => {
  const timestamps = await import('./postTimestamp.mjs')
  getPostTimestampRefreshDelay = timestamps.getPostTimestampRefreshDelay

  const createdAt = Date.parse('2026-11-11T11:00:00.000Z')
  const now = Date.parse('2026-11-11T11:30:00.000Z')
  assert.equal(getPostTimestampRefreshDelay(createdAt, now), 60 * 1000 + 50)
  assert.equal(getPostTimestampRefreshDelay('invalid', now), null)
})
