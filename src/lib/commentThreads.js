function sortCommentNodes(nodes, sortMode, currentUserId = null) {
  return [...nodes].sort((a, b) => {
    const newestForUser = (list, userId) => list
      .filter((node) => node.user_id === userId)
      .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0]?.created_at

    const aIsCurrentUserNewest = currentUserId && a.user_id === currentUserId && a.created_at === newestForUser(nodes, currentUserId)
    const bIsCurrentUserNewest = currentUserId && b.user_id === currentUserId && b.created_at === newestForUser(nodes, currentUserId)

    if (aIsCurrentUserNewest && !bIsCurrentUserNewest) return -1
    if (!aIsCurrentUserNewest && bIsCurrentUserNewest) return 1

    if (sortMode === 'newest') return new Date(b.created_at) - new Date(a.created_at)
    if (sortMode === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
    if (sortMode === 'most_liked') return (b.relevance_score || 0) - (a.relevance_score || 0)
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return (b.relevance_score || 0) - (a.relevance_score || 0)
  })
}

function sortNodes(nodes, sortMode, currentUserId = null) {
  return sortCommentNodes(nodes, sortMode, currentUserId)
}

function buildCommentThreads(comments = [], sortMode = 'relevant', currentUserId = null) {
  if (!Array.isArray(comments) || comments.length === 0) return []

  const map = new Map()
  comments.forEach((comment) => {
    map.set(String(comment.id), { ...comment, children: [] })
  })

  const roots = []
  const visited = new Set()

  comments.forEach((comment) => {
    const nodeId = String(comment.id)
    const parentId = comment.parent_id == null ? null : String(comment.parent_id)

    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const node = map.get(nodeId)
    if (!node) return

    if (parentId && map.has(parentId)) {
      map.get(parentId).children.push(node)
    } else {
      roots.push(node)
    }
  })

  const walk = (nodes) => {
    const sortedNodes = sortNodes(nodes, sortMode, currentUserId)

    sortedNodes.forEach((node) => {
      node.children = walk(node.children || [])
    })

    return sortedNodes
  }

  return walk(roots)
}

module.exports = {
  buildCommentThreads,
  sortCommentNodes,
}
