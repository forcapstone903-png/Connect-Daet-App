import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function POST(request) {
  const session = getServerSession(request)
  if (!session?.user_id) {
    return response({ success: false, message: 'Your sign-in session has expired. Sign in again before enabling notifications.' }, 401)
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Push subscription service is not configured.')
    return response({ success: false, message: 'Push notifications are temporarily unavailable.' }, 503)
  }

  try {
    let body
    try {
      body = await request.json()
    } catch {
      return response({ success: false, message: 'A valid push subscription is required.' }, 400)
    }
    const subscription = body?.subscription
    let parsedEndpoint
    try {
      parsedEndpoint = new URL(subscription?.endpoint)
    } catch {
      return response({ success: false, message: 'Invalid push subscription.' }, 400)
    }

    if (
      typeof subscription?.endpoint !== 'string'
      || subscription.endpoint.length > 2048
      || parsedEndpoint.protocol !== 'https:'
      || typeof subscription?.keys?.p256dh !== 'string'
      || !subscription.keys.p256dh
      || subscription.keys.p256dh.length > 512
      || typeof subscription?.keys?.auth !== 'string'
      || !subscription.keys.auth
      || subscription.keys.auth.length > 512
    ) {
      return response({ success: false, message: 'Invalid push subscription.' }, 400)
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const row = {
      user_id: session.user_id,
      subscription,
      subscription_endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }

    const existingResult = await adminSupabase
      .from('push_subscriptions')
      .select('id')
      .eq('subscription_endpoint', subscription.endpoint)
      .maybeSingle()

    let error = existingResult.error
    if (!error && existingResult.data?.id) {
      ({ error } = await adminSupabase
        .from('push_subscriptions')
        .update(row)
        .eq('id', existingResult.data.id))
    } else if (!error) {
      ({ error } = await adminSupabase
        .from('push_subscriptions')
        .insert(row))
    }

    if (error?.code === 'PGRST204' || error?.code === '42703') {
      const fallback = await adminSupabase
        .from('push_subscriptions')
        .insert({ user_id: session.user_id, subscription })
      error = fallback.error
    }

    if (error) throw error
    return response({ success: true })
  } catch (error) {
    console.error('Push subscription save failed:', {
      code: error?.code || null,
      status: error?.status || null,
    })
    return response({ success: false, message: 'Unable to save your notification settings right now. Please try again.' }, 500)
  }
}

export async function DELETE(request) {
  const session = getServerSession(request)
  if (!session?.user_id) {
    return response({ success: false, message: 'Your sign-in session has expired. Sign in again before changing notification settings.' }, 401)
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Push subscription service is not configured.')
    return response({ success: false, message: 'Push notifications are temporarily unavailable.' }, 503)
  }

  try {
    let body
    try {
      body = await request.json()
    } catch {
      return response({ success: false, message: 'A valid push subscription endpoint is required.' }, 400)
    }
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : ''
    let parsedEndpoint
    try {
      parsedEndpoint = new URL(endpoint)
    } catch {
      return response({ success: false, message: 'Invalid push subscription endpoint.' }, 400)
    }

    if (endpoint.length > 2048 || parsedEndpoint.protocol !== 'https:') {
      return response({ success: false, message: 'Invalid push subscription endpoint.' }, 400)
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    let result = await adminSupabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', session.user_id)
      .eq('subscription_endpoint', endpoint)

    if (result.error?.code === 'PGRST204' || result.error?.code === '42703') {
      result = await adminSupabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', session.user_id)
        .contains('subscription', { endpoint })
    }

    if (result.error) throw result.error
    return response({ success: true })
  } catch (error) {
    console.error('Push subscription removal failed:', {
      code: error?.code || null,
      status: error?.status || null,
    })
    return response({ success: false, message: 'Unable to update your notification settings right now. Please try again.' }, 500)
  }
}
