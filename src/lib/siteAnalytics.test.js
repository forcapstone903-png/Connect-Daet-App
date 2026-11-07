import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidAnalyticsVisitorId, normalizeTrackedPublicPath } from './siteAnalytics.js'

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
