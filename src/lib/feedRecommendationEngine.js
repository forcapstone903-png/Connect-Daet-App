const FEED_RECOMMENDATION_DEFAULTS = {
  weights: {
    interest: 1.15,
    interaction: 1.05,
    authorAffinity: 0.8,
    contentTypeAffinity: 0.65,
    freshness: 0.72,
    popularity: 0.25,
    relationship: 0.35,
    exploration: 0.18,
    diversity: 0.35,
  },
  eventWeights: {
    impression: 0.12,
    view: 0.2,
    open: 0.4,
    like: 1.1,
    reaction: 1.1,
    comment: 1.5,
    save: 1.6,
    repost: 1.9,
    share: 1.2,
    profile_view: 0.7,
    follow: 1.8,
    skip: -0.45,
    not_interested: -1.1,
  },
  socialBoosts: {
    followedAuthor: 0.7,
    repeatedCategoryPenalty: 0.45,
    repeatedAuthorPenalty: 0.7,
  },
  diversification: {
    maxSameCategoryStreak: 2,
    maxSameAuthorStreak: 1,
    maxSameDestinationStreak: 2,
  },
  coldStart: {
    localTourismBoost: 0.3,
    freshnessBase: 2.2,
    diversityBase: 0.4,
  },
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function getItemIdentity(item) {
  if (item?.repost_id) return `feed-item:${item.repost_id}`
  if (item?.id) return `feed-item:${item.id}`
  return `feed-item:${Math.random().toString(36).slice(2, 10)}`
}

function normalizeProfile(profile = {}) {
  return {
    contentTypes: profile.contentTypes || {},
    categories: profile.categories || {},
    authors: profile.authors || {},
    destinations: profile.destinations || {},
    topics: profile.topics || {},
    interactions: profile.interactions || {},
    lastSeen: profile.lastSeen || {},
  }
}

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeCategory(category) {
  return normalizeKey(category || '').replace(/[_-]+/g, ' ')
}

function getCategoryBoost(category, profile) {
  const key = normalizeCategory(category)
  return safeNumber(profile.categories?.[key] || profile.topics?.[key] || 0, 0)
}

function getContentTypeBoost(type, profile) {
  const key = normalizeKey(type)
  return safeNumber(profile.contentTypes?.[key] || 0, 0)
}

function getAuthorBoost(authorId, profile) {
  const key = normalizeKey(authorId)
  return safeNumber(profile.authors?.[key] || 0, 0)
}

function getDestinationBoost(destination, profile) {
  const key = normalizeCategory(destination)
  return safeNumber(profile.destinations?.[key] || 0, 0)
}

function getFreshnessScore(item, now) {
  const timestamp = new Date(item?.published_at || item?.created_at || item?.start_date || item?.last_activity_at || 0).getTime()
  if (!Number.isFinite(timestamp)) return 0.2
  const ageHours = Math.max(1, (now - timestamp) / 3_600_000)
  const decay = 1 / (1 + Math.log(ageHours + 1))
  return clamp(decay, 0, 1)
}

function getPopularityScore(item) {
  const reactions = safeNumber(item?.likes, 0) + safeNumber(item?.reaction_count, 0)
  const comments = safeNumber(item?.comments_count, 0) + safeNumber(item?.reply_count, 0)
  const views = safeNumber(item?.views, 0)
  return clamp((reactions * 0.2 + comments * 0.3 + views * 0.05) / 25, 0, 1)
}

function computeDiversificationPenalty(item, previousItems = []) {
  const categoryKey = normalizeCategory(item?.category)
  const authorKey = normalizeKey(item?.created_by || item?.author?.id)
  const destinationKey = normalizeCategory(item?.location || item?.destination || item?.city)

  let penalty = 0

  const recentCategories = previousItems.slice(0, 3).map((entry) => normalizeCategory(entry?.category))
  const recentAuthors = previousItems.slice(0, 2).map((entry) => normalizeKey(entry?.created_by || entry?.author?.id))
  const recentDestinations = previousItems.slice(0, 3).map((entry) => normalizeCategory(entry?.location || entry?.destination || entry?.city))

  if (categoryKey && recentCategories.length > 0) {
    if (recentCategories.filter((entry) => entry === categoryKey).length >= 1) {
      penalty += 0.9
    } else {
      penalty -= 0.35
    }
  }

  if (authorKey && recentAuthors.length > 0) {
    if (recentAuthors.filter((entry) => entry === authorKey).length >= 1) {
      penalty += 0.8
    } else {
      penalty -= 0.25
    }
  }

  if (destinationKey && recentDestinations.length > 0) {
    if (recentDestinations.filter((entry) => entry === destinationKey).length >= 1) {
      penalty += 0.55
    } else {
      penalty -= 0.2
    }
  }

  return penalty
}

function buildInteractionScore(item, profile) {
  const history = profile.interactions || {}
  const base = Object.entries(history).reduce((total, [key, value]) => {
    const normalizedKey = normalizeKey(key)
    const itemKey = normalizeKey(item?.type || item?.content_type)
    const categoryKey = normalizeCategory(item?.category)
    const itemDestination = normalizeCategory(item?.location || item?.destination)
    const itemTopic = normalizeCategory(item?.topic || item?.category)

    if (normalizedKey === itemKey) return total + safeNumber(value, 0) * 0.6
    if (normalizedKey === categoryKey || normalizedKey === itemTopic) return total + safeNumber(value, 0) * 0.9
    if (normalizedKey === itemDestination) return total + safeNumber(value, 0) * 0.8
    return total
  }, 0)

  return clamp(base, 0, 2.5)
}

function scoreItem(item, profile, context = {}) {
  const {
    index = 0,
    previousItems = [],
    now = Date.now(),
    userFollows = new Set(),
    coldStart = false,
  } = context

  const typeBoost = getContentTypeBoost(item?.type, profile)
  const categoryBoost = getCategoryBoost(item?.category, profile)
  const authorBoost = getAuthorBoost(item?.created_by || item?.author?.id, profile)
  const destinationBoost = getDestinationBoost(item?.location || item?.destination, profile)
  const interactionBoost = buildInteractionScore(item, profile)
  const freshnessScore = getFreshnessScore(item, now)
  const popularityScore = getPopularityScore(item)
  const relationshipBoost = userFollows && (userFollows.has(item?.created_by) || userFollows.has(item?.author?.id) || userFollows.has(item?.user_id)) ? 1 : 0
  const explorationScore = coldStart ? 0.25 : 0.15
  const diversityPenalty = computeDiversificationPenalty(item, previousItems)

  const confidenceBoost = item?.is_repost ? 0.18 : 0
  const recommendationScore = (
    typeBoost * FEED_RECOMMENDATION_DEFAULTS.weights.contentTypeAffinity +
    categoryBoost * FEED_RECOMMENDATION_DEFAULTS.weights.interest +
    authorBoost * FEED_RECOMMENDATION_DEFAULTS.weights.authorAffinity +
    destinationBoost * FEED_RECOMMENDATION_DEFAULTS.weights.interest +
    interactionBoost * FEED_RECOMMENDATION_DEFAULTS.weights.interaction +
    freshnessScore * FEED_RECOMMENDATION_DEFAULTS.weights.freshness +
    popularityScore * FEED_RECOMMENDATION_DEFAULTS.weights.popularity +
    relationshipBoost * FEED_RECOMMENDATION_DEFAULTS.weights.relationship +
    explorationScore * FEED_RECOMMENDATION_DEFAULTS.weights.exploration +
    confidenceBoost -
    diversityPenalty * FEED_RECOMMENDATION_DEFAULTS.weights.diversity
  )

  return {
    ...item,
    recommendationScore,
    recommendationKey: getItemIdentity(item),
    contributionBreakdown: {
      interest: typeBoost * FEED_RECOMMENDATION_DEFAULTS.weights.contentTypeAffinity + categoryBoost * FEED_RECOMMENDATION_DEFAULTS.weights.interest + destinationBoost * FEED_RECOMMENDATION_DEFAULTS.weights.interest,
      interaction: interactionBoost * FEED_RECOMMENDATION_DEFAULTS.weights.interaction,
      authorAffinity: authorBoost * FEED_RECOMMENDATION_DEFAULTS.weights.authorAffinity,
      freshness: freshnessScore * FEED_RECOMMENDATION_DEFAULTS.weights.freshness,
      popularity: popularityScore * FEED_RECOMMENDATION_DEFAULTS.weights.popularity,
      relationship: relationshipBoost * FEED_RECOMMENDATION_DEFAULTS.weights.relationship,
      exploration: explorationScore * FEED_RECOMMENDATION_DEFAULTS.weights.exploration,
      diversity: -diversityPenalty * FEED_RECOMMENDATION_DEFAULTS.weights.diversity,
    },
    index,
  }
}

function createColdStartProfile({ userId } = {}) {
  const seed = {
    contentTypes: {
      blog: 0.24,
      forum: 0.18,
      event: 0.28,
      tourist_spot: 0.42,
      announcement: 0.14,
      post: 0.2,
    },
    categories: {
      beach: 0.32,
      events: 0.26,
      food: 0.22,
      travel: 0.24,
      local: 0.2,
      nature: 0.18,
    },
    authors: {},
    destinations: {
      beach: 0.26,
      tourism: 0.18,
      local: 0.14,
    },
    topics: {
      beach: 0.32,
      events: 0.26,
      food: 0.22,
      travel: 0.24,
    },
    interactions: {},
    lastSeen: {},
    userId,
  }

  return seed
}

function buildRecommendationProfile({ activities = [], reactions = [], favorites = [], preferredCategories = [], follows = [], profile = {} } = {}) {
  const nextProfile = normalizeProfile(profile || createColdStartProfile())

  const addNumeric = (map, key, value) => {
    const normalized = normalizeKey(key)
    if (!normalized) return
    map[normalized] = safeNumber(map[normalized], 0) + safeNumber(value, 0)
  }

  preferredCategories.forEach((category) => addNumeric(nextProfile.categories, category, 0.28))
  follows.forEach((userId) => addNumeric(nextProfile.authors, userId, 0.22))

  activities.forEach((activity) => {
    const entityType = activity?.entity_type || ''
    const meta = activity?.metadata || {}
    const category = meta?.category || meta?.topic || meta?.destination || activity?.entity_type || ''
    addNumeric(nextProfile.contentTypes, entityType, 0.06)
    addNumeric(nextProfile.categories, category, 0.12)
    addNumeric(nextProfile.interactions, entityType, 0.08)
    if (meta?.category || meta?.topic || meta?.destination) {
      addNumeric(nextProfile.topics, meta.category || meta.topic || meta.destination, 0.08)
    }
  })

  reactions.forEach((reaction) => {
    const contentType = reaction?.content_type || ''
    const itemType = contentType === 'forum_thread' ? 'forum' : contentType
    addNumeric(nextProfile.contentTypes, itemType, 0.26)
    addNumeric(nextProfile.interactions, itemType, 0.26)
  })

  favorites.forEach((favorite) => {
    const itemType = favorite?.item_type || ''
    addNumeric(nextProfile.contentTypes, itemType, 0.24)
    addNumeric(nextProfile.interactions, itemType, 0.18)
  })

  return nextProfile
}

function rankFeedItems({ items = [], profile, userFollows = new Set(), now = Date.now(), coldStart = false }) {
  const normalizedProfile = normalizeProfile(profile || createColdStartProfile())
  const ranked = items
    .map((item, index) => scoreItem(item, normalizedProfile, {
      index,
      previousItems: items.slice(0, index),
      now,
      userFollows,
      coldStart: Boolean(coldStart || !Object.keys(normalizedProfile.categories || {}).length),
    }))
    .sort((left, right) => {
      if (right.recommendationScore !== left.recommendationScore) {
        return right.recommendationScore - left.recommendationScore
      }
      return left.index - right.index
    })

  return ranked
}

module.exports = {
  FEED_RECOMMENDATION_DEFAULTS,
  normalizeKey,
  createColdStartProfile,
  buildRecommendationProfile,
  rankFeedItems,
  scoreItem,
  getFreshnessScore,
  getPopularityScore,
}
