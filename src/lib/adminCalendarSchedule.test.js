const test = require('node:test')
const assert = require('node:assert/strict')
const { toCalendarSchedule, fromCalendarSchedule } = require('./eventCalendar')

test('all-day ranges retain the inclusive database end on round trip', () => {
  const schedule = toCalendarSchedule({ start: '2026-09-18', end: '2026-09-20' })
  assert.deepEqual(schedule, { start: '2026-09-18', end: '2026-09-21', allDay: true })
  assert.deepEqual(fromCalendarSchedule(schedule.start, schedule.end, true), {
    start_date: '2026-09-18', end_date: '2026-09-20', start_time: '', end_time: '',
  })
})

test('timed events span their actual hours, not an additional all-day date', () => {
  assert.deepEqual(toCalendarSchedule({
    start_date: '2026-09-18', end_date: '2026-09-18', start_time: '09:30:00', end_time: '11:00:00',
  }), { start: '2026-09-18T09:30:00', end: '2026-09-18T11:00:00', allDay: false })
})

test('overnight events carry their end into the next date, including year boundaries', () => {
  assert.equal(toCalendarSchedule({ start: '2026-12-31', start_time: '23:00', end_time: '01:00' }).end, '2027-01-01T01:00')
})

test('multi-day timed events retain their specified final date', () => {
  assert.equal(toCalendarSchedule({ start: '2026-09-18', end: '2026-09-20', start_time: '09:00', end_time: '17:00' }).end, '2026-09-20T17:00')
})

test('missing end times leave duration to FullCalendar rather than inventing a saved end', () => {
  assert.deepEqual(toCalendarSchedule({ start: '2026-09-18', start_time: '09:00' }), {
    start: '2026-09-18T09:00', end: undefined, allDay: false,
  })
})

test('weekly selections and drag/resize preserve wall-clock times and midnight endpoints', () => {
  assert.deepEqual(fromCalendarSchedule('2026-09-18T22:30:00+08:00', '2026-09-19T00:00:00+08:00', false), {
    start_date: '2026-09-18', end_date: '2026-09-19', start_time: '22:30:00', end_time: '00:00:00',
  })
})

test('empty and single-day selections remain valid form defaults', () => {
  assert.deepEqual(fromCalendarSchedule(), { start_date: '', end_date: '', start_time: '', end_time: '' })
  assert.equal(fromCalendarSchedule('2026-09-18', null, true).end_date, '2026-09-18')
  assert.equal(fromCalendarSchedule('2026-09-18', '2026-09-19', true).end_date, '2026-09-18')
})
