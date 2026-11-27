const SUSPENDED_API_METHODS = new Map([
  ['/info/api/account/status', new Set(['GET'])],
  ['/info/api/blog-comments', new Set(['GET', 'POST'])],
  ['/info/api/comments', new Set(['POST', 'DELETE'])],
  ['/info/api/comments/reactions', new Set(['POST', 'DELETE'])],
  ['/info/api/forum-replies', new Set(['POST', 'PATCH', 'DELETE'])],
  ['/info/api/logout', new Set(['POST'])],
  ['/info/api/notifications', new Set(['GET'])],
  ['/info/api/reactions', new Set(['POST', 'DELETE'])],
  ['/info/api/user/feed', new Set(['GET'])],
  ['/info/api/user/moderation-appeals', new Set(['GET', 'POST'])],
  ['/info/api/user/moderation-details', new Set(['GET'])],
  ['/info/api/user/settings', new Set(['GET'])],
  ['/info/api/users/following', new Set(['GET'])],
])

const SUSPENDED_USER_PAGES = new Set([
  '/info/account-suspended',
  '/info/user/dashboard',
  '/info/user/moderation-appeals',
  '/info/user/moderation-details',
  '/info/user/notifications',
  '/info/user/profile',
])

const VISITOR_CONTENT_PREFIXES = [
  '/info/visitor/blog',
  '/info/visitor/events',
  '/info/visitor/forum',
  '/info/visitor/search',
  '/info/visitor/tourist-spots',
]

export function isSuspendedAccountApiAllowed(pathname, method, isPublicPathname) {
  const allowedMethods = SUSPENDED_API_METHODS.get(pathname)
  if (allowedMethods) return allowedMethods.has(method)
  return method === 'GET' && isPublicPathname(pathname)
}

export function isSuspendedAccountPageAllowed(pathname, method) {
  if (method !== 'GET') return false

  if (
    pathname === '/info/visitor'
    || VISITOR_CONTENT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) return true

  if (SUSPENDED_USER_PAGES.has(pathname) || pathname.startsWith('/info/user/moderation-details/')) {
    return true
  }

  return /^\/info\/user\/(?:announcements|blogs|events|forums|posts)\/(?!new(?:\/|$)|edit(?:\/|$))[^/]+$/.test(pathname)
}
