import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

export async function POST(request) {
  const session = getServerSession(request)
  if (!session?.user_id) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Push subscription service is not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const subscription = body?.subscription
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ success: false, message: 'Invalid push subscription.' }, { status: 400 })
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
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Push subscription save failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to save push subscription.' }, { status: 500 })
  }
}
