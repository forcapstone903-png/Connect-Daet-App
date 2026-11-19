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
  return clamp100((intersection / new Set([...a, ...b]).size) * 100)
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
  return interests * 0.30 + mutual * 0.25 + activity * 0.25 + popularity * 0.20
}

export function scoreStory({ interest = 0, engagement = 0, recency = 0, popularity = 0 }) {
  return interest * 0.35 + engagement * 0.25 + recency * 0.25 + popularity * 0.15
}

export function scorePlace({ interest = 0, distance = 50, rating = 0, popularity = 0 }) {
  return interest * 0.30 + distance * 0.30 + rating * 0.20 + popularity * 0.20
}

export function scoreEvent({ interest = 0, proximity = 50, upcoming = 0, popularity = 0 }) {
  return interest * 0.30 + proximity * 0.25 + upcoming * 0.30 + popularity * 0.15
}
