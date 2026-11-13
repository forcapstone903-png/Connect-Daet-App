import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { notifyUserRecipients } from '@/lib/userNotificationDelivery.mjs'

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

async function notifyRegistrationChange(client, { eventId, userId, action }) {
  const { data: event, error } = await client
    .from('info_events')
    .select('id, title, created_by')
    .eq('id', eventId)
    .maybeSingle()
  if (error) {
    console.error('Event registration notification lookup failed:', { code: error.code || null })
  }

  const eventTitle = event?.title || 'this event'
  const cancelled = action === 'cancelled'
  const eventLink = `/info/user/events/${eventId}`
  const notifications = [{
    user_id: userId,
    title: cancelled ? 'Event registration cancelled' : 'Event registration confirmed',
    message: cancelled
      ? `Your registration for "${eventTitle}" has been cancelled.`
      : `Your registration for "${eventTitle}" is confirmed.`,
    type: cancelled ? 'event_registration_cancelled' : 'event_registration_confirmed',
    link: eventLink,
  }]

  if (event?.created_by && event.created_by !== userId) {
    notifications.push({
      user_id: event.created_by,
      title: cancelled ? 'Event registration cancelled' : 'New event registration',
      message: cancelled
        ? `A visitor cancelled their registration for "${eventTitle}".`
        : `A visitor registered for "${eventTitle}".`,
      type: cancelled ? 'event_registration_cancelled' : 'event_registration',
      link: `/info/admin/events?open=${encodeURIComponent(eventId)}`,
      actor_id: userId,
    })
  }

  await notifyUserRecipients(client, notifications, 'Event registration')
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
  await notifyRegistrationChange(context.client, {
    eventId: context.eventId,
    userId: context.userId,
    action: 'registered',
  })
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
  await notifyRegistrationChange(context.client, {
    eventId: context.eventId,
    userId: context.userId,
    action: 'cancelled',
  })
  return noCache({ success: true, registration: data })
}
