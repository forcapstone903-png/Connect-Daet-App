export const ANALYTICS_PERIODS = Object.freeze([7, 30, 90])

export function parseAnalyticsDays(value) {
  if (value == null || value === '') return 30
  const days = Number(value)
  return Number.isInteger(days) && ANALYTICS_PERIODS.includes(days) ? days : null
}

export const TRAFFIC_BUCKETS = Object.freeze(['day', 'week', 'month'])

export function parseTrafficBucket(value) {
  if (value == null || value === '') return 'day'
  return TRAFFIC_BUCKETS.includes(value) ? value : null
}

const BUCKET_HEADERS = { day: 'Date (UTC)', week: 'Week starting (UTC, Monday)', month: 'Month (UTC)' }

function formatRole(role) {
  return String(role || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDevice(deviceType) {
  const labels = { mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop', unknown: 'Unknown / legacy' }
  return labels[deviceType] || 'Unknown / legacy'
}

export function buildAnalyticsTables(report, { includeStaffActivity = false } = {}) {
  const summary = report?.summary || {}
  const tables = [
    {
      name: 'Summary',
      headers: ['Metric', 'Value'],
      rows: [
        ['Generated at (UTC)', report?.generatedAt || ''],
        ['Period (days)', report?.days || 30],
        ['Total users', summary.totalUsers || 0],
        ['Active users', summary.activeUsers || 0],
        ['New users', summary.newUsers || 0],
        ...(includeStaffActivity ? [['Active staff', summary.totalStaff || 0]] : []),
        ['Page views', summary.pageViews || 0],
        ['Estimated unique visitors', summary.uniqueVisitors || 0],
        ['Published events', summary.totalEvents || 0],
        ['Active places', summary.totalPlaces || 0],
        ['Approved blogs', summary.totalBlogs || 0],
        ['Published forum topics', summary.totalForumThreads ?? ''],
        ['Published community posts', summary.totalCommunityPosts ?? ''],
        ['Total posts', summary.totalPosts ?? ''],
        ['Feedback entries', summary.feedbackCount || 0],
        ['Open inquiries', summary.openInquiries || 0],
        ['Average review rating', summary.averageRating || 0],
        ['Attraction reviews', summary.ratingCount || 0],
        ['Alerts sent', summary.sentAlerts || 0],
        ['Alert inbox deliveries', summary.alertsDelivered || 0],
        ['Alert inbox opens', summary.alertsOpened || 0],
      ],
    },
    {
      name: 'Traffic',
      headers: [BUCKET_HEADERS[report?.trafficBucket] || BUCKET_HEADERS.day, 'Page views', 'Estimated unique visitors'],
      rows: (report?.traffic || []).map((row) => [
        report?.trafficBucket === 'month' ? String(row.date).slice(0, 7) : row.date,
        row.pageViews,
        row.uniqueVisitors,
      ]),
    },
    {
      name: 'User growth',
      headers: ['Date (UTC)', 'New users', 'Cumulative users'],
      rows: (report?.userGrowth || []).map((row) => [row.date, row.newUsers, row.totalUsers]),
    },
    {
      name: 'Ratings',
      headers: ['Date (UTC)', 'Average rating', 'Reviews'],
      rows: (report?.ratingsTrend || []).map((row) => [row.date, row.averageRating, row.reviewCount]),
    },
    {
      name: 'Devices',
      headers: ['Screen category', 'Page views', 'Estimated unique visitors'],
      rows: (report?.devices || []).map((row) => [formatDevice(row.deviceType), row.pageViews, row.uniqueVisitors]),
    },
    {
      name: 'Popular places',
      headers: ['Place', 'Page views', 'Estimated unique visitors'],
      rows: (report?.popularDestinations || []).map((row) => [row.name, row.pageViews, row.uniqueVisitors]),
    },
    {
      name: 'Top pages',
      headers: ['Path', 'Page views', 'Estimated unique visitors'],
      rows: (report?.topPages || []).map((row) => [row.path, row.pageViews, row.uniqueVisitors]),
    },
    {
      name: 'Alert reach',
      headers: ['Title', 'Category', 'Severity', 'Sent at', 'Delivered', 'Opened'],
      rows: (report?.alertActivity || []).map((row) => [row.title, row.category, row.severity, row.sentAt, row.delivered, row.opened]),
    },
    {
      name: 'Inquiry categories',
      headers: ['Category', 'Inquiries'],
      rows: (report?.inquiryCategories || []).map((row) => [row.category, row.count]),
    },
  ]

  if (includeStaffActivity) {
    tables.push({
      name: 'Staff activity',
      headers: ['Name', 'Role', 'Actions', 'Last activity'],
      rows: (report?.staffActivity || []).map((row) => [row.name, formatRole(row.role), row.actionCount, row.lastActivity]),
    })
  }

  return tables
}
