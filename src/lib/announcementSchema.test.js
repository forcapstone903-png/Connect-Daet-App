const test = require('node:test')
const assert = require('node:assert/strict')
const { getAnnouncementTypeColumn, normalizeAnnouncementRecord } = require('./announcementSchema')

test('announcement table exposes announcement_type instead of the legacy type field', () => {
  assert.equal(getAnnouncementTypeColumn(), 'announcement_type')
})

test('announcement records normalize to a type property for legacy UI usage', () => {
  const record = normalizeAnnouncementRecord({ id: '1', title: 'Weather notice', announcement_type: 'important' })

  assert.equal(record.announcement_type, 'important')
  assert.equal(record.type, 'important')
})
