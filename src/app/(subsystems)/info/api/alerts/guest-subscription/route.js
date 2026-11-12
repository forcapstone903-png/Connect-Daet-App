// Guest (no account) push opt-in for public alerts.
// Stores the browser's Web Push subscription with user_id = NULL and the
// categories this device wants. Only well-known browser push services are
// accepted, which stops the table being used to store arbitrary URLs.
// The endpoint itself acts as the device's identifier for unsubscribe.
import { fail, getServiceClient, json, loadActiveCategorySlugs, missingConfig, readJsonBody } from '@/lib/alertsServer'
import { validatePushSubscription as validateSubscription } from '@/lib/pushSubscriptionValidation.mjs'
import { clientIp, consumeRateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  const client = getServiceClient()
  if (!client) return missingConfig()
  const limit = await consumeRateLimit(client, { scope: 'guest-alerts', key: clientIp(request), max: 20, windowSeconds: 3600 })
  if (!limit.allowed) return fail(limit.unavailable ? 503 : 429, 'Too many requests. Please try again later.')
  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  const subscription = validateSubscription(body?.subscription)
  if (!subscription) return fail(400, 'This browser\'s push subscription is not valid.')

  try {
    const active = await loadActiveCategorySlugs(client)
    const categories = Array.isArray(body?.categories)
      ? [...new Set(body.categories.map(String).filter((slug) => active.includes(slug)))]
      : []

    const { data: existing, error: lookupError } = await client
      .from('push_subscriptions')
      .select('id, user_id')
      .eq('subscription_endpoint', subscription.endpoint)
      .limit(1)
      .maybeSingle()
    if (lookupError) throw lookupError

    // A device already linked to an account keeps that link; account alert
    // preferences apply instead of guest categories.
    if (existing?.user_id) {
      return json({ success: true, linkedToAccount: true, message: 'This device already gets alerts through your account.' })
    }

    const row = {
      user_id: null,
      subscription,
      subscription_endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      alert_categories: categories.length ? categories : null,
      last_seen_at: new Date().toISOString(),
    }
    const { error } = existing
      ? await client.from('push_subscriptions').update(row).eq('id', existing.id)
      : await client.from('push_subscriptions').insert(row)
    if (error) throw error

    return json({ success: true, categories: row.alert_categories, message: 'Alerts are on for this device.' })
  } catch (error) {
    console.error('Guest alert subscription failed:', { code: error?.code || null })
    return fail(500, 'Unable to turn on alerts right now. Please try again.')
  }
}

export async function DELETE(request) {
  const client = getServiceClient()
  if (!client) return missingConfig()
  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  const subscription = validateSubscription(body?.subscription)
  if (!subscription) return fail(400, 'This browser\'s push subscription is not valid.')

  const { error } = await client
    .from('push_subscriptions')
    .delete()
    .eq('subscription_endpoint', subscription.endpoint)
    .is('user_id', null)
  if (error) {
    console.error('Guest alert unsubscribe failed:', { code: error?.code || null })
    return fail(500, 'Unable to turn off alerts right now.')
  }
  return json({ success: true, message: 'Alerts are off for this device.' })
}
