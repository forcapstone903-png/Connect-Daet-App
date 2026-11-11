import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function noCache(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

async function getContext(request, params) {
  const userId = getServerSession(request)?.user_id || null
  const eventId = (await params)?.id || null
  if (!userId) return { response: noCache({ success: false, message: 'Please sign in to register for events.' }, 401) }
  if (!eventId) return { response: noCache({ success: false, message: 'An event is required.' }, 400) }
  const client = getAdminClient()
  if (!client) return { response: noCache({ success: false, message: 'Event registrations are not configured.' }, 500) }
  return { userId, eventId, client }
}

export async function GET(request, { params }) {
  const context = await getContext(request, params)
  if (context.response) return context.response

  const { data, error } = await context.client
    .from('event_registrations')
    .select('id, status, created_at')
    .eq('event_id', context.eventId)
    .eq('user_id', context.userId)
    .maybeSingle()
  if (error) return noCache({ success: false, message: 'Unable to load your event registration.' }, 500)
  return noCache({ success: true, registration: data || null })
}

export async function POST(request, { params }) {
  const context = await getContext(request, params)
  if (context.response) return context.response

  const { data, error } = await context.client.rpc('register_for_event', {
    p_event_id: context.eventId,
    p_user_id: context.userId,
  })
  if (error) {
    const capacityReached = /capacity/i.test(error.message || '')
    const unavailable = /not available/i.test(error.message || '')
    return noCache({
      success: false,
      message: capacityReached
        ? 'This event has reached its registration capacity.'
        : unavailable
          ? 'This event is no longer available for registration.'
          : 'Unable to save your event registration.',
    }, capacityReached || unavailable ? 409 : 500)
  }
  return noCache({ success: true, registration: data })
}

export async function DELETE(request, { params }) {
  const context = await getContext(request, params)
  if (context.response) return context.response

  const { data, error } = await context.client.rpc('cancel_event_registration', {
    p_event_id: context.eventId,
    p_user_id: context.userId,
  })
  if (error) return noCache({ success: false, message: 'Unable to cancel your event registration.' }, 500)
  if (!data) return noCache({ success: false, message: 'No event registration was found.' }, 404)
  return noCache({ success: true, registration: data })
}
