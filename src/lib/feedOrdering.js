function getFeedItemKey(item = {}) {
  const type = item.type === 'user_post' ? 'post' : (item.type || 'post')
  const id = item.id ?? item.repost_id ?? item.original_post_id
  if (!id) return null
  return `${type}-${id}`
}

function prioritizePinnedFeedItems(items = [], savedItems = new Set(), newRepostIds = new Set()) {
  if (!Array.isArray(items)) return []

  const pinnedItems = []
  const remainingItems = []

  items.forEach((item) => {
    const key = getFeedItemKey(item)
    const isSaved = key ? savedItems.has(key) : false
    const isNewRepost = Boolean(item?.is_repost) && Boolean(item?.repost_id || item?.id) && newRepostIds.has(item.repost_id || item.id)

    if (isSaved || isNewRepost) {
      pinnedItems.push(item)
      return
    }

    remainingItems.push(item)
  })

  return [...pinnedItems, ...remainingItems]
}

const ANNOUNCEMENT_PIN_DURATION_MS = 24 * 60 * 60 * 1000

function getAnnouncementPinExpiry(item = {}) {
  if (item.type !== 'announcement' || item.author?.user_type !== 'admin') return null

  const publishedAt = new Date(item.published_at || item.created_at || 0).getTime()
  if (!Number.isFinite(publishedAt)) return null

  const configuredExpiry = item.expires_at ? new Date(item.expires_at).getTime() : Number.POSITIVE_INFINITY
  return Math.min(publishedAt + ANNOUNCEMENT_PIN_DURATION_MS, configuredExpiry)
}

function getPinnedAnnouncement(items = [], now = Date.now()) {
  return items
    .filter((item) => {
      const expiry = getAnnouncementPinExpiry(item)
      const publishedAt = new Date(item.published_at || item.created_at || 0).getTime()
      return expiry !== null && publishedAt <= now && now < expiry
    })
    .sort((left, right) => new Date(right.published_at || right.created_at) - new Date(left.published_at || left.created_at))[0] || null
}

function isOwnerFeedItem(item, ownerId) {
  if (!ownerId || !item || item.is_repost || item.isRepost) return false
  const authorId = item.user_id || item.created_by || item.author?.id
  return authorId != null && String(authorId) === String(ownerId)
}

function isHiddenByFeedPreferences(item, ownerId, hiddenPosts = new Set(), notInterestedTopics = new Set()) {
  if (isOwnerFeedItem(item, ownerId)) return false

  return hiddenPosts.has(`${item.type}-${item.id}`)
    || Boolean(item.author?.id && notInterestedTopics.has(`author:${item.author.id}`))
    || Boolean(item.category && notInterestedTopics.has(`category:${String(item.category).toLowerCase()}`))
}

function prioritizeAnnouncement(items = [], announcementId) {
  if (!announcementId) return items
  const pinnedIndex = items.findIndex((item) => item.type === 'announcement' && item.id === announcementId)
  if (pinnedIndex <= 0) return items
  return [items[pinnedIndex], ...items.slice(0, pinnedIndex), ...items.slice(pinnedIndex + 1)]
}

function prioritizeOwnerFeedItems(items = [], ownerId, announcementId) {
  if (!Array.isArray(items)) return []

  const ownerItems = []
  const otherItems = []

  items.forEach((item) => {
    if (isOwnerFeedItem(item, ownerId)) ownerItems.push(item)
    else otherItems.push(item)
  })

  ownerItems.sort((left, right) => {
    const leftDate = new Date(left.published_at || left.created_at || 0).getTime()
    const rightDate = new Date(right.published_at || right.created_at || 0).getTime()
    return (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0)
  })

  return [...ownerItems, ...prioritizeAnnouncement(otherItems, announcementId)]
}

function prioritizeNewestCommunityPost(items = []) {
  if (!Array.isArray(items)) return []

  let newestIndex = -1
  let newestTimestamp = Number.NEGATIVE_INFINITY

  items.forEach((item, index) => {
    if (!['post', 'user_post'].includes(item?.type) || item.is_repost || item.isRepost) return

    const timestamp = new Date(item.published_at || item.created_at || 0).getTime()
    const normalizedTimestamp = Number.isFinite(timestamp) ? timestamp : 0
    if (normalizedTimestamp > newestTimestamp) {
      newestIndex = index
      newestTimestamp = normalizedTimestamp
    }
  })

  if (newestIndex <= 0) return items
  return [items[newestIndex], ...items.slice(0, newestIndex), ...items.slice(newestIndex + 1)]
}

module.exports = {
  getFeedItemKey,
  prioritizePinnedFeedItems,
  ANNOUNCEMENT_PIN_DURATION_MS,
  getAnnouncementPinExpiry,
  getPinnedAnnouncement,
  isHiddenByFeedPreferences,
  isOwnerFeedItem,
  prioritizeAnnouncement,
  prioritizeOwnerFeedItems,
  prioritizeNewestCommunityPost,
}
