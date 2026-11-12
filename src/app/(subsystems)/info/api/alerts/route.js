// Public alert feed: current and past alerts, readable by guests.
// Cache: shared CDN cache for 15 s (stale-while-revalidate 45 s). Alerts are
// public by design, the payload holds no user data, and open pages also get
// live updates over Supabase Realtime, so the short TTL only absorbs bursts
// (e.g. everyone opening the link from a push at once).
import { NextResponse } from 'next/server'
import { PUBLIC_ALERT_COLUMNS, getAlertPhase, sortAlertsByUrgency } from '@/lib/alerts.mjs'
import { getServiceClient } from '@/lib/alertsServer'

export const dynamic = 'force-dynamic'

const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=45' }

export async function GET(request) {
  const client = getServiceClient()
  if (!client) {
    return NextResponse.json({ success: false, message: 'Alerts are temporarily unavailable.' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100)

  try {
    let query = client
      .from('alerts')
      .select(PUBLIC_ALERT_COLUMNS)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(limit)
    if (category && /^[a-z][a-z0-9_]{1,30}$/.test(category)) query = query.eq('category', category)

    const [{ data, error }, { data: categories, error: categoryError }] = await Promise.all([
      query,
      client.from('alert_categories').select('slug, name, description, icon, sort_order').eq('is_active', true).order('sort_order'),
    ])
    if (error) throw error
    if (categoryError) throw categoryError

    const now = new Date()
    const alerts = (data || []).map((alert) => ({ ...alert, phase: getAlertPhase(alert, now) }))
    return NextResponse.json({
      success: true,
      current: sortAlertsByUrgency(alerts.filter((alert) => alert.phase === 'active')),
      past: alerts.filter((alert) => alert.phase !== 'active'),
      categories: categories || [],
      generated_at: now.toISOString(),
    }, { headers: PUBLIC_CACHE })
  } catch (error) {
    console.error('Public alerts load failed:', error)
    return NextResponse.json({ success: false, message: 'Alerts are temporarily unavailable.' }, { status: 503 })
  }
}
