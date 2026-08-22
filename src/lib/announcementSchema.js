function getAnnouncementTypeColumn() {
  return 'announcement_type'
}

function normalizeAnnouncementRecord(record = {}) {
  const announcementType = record.announcement_type ?? record.type ?? 'info'

  return {
    ...record,
    announcement_type: announcementType,
    type: announcementType,
  }
}

module.exports = {
  getAnnouncementTypeColumn,
  normalizeAnnouncementRecord,
}
