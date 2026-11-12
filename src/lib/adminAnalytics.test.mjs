import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAnalyticsTables, parseAnalyticsDays } from './adminAnalytics.mjs'

test('analytics reporting periods are limited to retained ranges', () => {
  assert.equal(parseAnalyticsDays(null), 30)
  assert.equal(parseAnalyticsDays('7'), 7)
  assert.equal(parseAnalyticsDays('30'), 30)
  assert.equal(parseAnalyticsDays('90'), 90)
  assert.equal(parseAnalyticsDays('365'), null)
  assert.equal(parseAnalyticsDays('not-a-period'), null)
})

test('exports include each analytics series and keep staff details admin-only', () => {
  const report = {
    days: 7,
    generatedAt: '2026-11-11T00:00:00.000Z',
    summary: { totalUsers: 4, totalStaff: 1, pageViews: 9, uniqueVisitors: 3 },
    traffic: [{ date: '2026-11-11', pageViews: 9, uniqueVisitors: 3 }],
    userGrowth: [{ date: '2026-11-11', newUsers: 1, totalUsers: 4 }],
    ratingsTrend: [{ date: '2026-11-11', averageRating: 4.5, reviewCount: 2 }],
    devices: [{ deviceType: 'mobile', pageViews: 9, uniqueVisitors: 3 }],
    popularDestinations: [{ name: 'Bagasbas Beach', pageViews: 4, uniqueVisitors: 2 }],
    topPages: [{ path: '/info/visitor', pageViews: 9, uniqueVisitors: 3 }],
    alertActivity: [{ title: 'Weather advisory', category: 'weather', severity: 'warning', sentAt: '2026-11-11T00:00:00.000Z', delivered: 8, opened: 5 }],
    inquiryCategories: [{ category: 'general', count: 2 }],
    staffActivity: [{ name: 'Admin User', email: 'admin@example.test', role: 'admin', actionCount: 3, lastActivity: '2026-11-11T00:00:00.000Z' }],
  }

  const publicTables = buildAnalyticsTables(report)
  const adminTables = buildAnalyticsTables(report, { includeStaffActivity: true })

  assert.ok(publicTables.some((table) => table.name === 'Traffic'))
  assert.ok(publicTables.some((table) => table.name === 'Alert reach'))
  assert.ok(publicTables.find((table) => table.name === 'Summary').rows.some(([metric, value]) => metric === 'Page views' && value === 9))
  assert.ok(publicTables.find((table) => table.name === 'Summary').rows.some(([metric, value]) => metric === 'Estimated unique visitors' && value === 3))
  assert.equal(publicTables.some((table) => table.name === 'Staff activity'), false)
  assert.ok(adminTables.some((table) => table.name === 'Staff activity'))
  assert.equal(adminTables.find((table) => table.name === 'Staff activity').rows[0][0], 'Admin User')
  assert.equal(publicTables.find((table) => table.name === 'Devices').rows[0][0], 'Mobile')
})
