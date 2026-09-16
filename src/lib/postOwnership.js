export function getOriginalAuthorId(post) {
  if (!post || post.is_repost || post.isRepost) {
    return post?.original_post?.user_id
      || post?.original_post?.created_by
      || post?.original_author_id
      || post?.originalAuthor?.id
      || post?.original_author?.id
      || null
  }

  return post.user_id || post.created_by || null
}

export function getRepostOwnerId(post) {
  if (!post || !(post.is_repost || post.isRepost)) return null
  return post.reposted_by || post.reposter_id || post.repostedBy || post.user_id || null
}

export function isOwnOriginalPost(post, currentUserId) {
  if (!currentUserId || !post || post.is_repost || post.isRepost) return false
  return String(getOriginalAuthorId(post)) === String(currentUserId)
}

export function isOwnRepost(post, currentUserId) {
  if (!currentUserId || !post || !(post.is_repost || post.isRepost)) return false
  return String(getRepostOwnerId(post)) === String(currentUserId)
}
