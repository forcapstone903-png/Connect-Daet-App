const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

function getTimestamp(value) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function formatPostDate(value, now = Date.now()) {
  const timestamp = getTimestamp(value)
  if (timestamp === null) return 'Recently'

  const date = new Date(timestamp)
  const options = { month: 'short', day: 'numeric' }
  if (date.getFullYear() !== new Date(now).getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString('en-US', options)
}

export function formatPostTimestamp(value, now = Date.now()) {
  const timestamp = getTimestamp(value)
  if (timestamp === null) return 'Recently'

  const age = Math.max(0, now - timestamp)
  if (age < MINUTE_MS) return 'Just now'
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)}m ago`
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)}h ago`

  const days = Math.floor(age / DAY_MS)
  if (days < 7) {
    const unit = days === 1 ? 'day' : 'days'
    return `${formatPostDate(value, now)} · ${days} ${unit} ago`
  }
  return formatPostDate(value, now)
}

export function getPostTimestampRefreshDelay(value, now = Date.now()) {
  const timestamp = getTimestamp(value)
  if (timestamp === null) return null

  const age = Math.max(0, now - timestamp)
  if (age >= WEEK_MS) return null

  let nextBoundary
  if (age < MINUTE_MS) {
    nextBoundary = timestamp + MINUTE_MS
    if (timestamp > now) nextBoundary = Math.min(nextBoundary, now + MINUTE_MS)
  } else if (age < HOUR_MS) {
    nextBoundary = timestamp + (Math.floor(age / MINUTE_MS) + 1) * MINUTE_MS
  } else if (age < DAY_MS) {
    nextBoundary = timestamp + (Math.floor(age / HOUR_MS) + 1) * HOUR_MS
  } else {
    nextBoundary = timestamp + (Math.floor(age / DAY_MS) + 1) * DAY_MS
  }

  return Math.max(1000, nextBoundary - now + 50)
}
