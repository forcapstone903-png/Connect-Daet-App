const CONTENT_ROUTES = {
  announcement: '/info/user/announcements',
  blog: '/info/visitor/blog',
  event: '/info/visitor/events',
  forum: '/info/visitor/forum',
  forum_thread: '/info/visitor/forum',
  post: '/info/user/posts',
  tourist_spot: '/info/visitor/tourist-spots',
  user_post: '/info/user/posts',
}

export function getEngagementContentHref(contentType, contentId) {
  if (typeof contentType !== 'string' || contentId == null || String(contentId).trim() === '') return null

  const route = CONTENT_ROUTES[contentType.trim().toLowerCase()]
  return route ? `${route}/${encodeURIComponent(String(contentId))}` : null
}
