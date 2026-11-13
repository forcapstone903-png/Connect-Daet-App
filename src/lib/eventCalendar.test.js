const test = require('node:test')
const assert = require('node:assert/strict')
const { eventCoversCalendarDate } = require('./eventCalendar.js')

test('matches every inclusive day in an event date range', () => {
  assert.equal(eventCoversCalendarDate('2026-11-13', '2026-11-15', '2026-11-13'), true)
  assert.equal(eventCoversCalendarDate('2026-11-13', '2026-11-15', '2026-11-14'), true)
  assert.equal(eventCoversCalendarDate('2026-11-13', '2026-11-15', '2026-11-15'), true)
  assert.equal(eventCoversCalendarDate('2026-11-13', '2026-11-15', '2026-11-16'), false)
})

test('treats a missing end date as a single day and rejects invalid ranges', () => {
  assert.equal(eventCoversCalendarDate('2026-11-13', null, '2026-11-13'), true)
  assert.equal(eventCoversCalendarDate('not-a-date', null, '2026-11-13'), false)
  assert.equal(eventCoversCalendarDate('2026-11-15', '2026-11-13', '2026-11-14'), false)
})

