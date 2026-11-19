const USER_INTEREST_CATEGORIES = [
  'Beaches and Coastal Destinations',
  'Historical and Cultural Sites',
  'Food and Local Cuisine',
  'Festivals and Events',
  'Nature and Adventure',
  'Religious Tourism',
  'Arts and Crafts',
  'Local Businesses',
  'Community Activities',
  'Travel and Photography',
]

const LEGACY_INTEREST_ALIASES = {
  'Beaches and Coastal Destinations': ['beach', 'beaches', 'coast', 'coastal'],
  'Historical and Cultural Sites': ['history', 'historical', 'historic', 'culture', 'cultural', 'heritage'],
  'Food and Local Cuisine': ['food', 'cuisine', 'restaurant', 'restaurants'],
  'Festivals and Events': ['event', 'events', 'festival', 'festivals'],
  'Nature and Adventure': ['nature', 'adventure', 'outdoor', 'outdoors'],
  'Religious Tourism': ['religion', 'religious', 'faith'],
  'Arts and Crafts': ['art', 'arts', 'craft', 'crafts'],
  'Local Businesses': ['business', 'businesses', 'local business', 'local businesses', 'shopping'],
  'Community Activities': ['community', 'activity', 'activities', 'forum'],
  'Travel and Photography': ['travel', 'photography'],
}

const INTEREST_RECOMMENDATION_TERMS = {
  'Beaches and Coastal Destinations': ['beach', 'beaches', 'coast', 'coastal', 'shoreline', 'seaside', 'surf', 'travel guides'],
  'Historical and Cultural Sites': ['history', 'historical', 'historic', 'culture', 'cultural', 'heritage', 'cultural insights'],
  'Food and Local Cuisine': ['food', 'cuisine', 'restaurant', 'restaurants', 'dining', 'seafood', 'culinary'],
  'Festivals and Events': ['festival', 'festivals', 'event', 'events'],
  'Nature and Adventure': ['nature', 'adventure', 'outdoor', 'travel guides'],
  'Religious Tourism': ['religion', 'religious', 'faith', 'church', 'chapel', 'shrine'],
  'Arts and Crafts': ['art', 'arts', 'craft', 'crafts', 'artisan', 'handmade', 'cultural insights'],
  'Local Businesses': ['business', 'businesses', 'local', 'restaurant', 'shopping', 'shop', 'store', 'market'],
  'Community Activities': ['community', 'activity', 'activities', 'forum'],
  'Travel and Photography': ['travel', 'photography', 'travel guides'],
}

function normalizeUserInterests(interests) {
  if (!Array.isArray(interests)) return []

  const normalized = new Set()
  interests.forEach((value) => {
    if (typeof value !== 'string') return
    const candidate = value.trim().toLowerCase()
    const category = USER_INTEREST_CATEGORIES.find((item) => (
      item.toLowerCase() === candidate
      || LEGACY_INTEREST_ALIASES[item].includes(candidate)
    ))
    if (category) normalized.add(category)
  })

  return USER_INTEREST_CATEGORIES.filter((category) => normalized.has(category))
}

function hasValidInterestInput(interests) {
  return Array.isArray(interests)
    && interests.every((value) => typeof value === 'string' && USER_INTEREST_CATEGORIES.includes(value.trim()))
}

function getInterestRecommendationTerms(interests) {
  const terms = new Set()
  normalizeUserInterests(interests).forEach((interest) => {
    INTEREST_RECOMMENDATION_TERMS[interest].forEach((term) => terms.add(term))
  })
  return [...terms]
}

function getInterestMatchScore(values, interests) {
  const candidates = (Array.isArray(values) ? values : [values])
    .filter((value) => typeof value === 'string')
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean)

  return normalizeUserInterests(interests).reduce((score, interest) => {
    const matches = INTEREST_RECOMMENDATION_TERMS[interest].some((term) => {
      const normalizedTerm = term.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      return candidates.some((candidate) => (
        candidate === normalizedTerm
        || ` ${candidate} `.includes(` ${normalizedTerm} `)
      ))
    })
    return score + (matches ? 1 : 0)
  }, 0)
}

function getStoryRecommendationCategories(interests) {
  const categories = new Set()
  normalizeUserInterests(interests).forEach((interest) => {
    if (interest === 'Beaches and Coastal Destinations' || interest === 'Nature and Adventure' || interest === 'Travel and Photography') {
      categories.add('travel_guides')
    }
    if (interest === 'Historical and Cultural Sites' || interest === 'Arts and Crafts') {
      categories.add('cultural_insights')
    }
    if (interest === 'Historical and Cultural Sites') categories.add('history')
    if (interest === 'Food and Local Cuisine' || interest === 'Local Businesses') categories.add('food')
    if (interest === 'Festivals and Events') categories.add('events')
  })
  return [...categories]
}

module.exports = {
  USER_INTEREST_CATEGORIES,
  normalizeUserInterests,
  hasValidInterestInput,
  getInterestRecommendationTerms,
  getInterestMatchScore,
  getStoryRecommendationCategories,
}
