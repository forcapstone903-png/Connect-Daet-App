export function clamp100(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.min(100, Math.max(0, number))
}

export function normalizedOverlap(left = [], right = []) {
  const a = new Set(left.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))
  const b = new Set(right.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const value of a) if (b.has(value)) intersection += 1
  return clamp100((intersection / a.size) * 100)
}

export function haversineDistanceKm(origin, destination) {
  if (!origin?.latitude || !origin?.longitude || !destination?.latitude || !destination?.longitude) return null
  const lat1 = Number(origin.latitude)
  const lon1 = Number(origin.longitude)
  const lat2 = Number(destination.latitude)
  const lon2 = Number(destination.longitude)
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null
  const radians = (value) => value * Math.PI / 180
  const dLat = radians(lat2 - lat1)
  const dLon = radians(lon2 - lon1)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function normalizeDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return 50
  return clamp100(100 - (distanceKm / 100) * 100)
}

export function normalizeRecency(timestamp, now = Date.now(), halfLifeDays = 30) {
  const time = new Date(timestamp || 0).getTime()
  if (!Number.isFinite(time) || time <= 0) return 0
  const ageDays = Math.max(0, (now - time) / 86400000)
  return clamp100(100 * Math.exp(-ageDays / halfLifeDays))
}

export function normalizePopularity(value, maxValue) {
  const amount = Number(value) || 0
  const maximum = Number(maxValue) || 0
  if (maximum <= 0) return 0
  return clamp100((amount / maximum) * 100)
}

export function scorePeople({ interests = 0, mutual = 0, activity = 0, popularity = 0 }) {
  return interests * 0.55 + mutual * 0.20 + activity * 0.15 + popularity * 0.10
}

export function scoreStory({ interest = 0, engagement = 0, recency = 0, popularity = 0, interaction = 0 }) {
  return interest * 0.60 + engagement * 0.13 + recency * 0.15 + popularity * 0.05 + interaction * 0.07
}

export function scorePlace({ interest = 0, distance = 50, rating = 0, popularity = 0, interaction = 0 }) {
  return interest * 0.55 + distance * 0.15 + rating * 0.12 + popularity * 0.08 + interaction * 0.10
}

export function scoreEvent({ interest = 0, proximity = 50, upcoming = 0, popularity = 0 }) {
  return interest * 0.55 + proximity * 0.15 + upcoming * 0.20 + popularity * 0.10
}
