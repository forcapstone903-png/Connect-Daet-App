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

/**
 * Builds the feed item for a freshly created repost.
 *
 * The card must be attributed to the person who reposted it, so `author` is the
 * reposter. The author of the original post is preserved separately in
 * `original_author` / `original_post.author` for the "Originally shared by" line.
 * Spreading `original` first and then overriding every identity field is what
 * keeps the original author from leaking into the repost's `author`.
 */
function buildRepostFeedItem({ repost = null, original = null, reposter = null } = {}) {
  if (!repost?.id || !original) return null

  const isBlog = repost.original_content_type === 'blog'
  const originalContentId = repost.original_content_id || original.id || null
  const originalAuthor = original.author || null

  return {
    ...original,
    id: repost.id,
    original_post_id: originalContentId,
    // Kept on the item so engagement actions (comments, reactions, share
    // counts) and the repost action can resolve the original content without
    // relying on fallbacks.
    original_content_id: originalContentId,
    original_content_type: repost.original_content_type || (isBlog ? 'blog' : 'user_post'),
    repost_id: repost.id,
    reposted_by: repost.user_id,
    repost_quote: repost.quote_text,
    created_by: repost.user_id,
    // The repost owns its own timeline: `created_at`/`reposted_at` are when the
    // repost happened, while `original_post.created_at` keeps the original date.
    created_at: repost.created_at,
    reposted_at: repost.created_at,
    published_at: repost.created_at,
    category: 'Repost',
    type: isBlog ? 'blog' : 'post',
    href: isBlog ? `/user/blogs/${originalContentId}` : `/user/posts/${originalContentId}`,
    is_repost: true,
    author: reposter || { id: repost.user_id || null, full_name: null, profile_image_url: null, user_type: null },
    original_author_id: original.user_id || original.created_by || null,
    original_author: originalAuthor,
    original_post: { ...original, author: originalAuthor },
  }
}

/**
 * Resolves the content a repost action must target.
 *
 * Reposting always acts on the underlying content, so the target id is the
 * original content id — never the repost row id. A repost card may key its
 * reactions and comments on the repost instance, but the repost API resolves
 * `contentId` against the original content table, so sending the repost id
 * makes the lookup fail with "The original content is unavailable."
 */
function getRepostTarget(item = {}) {
  const original = item.original_post || {}

  return {
    contentType: item.original_content_type || (item.type === 'blog' ? 'blog' : 'user_post'),
    contentId: item.original_content_id || item.original_post_id || original.id || null,
  }
}

module.exports = {
  getFeedActionIdentity,
  normalizeFeedItemType,
  buildRepostFeedItem,
  getRepostTarget,
}
