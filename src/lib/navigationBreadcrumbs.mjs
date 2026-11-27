import { canAccessAdminPage, getStaffHomePath } from './staffRoles.mjs'

const HOME_PATHS = new Set([
  '/info/admin',
  '/info/admin/dashboard',
  '/info/admin/tourism-dashboard',
  '/info/admin/moderator-dashboard',
  '/info/user',
  '/info/user/dashboard',
  '/info/visitor',
])

const PAGE_LABELS = {
  '2fa': 'Two-Factor Authentication',
  alerts: 'Alerts',
  analytics: 'Analytics',
  announcements: 'Announcements',
  appearance: 'Appearance',
  archive: 'Archive',
  backups: 'Backups',
  blogs: 'Blog Approvals',
  'blog-submissions': 'My Stories',
  calendar: 'Events Calendar',
  categories: 'Categories',
  community: 'Community',
  'community-guidelines': 'Community Guidelines',
  connections: 'Connections',
  data: 'Data',
  drafts: 'Drafts',
  email: 'Email Settings',
  events: 'Events',
  'event-approvals': 'Event Approvals',
  faqs: 'Frequently Asked Questions',
  feedback: 'Feedback',
  'file-management': 'Media Library',
  forum: 'Forum',
  general: 'General Settings',
  'login-security': 'Failed Sign-ins',
  maintenance: 'Maintenance',
  messaging: 'Messages',
  moderation: 'Moderation',
  notifications: 'Notifications',
  password: 'Password',
  profile: 'Profile',
  rewards: 'Rewards',
  reviews: 'Reviews',
  saved: 'Saved Items',
  search: 'Search',
  security: 'Security',
  sessions: 'Sessions',
  settings: 'Settings',
  'staff-chat': 'Staff Chat',
  'tourism-dashboard': 'Tourism Officer Dashboard',
  'tourist-spots': 'Places',
  users: 'Users',
}

const ROUTE_HIERARCHIES = [
  {
    match: (path) => /^\/info\/user\/posts\/[^/]+$/.test(path),
    parents: [
      { label: 'Community', href: '/info/user/dashboard#community' },
      { label: 'Posts', href: '/info/user/dashboard#community-posts' },
    ],
    current: 'Post Details',
  },
  {
    match: (path) => /^\/info\/user\/blogs\/new$/.test(path),
    parents: [{ label: 'My Stories', href: '/info/user/blog-submissions' }],
    current: 'Create Post',
  },
  {
    match: (path) => /^\/info\/user\/blogs\/[^/]+\/edit$/.test(path),
    parents: [{ label: 'My Stories', href: '/info/user/blog-submissions' }],
    current: 'Edit Story',
  },
  {
    match: (path) => /^\/info\/user\/blogs\/[^/]+$/.test(path),
    parents: [{ label: 'My Stories', href: '/info/user/blog-submissions' }],
    current: 'Story Details',
  },
  {
    match: (path) => /^\/info\/user\/profile\/(edit|connections|archive)$/.test(path),
    parents: [{ label: 'Profile', href: '/info/user/profile' }],
  },
  {
    match: (path) => /^\/info\/user\/profile\/[^/]+$/.test(path),
    parents: [{ label: 'Connections', href: '/info/user/profile/connections' }],
    current: 'Profile Details',
  },
  {
    match: (path) => /^\/info\/user\/messaging\/[^/]+\/pinned$/.test(path),
    parents: [
      { label: 'Messages', href: '/info/user/messaging' },
      {
        label: 'Conversation',
        href: (path) => `/info/user/messaging/${path.split('/')[4]}`,
      },
    ],
    current: 'Pinned Messages',
  },
  {
    match: (path) => path === '/info/user/messaging/archived',
    parents: [{ label: 'Messages', href: '/info/user/messaging' }],
    current: 'Archived Messages',
  },
  {
    match: (path) => /^\/info\/user\/messaging\/[^/]+$/.test(path),
    parents: [{ label: 'Messages', href: '/info/user/messaging' }],
    current: 'Conversation',
  },
  {
    match: (path) => /^\/info\/user\/announcements\/[^/]+$/.test(path),
    parents: [{ label: 'Announcements', href: '/info/user/announcements' }],
    current: 'Announcement Details',
  },
  {
    match: (path) => /^\/info\/user\/events\/[^/]+$/.test(path),
    parents: [{ label: 'Events Calendar', href: '/info/user/events/calendar' }],
    current: 'Event Details',
  },
  {
    match: (path) => /^\/info\/user\/forums\/[^/]+$/.test(path),
    parents: [{ label: 'Forum', href: '/info/visitor/forum' }],
    current: 'Discussion Details',
  },
  {
    match: (path) => /^\/info\/visitor\/tourist-spots\/[^/]+$/.test(path),
    parents: [{ label: 'Places', href: '/info/visitor/tourist-spots' }],
    current: 'Destination Details',
  },
  {
    match: (path) => /^\/info\/visitor\/events\/[^/]+$/.test(path),
    parents: [{ label: 'Events', href: '/info/visitor/events' }],
    current: 'Event Details',
  },
  {
    match: (path) => /^\/info\/visitor\/alerts\/[^/]+$/.test(path),
    parents: [{ label: 'Alerts', href: '/info/visitor/alerts' }],
    current: 'Alert Details',
  },
  {
    match: (path) => /^\/info\/visitor\/forum\/[^/]+$/.test(path),
    parents: [{ label: 'Forum', href: '/info/visitor/forum' }],
    current: 'Discussion Details',
  },
  {
    match: (path) => /^\/info\/visitor\/blog\/[^/]+$/.test(path),
    parents: [{ label: 'Stories', href: '/info/visitor/search?type=blogs' }],
    current: 'Story Details',
  },
]

const ADMIN_PARENT_RULES = [
  {
    match: (path) => /^\/info\/admin\/settings\/[^/]+$/.test(path),
    parents: [{ label: 'Settings', href: '/info/admin/settings' }],
  },
  {
    match: (path) => /^\/info\/admin\/account\/[^/]+$/.test(path),
    parents: [{ label: 'My Account', href: '/info/admin/account' }],
  },
  {
    match: (path) => /^\/info\/admin\/data\/[^/]+$/.test(path),
    parents: [{ label: 'Data', href: '/info/admin/data' }],
  },
  {
    match: (path) => /^\/info\/admin\/analytics\/[^/]+$/.test(path),
    parents: [{ label: 'Analytics', href: '/info/admin/analytics' }],
  },
  {
    match: (path) => /^\/info\/admin\/notifications\/[^/]+$/.test(path),
    parents: [{ label: 'Notifications', href: '/info/admin/notifications' }],
  },
  {
    match: (path) => path === '/info/admin/forum-submissions',
    parents: [{ label: 'Community', href: '/info/admin/forum' }],
    current: 'Forum Submissions',
  },
  {
    match: (path) => path === '/info/admin/post-moderation',
    parents: [{ label: 'Moderation', href: '/info/admin/moderation' }],
    current: 'Post Moderation',
  },
  {
    match: (path) => path === '/info/admin/inquiry-forum',
    parents: [{ label: 'Moderation', href: '/info/admin/moderation' }],
    current: 'Inquiry Forum',
  },
  {
    match: (path) => path === '/info/admin/moderation/notifications',
    parents: [{ label: 'Moderation', href: '/info/admin/moderation' }],
    current: 'Post Notifications',
  },
  {
    match: (path) => path === '/info/admin/notifications/send',
    parents: [{ label: 'Notifications', href: '/info/admin/notifications' }],
    current: 'Send Announcement',
  },
  {
    match: (path) => /^\/info\/admin\/community\/[^/]+$/.test(path),
    parents: [{ label: 'Community', href: '/info/admin/community' }],
  },
  {
    match: (path) => path === '/info/admin/event-approvals',
    parents: [{ label: 'Events', href: '/info/admin/events' }],
  },
  {
    match: (path) => path === '/info/admin/blogs',
    parents: [{ label: 'Moderation', href: '/info/admin/moderation' }],
  },
  {
    match: (path) => path === '/info/admin/forum',
    parents: [{ label: 'Community', href: '/info/admin/community' }],
  },
  {
    match: (path) => ['/tourist-spots', '/alerts', '/events'].some((section) => path === `/info/admin${section}`),
    parents: [{ label: 'Tourism', href: '/info/admin/tourism-dashboard' }],
  },
  {
    match: (path) => ['/faqs', '/feedback', '/reviews'].some((section) => path === `/info/admin${section}`),
    parents: [{ label: 'Public Information', href: '/info/admin/faqs' }],
  },
  {
    match: (path) => path === '/info/admin/community-guidelines',
    parents: [{ label: 'Moderation', href: '/info/admin/moderation' }],
  },
]

function cleanPathname(pathname) {
  const path = String(pathname || '').split(/[?#]/, 1)[0].replace(/\/+$/, '')
  return path || '/'
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function humanizeSegment(segment) {
  if (/^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,})$/i.test(segment)) return 'Details'
  const decoded = decodeSegment(segment)
  return PAGE_LABELS[decoded] || decoded
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function getNavigationBreadcrumbs(pathname, {
  homeHref,
  homeLabel,
  role,
  permissionOverrides,
} = {}) {
  const path = cleanPathname(pathname)
  if (HOME_PATHS.has(path)) return []

  const isAdminPath = path.startsWith('/info/admin/')
  const isUserPath = path.startsWith('/info/user/')
  const isVisitorPath = path.startsWith('/info/visitor/')
  if (!isAdminPath && !isUserPath && !isVisitorPath) return []

  const resolvedHomeHref = homeHref || (isAdminPath
    ? getStaffHomePath(role || 'admin')
    : isVisitorPath
      ? '/info/visitor'
      : '/info/user/dashboard')
  const resolvedHomeLabel = homeLabel || (isVisitorPath ? 'Explore Daet' : 'Dashboard')
  const hierarchy = ROUTE_HIERARCHIES.find((entry) => entry.match(path))
    || (isAdminPath ? ADMIN_PARENT_RULES.find((entry) => entry.match(path)) : null)
  const parents = (hierarchy?.parents || []).filter((parent) => {
    if (parent.href === resolvedHomeHref) return false
    const href = typeof parent.href === 'function' ? parent.href(path) : parent.href
    if (isAdminPath && role && !canAccessAdminPage(role, cleanPathname(href), permissionOverrides)) {
      return false
    }
    return true
  }).map((parent) => ({
    label: parent.label,
    href: typeof parent.href === 'function' ? parent.href(path) : parent.href,
  }))
  const currentLabel = hierarchy?.current || humanizeSegment(path.split('/').pop() || path)

  return [
    { label: resolvedHomeLabel, href: resolvedHomeHref },
    ...parents,
    { label: currentLabel },
  ]
}