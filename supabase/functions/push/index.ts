// Web Push sender for CONNECT-Daet.
//
// Called only by the database (public.request_push_dispatch), never by
// browsers. Every request must carry the shared secret in `x-push-secret`
// (Vault: push_webhook_secret, Function secret: PUSH_WEBHOOK_SECRET).
// Deploy with JWT verification off, because the secret is the authentication:
//   supabase functions deploy push --no-verify-jwt
//
// Two request shapes:
//   { record: { user_id, title, body, url, id } }   one notification -> one user
//   { mode: 'alert', kind: 'alert'|'all_clear', alert_id }
//       one broadcast -> every recipient's devices + opted-in guest devices,
//       then writes delivery counts back to public.alerts

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
const vapidSubject = Deno.env.get('VAPID_SUBJECT')
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') || ''

const SEND_CONCURRENCY = 25
const PAGE_SIZE = 1000

if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function secretMatches(provided: string) {
  if (webhookSecret.length < 32 || provided.length !== webhookSecret.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ webhookSecret.charCodeAt(i)
  return diff === 0
}

type SubscriptionRow = { id: string; subscription: webpush.PushSubscription; user_id: string | null }
type SendResult = { sent: boolean; removed: boolean; guest: boolean }

async function sendToRows(supabase: SupabaseClient, rows: SubscriptionRow[], payload: string, urgency: string) {
  const results: SendResult[] = []
  for (let i = 0; i < rows.length; i += SEND_CONCURRENCY) {
    const batch = rows.slice(i, i + SEND_CONCURRENCY)
    results.push(...await Promise.all(batch.map(async (row): Promise<SendResult> => {
      const guest = row.user_id === null
      try {
        await webpush.sendNotification(row.subscription, payload, { headers: { Urgency: urgency, TTL: '86400' } })
        return { sent: true, removed: false, guest }
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0)
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.id)
          return { sent: false, removed: true, guest }
        }
        console.error('PUSH FAILED', row.id, (error as Error)?.message || error)
        return { sent: false, removed: false, guest }
      }
    })))
  }
  return results
}

async function pageAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

const SEVERITY_PREFIX: Record<string, string> = {
  critical: 'EMERGENCY: ',
  warning: 'Warning: ',
  advisory: 'Advisory: ',
  info: '',
}

async function sendAlert(supabase: SupabaseClient, alertId: string, kind: 'alert' | 'all_clear') {
  const { data: alert, error } = await supabase
    .from('alerts')
    .select('id, title, message, category, severity, audience, status, all_clear_message')
    .eq('id', alertId)
    .maybeSingle()
  if (error) throw error
  if (!alert || alert.status !== 'sent') return { skipped: true }

  const inboxType = kind === 'all_clear' ? 'alert_all_clear' : 'alert'
  const recipientRows = await pageAll<{ user_id: string }>((from, to) => supabase
    .from('info_notifications')
    .select('user_id')
    .eq('alert_id', alertId)
    .eq('type', inboxType)
    .range(from, to))
  const userIds = [...new Set(recipientRows.map((row) => row.user_id))]

  const rows: SubscriptionRow[] = []
  for (let i = 0; i < userIds.length; i += 300) {
    const { data, error: subError } = await supabase
      .from('push_subscriptions')
      .select('id, subscription, user_id')
      .in('user_id', userIds.slice(i, i + 300))
    if (subError) throw subError
    rows.push(...(data || []) as SubscriptionRow[])
  }

  // Guest devices: opted in to everything (null/empty) or to this category.
  const guests = await pageAll<SubscriptionRow & { alert_categories: string[] | null }>((from, to) => supabase
    .from('push_subscriptions')
    .select('id, subscription, user_id, alert_categories')
    .is('user_id', null)
    .range(from, to))
  rows.push(...guests.filter((row) => alert.audience === 'all'
    || !row.alert_categories?.length
    || row.alert_categories.includes(alert.category)))

  const payload = JSON.stringify({
    // Same tag for alert and all-clear, so the all-clear replaces the warning.
    id: `alert-${alert.id}`,
    title: kind === 'all_clear'
      ? `All clear: ${alert.title}`
      : `${SEVERITY_PREFIX[alert.severity] ?? ''}${alert.title}`,
    body: String(kind === 'all_clear' ? alert.all_clear_message : alert.message).slice(0, 240),
    url: `/info/visitor/alerts/${alert.id}`,
    icon: '/logo.png',
    badge: '/logo.png',
    data: { alertId: alert.id, kind, severity: alert.severity },
  })

  const urgency = kind === 'alert' && ['critical', 'warning'].includes(alert.severity) ? 'high' : 'normal'
  const results = await sendToRows(supabase, rows, payload, urgency)
  const counts = {
    attempted: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent && !r.removed).length,
    removed: results.filter((r) => r.removed).length,
    guestSent: results.filter((r) => r.sent && r.guest).length,
  }

  if (kind === 'alert') {
    const { error: updateError } = await supabase.from('alerts').update({
      push_attempted: counts.attempted,
      push_sent: counts.sent,
      push_failed: counts.failed,
      push_removed: counts.removed,
      guest_push_sent: counts.guestSent,
      push_completed_at: new Date().toISOString(),
    }).eq('id', alertId)
    if (updateError) console.error('Alert counter update failed:', updateError)
  }

  return counts
}

async function sendSingle(supabase: SupabaseClient, notification: Record<string, unknown>) {
  const userId = notification.user_id as string | undefined
  const body = (notification.body || notification.message) as string | undefined
  if (!userId || !body) return null

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, subscription, user_id')
    .eq('user_id', userId)
  if (error) throw error

  const payload = JSON.stringify({
    id: notification.id || crypto.randomUUID(),
    title: notification.title || 'CONNECT-Daet',
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    url: notification.url || notification.link || '/',
  })
  const results = await sendToRows(supabase, (data || []) as SubscriptionRow[], payload, 'high')
  return { attempted: results.length, sent: results.filter((r) => r.sent).length }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)
  if (!secretMatches(request.headers.get('x-push-secret') || '')) {
    return jsonResponse({ error: 'Unauthorized.' }, 401)
  }
  if (!supabaseUrl || !serviceRoleKey || !vapidPrivateKey || !vapidSubject || !vapidPublicKey) {
    return jsonResponse({ error: 'Push function secrets are not configured.' }, 500)
  }

  try {
    const body = await request.json()
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (body?.mode === 'alert') {
      const alertId = String(body.alert_id || '')
      if (!/^[0-9a-f-]{36}$/i.test(alertId)) return jsonResponse({ error: 'alert_id is required.' }, 400)
      const kind = body.kind === 'all_clear' ? 'all_clear' : 'alert'
      return jsonResponse({ success: true, ...(await sendAlert(supabase, alertId, kind)) })
    }

    const result = await sendSingle(supabase, body?.record || body || {})
    if (!result) return jsonResponse({ error: 'user_id and body are required.' }, 400)
    return jsonResponse({ success: true, ...result })
  } catch (error) {
    console.error('Push function failed:', error)
    return jsonResponse({ error: 'Unable to send push notification.' }, 500)
  }
})
