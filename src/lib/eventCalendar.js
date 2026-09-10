function normalizeCalendarDate(date) {
  if (!date) return null

  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
    if (/^\d{4}-\d{2}-\d{2}T/.test(date)) return date.split('T')[0]

    const parsed = new Date(date)
    if (Number.isNaN(parsed.getTime())) return null

    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const day = String(parsed.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (date instanceof Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return null
}

function addCalendarDays(dateLike, days) {
  const normalized = normalizeCalendarDate(dateLike)
  if (!normalized) return null

  const [year, month, day] = normalized.split('-').map(Number)
  const base = new Date(year, month - 1, day)
  base.setDate(base.getDate() + Number(days || 0))

  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function calendarDaysBetween(startLike, endLike) {
  const start = normalizeCalendarDate(startLike)
  const end = normalizeCalendarDate(endLike)
  if (!start || !end) return 0

  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0

  const diffMs = endDate.getTime() - startDate.getTime()
  return Math.max(0, Math.round(diffMs / 86400000))
}

function convertExclusiveCalendarEndToInclusive(dateString) {
  const normalized = normalizeCalendarDate(dateString)
  if (!normalized) return null

  const [year, month, day] = normalized.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  parsed.setDate(parsed.getDate() - 1)

  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

module.exports = {
  normalizeCalendarDate,
  addCalendarDays,
  calendarDaysBetween,
  convertExclusiveCalendarEndToInclusive,
}
