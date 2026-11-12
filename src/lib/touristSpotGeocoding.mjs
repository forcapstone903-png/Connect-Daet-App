export const TOURIST_SPOT_GEOCODE_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000

export function buildTouristSpotGeocodeQuery(location, barangay = '') {
  return [
    String(location || '').trim(),
    String(barangay || '').trim(),
    'Daet',
    'Camarines Norte',
    'Philippines',
  ].filter(Boolean).join(', ')
}

export function touristSpotGeocodeCacheKey(location, barangay = '') {
  const normalizedQuery = buildTouristSpotGeocodeQuery(location, barangay)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  return `tourist-spot-geocode:public:v1:${encodeURIComponent(normalizedQuery)}`
}

export function normalizeCoordinates(value) {
  const rawLatitude = value?.latitude
  const rawLongitude = value?.longitude
  if (rawLatitude === null || rawLatitude === undefined || String(rawLatitude).trim() === '') return null
  if (rawLongitude === null || rawLongitude === undefined || String(rawLongitude).trim() === '') return null

  const latitude = Number(rawLatitude)
  const longitude = Number(rawLongitude)

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

export function parseNominatimCoordinates(results) {
  const firstResult = Array.isArray(results) ? results[0] : null
  if (!firstResult) return null

  return normalizeCoordinates({
    latitude: firstResult.lat,
    longitude: firstResult.lon,
  })
}
