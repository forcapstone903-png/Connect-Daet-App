import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function noCache(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return noCache({ success: false, message: 'Please sign in to view your event calendar.' }, 401)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return noCache({ success: false, message: 'Event registrations are not configured.' }, 500)

  try {
    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: registrations, error: registrationError } = await client
      .from('event_registrations')
      .select('event_id, created_at')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (registrationError) throw registrationError

    const eventIds = [...new Set((registrations || []).map((registration) => registration.event_id).filter(Boolean))]
    if (!eventIds.length) return noCache({ success: true, events: [] })
    const registrationDateByEventId = new Map(
      (registrations || []).map((registration) => [registration.event_id, registration.created_at]),
    )

    const { data: events, error: eventsError } = await client
      .from('info_events')
      .select('id, title, description, location, venue, start_date, end_date, start_time, end_time, category, organizer, status')
      .in('id', eventIds)
      .order('start_date', { ascending: true })
    if (eventsError) throw eventsError

    return noCache({
      success: true,
      events: (events || []).map((event) => ({
        ...event,
        registered_at: registrationDateByEventId.get(event.id) || null,
      })),
    })
  } catch (error) {
    console.error('User event calendar lookup failed:', error)
    return noCache({ success: false, message: 'Unable to load your registered events.' }, 500)
  }
}
