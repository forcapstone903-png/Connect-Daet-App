import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
const vapidSubject = Deno.env.get('VAPID_SUBJECT')
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  if (!supabaseUrl || !serviceRoleKey || !vapidPrivateKey || !vapidSubject || !vapidPublicKey) {
    return jsonResponse({ error: 'Push function secrets are not configured.' }, 500)
  }

  try {
    const webhook = await request.json()
    const notification = webhook.record || webhook
    const userId = notification.user_id
    const body = notification.body || notification.message || notification.payload?.body

    if (!userId || !body) return jsonResponse({ error: 'user_id and body are required.' }, 400)

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('push_subscriptions')
      .select('id, subscription_endpoint, subscription')
      .eq('user_id', userId)

    if (subscriptionError) throw subscriptionError

    const payload = JSON.stringify({
      title: notification.title || 'CONNECT-Daet',
      body,
      icon: notification.icon || '/logo.png',
      badge: notification.badge || '/logo.png',
      url: notification.url || notification.link || '/',
      data: notification.payload || {},
    })

    const results = await Promise.all((subscriptions || []).map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload)
        return { id: row.id, sent: true }
      } catch (error) {
        const statusCode = Number(error?.statusCode || error?.status || 0)
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.id)
          return { id: row.id, sent: false, removed: true }
        }
        console.error('Push delivery failed:', error)
        return { id: row.id, sent: false, removed: false }
      }
    }))

    return jsonResponse({ success: true, attempted: results.length, results })
  } catch (error) {
    console.error('Push function failed:', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to send push notification.' }, 500)
  }
})
