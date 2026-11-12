import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidAnalyticsVisitorId, normalizeTrackedPublicPath } from './siteAnalytics.js'
import { readFileSync } from 'node:fs'

test('tracks approved public tourism routes and removes query strings', () => {
  assert.equal(normalizeTrackedPublicPath('/info/visitor'), '/info/visitor')
  assert.equal(normalizeTrackedPublicPath('/info/visitor/tourist-spots/spot_123?source=home'), '/info/visitor/tourist-spots/spot_123')
  assert.equal(normalizeTrackedPublicPath('/info/visitor/events/event-123/'), '/info/visitor/events/event-123')
  assert.equal(normalizeTrackedPublicPath('/info/visitor/search?q=daet'), '/info/visitor/search')
  assert.equal(normalizeTrackedPublicPath('/info/visitor/blog/blog_123'), '/info/visitor/blog/blog_123')
  assert.equal(normalizeTrackedPublicPath('/info/visitor/forum/thread-123'), '/info/visitor/forum/thread-123')
})

test('does not track private routes, API routes, or malformed paths', () => {
  assert.equal(normalizeTrackedPublicPath('/info/user/dashboard'), null)
  assert.equal(normalizeTrackedPublicPath('/info/admin/analytics'), null)
  assert.equal(normalizeTrackedPublicPath('/info/login'), null)
  assert.equal(normalizeTrackedPublicPath('/info/api/analytics/visits'), null)
  assert.equal(normalizeTrackedPublicPath('/info/blog'), null)
  assert.equal(normalizeTrackedPublicPath('/info/visitor/events/a/b'), null)
  assert.equal(normalizeTrackedPublicPath('/info/visitor/../admin'), null)
  assert.equal(normalizeTrackedPublicPath(`/${'a'.repeat(240)}`), null)
})

test('accepts UUID visitor identifiers only', () => {
  assert.equal(isValidAnalyticsVisitorId('de305d54-75b4-431b-adb2-eb6b9e546014'), true)
  assert.equal(isValidAnalyticsVisitorId('not-a-uuid'), false)
  assert.equal(isValidAnalyticsVisitorId(null), false)
})

test('device analytics use coarse categories and retain administrator-only reporting access', () => {
  const tracker = readFileSync(new URL('../components/SiteVisitTracker.js', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/(subsystems)/info/api/analytics/visits/route.js', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../../supabase/migrations/100_admin_analytics_exports.sql', import.meta.url), 'utf8')

  assert.match(tracker, /getCoarseDeviceType/)
  assert.match(tracker, /deviceType: getCoarseDeviceType\(\)/)
  assert.doesNotMatch(tracker, /userAgent/)
  assert.match(route, /authorizeAdminApi\(request\)/)
  assert.match(route, /p_device_type:\s*deviceType/)
  assert.match(migration, /device_type IN \('mobile', 'tablet', 'desktop', 'unknown'\)/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_admin_analytics_report\(INTEGER\)\s+TO service_role/)
})
