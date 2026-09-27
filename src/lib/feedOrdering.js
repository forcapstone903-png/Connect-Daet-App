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

module.exports = {
  getFeedItemKey,
  prioritizePinnedFeedItems,
}
