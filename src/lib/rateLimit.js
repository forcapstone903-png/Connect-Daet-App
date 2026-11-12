import { createHmac } from 'node:crypto'

// Fixed-window limiter on top of consume_password_reset_rate_limit (migration
// 071), which stores only an HMAC of the key. `scope` keeps each endpoint's
// counters separate. Fails closed: if the check itself errors, the request is
// refused rather than allowed through unthrottled.

export function clientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  return request.headers.get('x-real-ip')?.trim()
    || forwardedFor?.split(',').at(-1)?.trim()
    || 'unknown'
}

export async function consumeRateLimit(adminClient, { scope, key, max, windowSeconds }) {
  const secret = process.env.SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  if (!adminClient || Buffer.byteLength(secret, 'utf8') < 32) return { allowed: false, unavailable: true }
  const bucketKey = createHmac('sha256', secret).update(`${scope}:${key}`).digest('hex')
  const { data, error } = await adminClient.rpc('consume_password_reset_rate_limit', {
    p_bucket_key: bucketKey,
    p_window_seconds: windowSeconds,
    p_max_requests: max,
  })
  if (error) {
    console.error('Rate-limit check failed:', { scope, code: error.code || null })
    return { allowed: false, unavailable: true }
  }
  return { allowed: data === true }
}
