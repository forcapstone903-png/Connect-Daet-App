// Validates a browser Web Push subscription before it is stored.
// Only well-known browser push services are accepted, so the guest opt-in
// endpoint cannot be used to make the server call arbitrary URLs.

const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
]

export function validatePushSubscription(subscription) {
  if (typeof subscription?.endpoint !== 'string') return null
  let endpoint
  try {
    endpoint = new URL(subscription.endpoint)
  } catch {
    return null
  }
  const keys = subscription.keys || {}
  const ok = endpoint.protocol === 'https:'
    && subscription.endpoint.length <= 2048
    && PUSH_SERVICE_HOSTS.some((pattern) => pattern.test(endpoint.hostname))
    && typeof keys.p256dh === 'string' && keys.p256dh.length > 0 && keys.p256dh.length <= 512
    && typeof keys.auth === 'string' && keys.auth.length > 0 && keys.auth.length <= 512
  return ok ? { endpoint: subscription.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } : null
}
