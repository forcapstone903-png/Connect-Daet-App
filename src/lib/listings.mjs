// Shared rules for the place directory: attractions, accommodations,
// restaurants and local businesses. All four live in info_tourist_spots and
// are told apart by listing_type, so reviews, favourites, view analytics and
// comments (all keyed to the spot id) work for every listing type.
//
// Used by the admin API (validation), the admin page (form options) and the
// public directory (labels and filters).

// label: one item · plural: staff-facing list name · publicLabel: visitor tab
export const LISTING_TYPES = Object.freeze([
  { value: 'attraction', label: 'Attraction', plural: 'Attractions', publicLabel: 'See & Do' },
  { value: 'accommodation', label: 'Accommodation', plural: 'Accommodations', publicLabel: 'Stay' },
  { value: 'restaurant', label: 'Restaurant', plural: 'Restaurants', publicLabel: 'Eat & Drink' },
  { value: 'business', label: 'Local Business', plural: 'Local Businesses', publicLabel: 'Shops & Services' },
])

export const LISTING_TYPE_VALUES = Object.freeze(LISTING_TYPES.map((type) => type.value))

// Version segment of the public directory's browser cache key
// (getCacheKey('places', 'public', 'all', LISTINGS_CACHE_VERSION)). Bump it
// whenever the row shape changes so stale cached lists are ignored. The admin
// page invalidates this key after every successful write.
export const LISTINGS_CACHE_VERSION = 'daet-directory-v2'

// Suggested categories per type. Staff can still type a custom category.
export const DEFAULT_CATEGORIES = Object.freeze({
  attraction: ['beach', 'historical', 'nature', 'cultural', 'religious', 'park', 'market'],
  accommodation: ['hotel', 'resort', 'inn', 'homestay', 'hostel'],
  restaurant: ['filipino', 'seafood', 'cafe', 'fast food', 'bakery', 'bar'],
  business: ['souvenir', 'pasalubong', 'surf school', 'tour operator', 'transport', 'services'],
})

// The 25 barangays of Daet, Camarines Norte. Used for the location filter.
export const DAET_BARANGAYS = Object.freeze([
  'Alawihao', 'Awitan', 'Bagasbas', 'Barangay I (Poblacion)', 'Barangay II (Poblacion)',
  'Barangay III (Poblacion)', 'Barangay IV (Poblacion)', 'Barangay V (Poblacion)',
  'Barangay VI (Poblacion)', 'Barangay VII (Poblacion)', 'Barangay VIII (Poblacion)',
  'Bibirao', 'Borabod', 'Calasgasan', 'Camambugan', 'Cobangbang', 'Dogongan', 'Gahonon',
  'Gubat', 'Lag-on', 'Magang', 'Mambalite', 'Mancruz', 'Pamorangon', 'San Isidro',
])

export const PRICE_RANGES = Object.freeze(['₱', '₱₱', '₱₱₱', '₱₱₱₱'])

// 'inactive' is shown to staff as "Archived" (hidden from the public).
export const LISTING_STATUSES = Object.freeze(['active', 'inactive', 'maintenance', 'closed'])

export function getListingTypeLabel(type, { plural = false } = {}) {
  const match = LISTING_TYPES.find((item) => item.value === type) || LISTING_TYPES[0]
  return plural ? match.plural : match.label
}

const trimText = (value, max) => String(value ?? '').trim().slice(0, max)

function optionalNumber(value, { min = -Infinity, max = Infinity } = {}) {
  if (value === '' || value === null || value === undefined) return { value: null }
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) return { error: true }
  return { value: number }
}

function optionalUrl(value) {
  const text = trimText(value, 500)
  if (!text) return { value: null }
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (!['http:', 'https:'].includes(url.protocol)) return { error: true }
    return { value: url.toString() }
  } catch {
    return { error: true }
  }
}

function normalizeTags(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  const seen = new Set()
  for (const tag of raw) {
    const clean = String(tag).trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, ' ').slice(0, 30)
    if (clean) seen.add(clean)
    if (seen.size >= 15) break
  }
  return [...seen]
}

function normalizeImageList(value) {
  if (!Array.isArray(value)) return []
  return value.map((url) => String(url || '').trim()).filter((url) => /^https?:\/\//i.test(url)).slice(0, 20)
}

/**
 * Validate and normalise a listing from the admin form.
 * Returns { data } ready for info_tourist_spots, or { error } with a message.
 * Rating and review counts are never accepted: they are computed from reviews.
 */
export function normalizeListingInput(body = {}) {
  const name = trimText(body.name, 150)
  const location = trimText(body.location, 250)
  const category = trimText(body.category, 50).toLowerCase()
  const listingType = LISTING_TYPE_VALUES.includes(body.listing_type) ? body.listing_type : 'attraction'
  const status = LISTING_STATUSES.includes(body.status) ? body.status : 'active'

  if (!name) return { error: 'Name is required.' }
  if (!location) return { error: 'Address / area is required.' }
  if (!category) return { error: 'Category is required.' }

  const latitude = optionalNumber(body.latitude, { min: -90, max: 90 })
  const longitude = optionalNumber(body.longitude, { min: -180, max: 180 })
  if (latitude.error || longitude.error) return { error: 'Latitude must be -90 to 90 and longitude -180 to 180.' }
  if ((latitude.value === null) !== (longitude.value === null)) return { error: 'Enter both latitude and longitude, or neither.' }

  const fee = optionalNumber(body.entrance_fee ?? body.entry_fee, { min: 0, max: 1_000_000 })
  if (fee.error) return { error: 'Entrance fee must be zero or a positive amount.' }

  const email = trimText(body.email, 254).toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Email address is not valid.' }

  const website = optionalUrl(body.website)
  const facebook = optionalUrl(body.facebook_url)
  if (website.error) return { error: 'Website must be a valid http(s) link.' }
  if (facebook.error) return { error: 'Facebook page must be a valid http(s) link.' }

  const priceRange = PRICE_RANGES.includes(body.price_range) ? body.price_range : null
  const imageUrl = trimText(body.image_url, 1000) || null
  const gallery = normalizeImageList(body.gallery_images)

  return {
    data: {
      name,
      listing_type: listingType,
      description: trimText(body.description, 10000),
      location,
      barangay: trimText(body.barangay, 60) || null,
      latitude: latitude.value,
      longitude: longitude.value,
      category,
      tags: normalizeTags(body.tags),
      opening_hours: trimText(body.opening_hours, 200),
      entry_fee: fee.value,
      price_range: priceRange,
      contact_number: trimText(body.contact_number, 60),
      email: email || null,
      website: website.value,
      facebook_url: facebook.value,
      image_url: imageUrl,
      featured_image: imageUrl,
      gallery_images: gallery.length ? gallery : null,
      status,
      featured: Boolean(body.featured),
    },
  }
}

// Bulk actions from the admin list. Each maps to a column update.
export const BULK_ACTIONS = Object.freeze({
  feature: { featured: true },
  unfeature: { featured: false },
  archive: { status: 'inactive' },
  restore: { status: 'active' },
})

/** Shape a DB row for API responses (keeps older field names the UI uses). */
export function formatListingRow(row, viewCount = 0) {
  return {
    ...row,
    listing_type: row.listing_type || 'attraction',
    tags: row.tags || [],
    image_url: row.image_url || row.featured_image || null,
    gallery_images: row.gallery_images?.length ? row.gallery_images : row.images || [],
    entrance_fee: row.entrance_fee ?? row.entry_fee ?? null,
    view_count: viewCount,
    featured: Boolean(row.featured),
    rating: Number(row.rating) || 0,
  }
}
