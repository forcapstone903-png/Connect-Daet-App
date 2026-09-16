function isValidUuid(value) {
  if (value == null) return false
  if (typeof value !== 'string') return false

  const normalized = value.trim()
  if (!normalized) return false

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
}

function filterValidUuidValues(values = []) {
  if (!Array.isArray(values)) return []

  const seen = new Set()
  const next = []

  for (const value of values) {
    if (!isValidUuid(value)) continue
    if (seen.has(value)) continue
    seen.add(value)
    next.push(value)
  }

  return next
}

module.exports = {
  isValidUuid,
  filterValidUuidValues,
}
