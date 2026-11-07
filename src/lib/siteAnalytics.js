export const SITE_ANALYTICS_CONSENT_KEY = 'daet-analytics-consent'
export const SITE_ANALYTICS_VISITOR_KEY = 'daet-site-analytics-visitor'
export const SITE_ANALYTICS_VISITOR_TTL_MS = 30 * 24 * 60 * 60 * 1000

const VISITOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TRACKED_PUBLIC_PATH_PATTERN = /^\/info\/visitor(?:\/(?:search|tourist-spots(?:\/[A-Za-z0-9_-]+)?|events(?:\/[A-Za-z0-9_-]+)?|blog\/[A-Za-z0-9_-]+|forum(?:\/[A-Za-z0-9_-]+)?))?$/

export function isValidAnalyticsVisitorId(value) {
  return typeof value === 'string' && VISITOR_ID_PATTERN.test(value)
}

export function normalizeTrackedPublicPath(value) {
  if (typeof value !== 'string' || value.length > 240) return null

  const path = value.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/'
  return TRACKED_PUBLIC_PATH_PATTERN.test(path) ? path : null
}
