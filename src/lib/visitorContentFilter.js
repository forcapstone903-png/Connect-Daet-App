const VISITOR_TRENDING_THRESHOLD = 1000

function getVisitorEngagementScore(content = {}) {
  const score = Number(content.likes || 0) + Number(content.reactions || 0) + Number(content.comments_count || 0) + Number(content.shares_count || 0) + Number(content.bookmarks_count || 0)
  return Number.isFinite(score) ? score : 0
}

function isVisitorVisibleContent(content = {}, options = {}) {
  const authorType = String(options.authorType || content.author_type || content.user_type || '').trim().toLowerCase()
  const engagementScore = getVisitorEngagementScore(content)
  const isTrending = Boolean(options.isTrending || content.is_trending || content.trending)

  if (!content || typeof content !== 'object') {
    return false
  }

  if (authorType === 'admin') {
    return true
  }

  if (authorType === 'tourist') {
    return isTrending || engagementScore >= VISITOR_TRENDING_THRESHOLD
  }

  return true
}

module.exports = {
  VISITOR_TRENDING_THRESHOLD,
  getVisitorEngagementScore,
  isVisitorVisibleContent,
}
