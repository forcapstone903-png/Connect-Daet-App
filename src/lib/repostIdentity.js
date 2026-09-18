function normalizeFeedItemType(item) {
  if (!item) return null
  if (item.type === 'forum') return 'forum_thread'
  if (item.type === 'post') return 'user_post'
  return item.type || item.original_content_type || null
}

function getFeedActionIdentity(item = {}) {
  const isRepost = Boolean(item.is_repost || item.isRepost)
  const normalizedType = normalizeFeedItemType(item)

  if (isRepost) {
    return {
      isRepost: true,
      contentType: normalizedType || item.original_content_type || 'user_post',
      contentId: item.repost_id || item.id || item.original_content_id || null,
      originalContentType: item.original_content_type || normalizedType || null,
      originalContentId: item.original_content_id || item.id || null,
      originalPostLookupId: item.original_content_id || item.id || null,
    }
  }

  return {
    isRepost: false,
    contentType: normalizedType || item.original_content_type || 'user_post',
    contentId: item.id || item.original_content_id || null,
    originalContentType: item.original_content_type || normalizedType || null,
    originalContentId: item.original_content_id || item.id || null,
    originalPostLookupId: item.original_content_id || item.id || null,
  }
}

module.exports = {
  getFeedActionIdentity,
  normalizeFeedItemType,
}
