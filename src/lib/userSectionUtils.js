function getRequiredSelectionCount(availableCount) {
  const safeTotal = Number.isFinite(availableCount) ? Math.max(0, availableCount) : 0
  return Math.min(3, safeTotal)
}

function matchesMessageSearch(message, query) {
  if (!message) return false
  const searchText = `${message.title || ''} ${message.body || ''}`.toLowerCase()
  return searchText.includes((query || '').trim().toLowerCase())
}

function splitLocation(locationValue = '') {
  const raw = String(locationValue || '').trim()
  if (!raw) {
    return { city: '', country: '', location: '' }
  }

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
  const city = parts[0] || ''
  const country = parts.slice(1).join(', ')

  return {
    city,
    country,
    location: raw,
  }
}

module.exports = {
  getRequiredSelectionCount,
  matchesMessageSearch,
  splitLocation,
}
