const test = require('node:test')
const assert = require('node:assert/strict')
const { convertExclusiveCalendarEndToInclusive, normalizeCalendarDate, addCalendarDays, calendarDaysBetween } = require('./eventCalendar')

test('exclusive calendar end dates normalize to an inclusive stored event end date', () => {
  assert.equal(convertExclusiveCalendarEndToInclusive('2026-09-12'), '2026-09-11')
})

test('calendar date strings and Date objects normalize to YYYY-MM-DD', () => {
  assert.equal(normalizeCalendarDate('2026-09-10T09:30:00'), '2026-09-10')
  assert.equal(normalizeCalendarDate(new Date('2026-09-10T09:30:00')), '2026-09-10')
})

test('event duration helpers preserve range when the incoming FullCalendar end is missing', () => {
  assert.equal(addCalendarDays('2026-09-10', 2), '2026-09-12')
  assert.equal(calendarDaysBetween('2026-09-10', '2026-09-12'), 2)
})
