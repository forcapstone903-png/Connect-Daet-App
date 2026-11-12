import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { getActivePublishingRestriction } from '@/lib/contentRestrictions'
import { notifyAdministrators } from '@/lib/adminNotifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CATEGORIES = new Set(['festival', 'concert', 'exhibition', 'workshop', 'sports', 'cultural'])

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isValidTime(value) {
  if (!value) return true
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59)
}

export async function PATCH(request, { params }) {
  const userId = getServerSession(request)?.user_id
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Please sign in to resubmit an event.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json({ success: false, message: 'Event submissions are not configured.' }, { status: 500 })
  }

  const eventId = (await params)?.id
  if (!eventId) return NextResponse.json({ success: false, message: 'Event id is required.' }, { status: 400 })

  try {
    const body = await request.json()
    const title = String(body.title || '').trim()
    const description = String(body.description || '').trim()
    const startDate = String(body.start_date || '').trim()
    const endDate = String(body.end_date || '').trim()
    const startTime = String(body.start_time || '').trim()
    const endTime = String(body.end_time || '').trim()
    const location = String(body.location || '').trim()
    const organizer = String(body.organizer || '').trim()
    const category = String(body.category || '').trim()
    const isFree = body.is_free
    const rawTicketPrice = body.ticket_price
    const ticketPrice = Number(rawTicketPrice)

    if (typeof isFree !== 'boolean') {
      return NextResponse.json({ success: false, message: 'Choose whether the event is free or ticketed.' }, { status: 400 })
    }
    if (!title || !description || !startDate) {
      return NextResponse.json({ success: false, message: 'Please add an event title, description, and date.' }, { status: 400 })
    }
    if (title.length > 180 || description.length > 10000 || location.length > 240 || organizer.length > 180) {
      return NextResponse.json({ success: false, message: 'One or more event fields exceed the allowed length.' }, { status: 400 })
    }
    if (!isValidDate(startDate) || (endDate && !isValidDate(endDate))) {
      return NextResponse.json({ success: false, message: 'Enter valid event dates.' }, { status: 400 })
    }
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      return NextResponse.json({ success: false, message: 'Enter valid event times.' }, { status: 400 })
    }
    if (endDate && endDate < startDate) {
      return NextResponse.json({ success: false, message: 'The event end date cannot be before its start date.' }, { status: 400 })
    }
    if (!CATEGORIES.has(category)) {
      return NextResponse.json({ success: false, message: 'Choose a valid event category.' }, { status: 400 })
    }
    if (!isFree && (rawTicketPrice === undefined || rawTicketPrice === null || String(rawTicketPrice).trim() === '' || !Number.isFinite(ticketPrice) || ticketPrice < 0)) {
      return NextResponse.json({ success: false, message: 'Enter a valid ticket price.' }, { status: 400 })
    }

    const adminSupabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const restriction = await getActivePublishingRestriction(adminSupabase, userId)
    if (restriction) {
      return NextResponse.json({ success: false, message: 'Your account is currently restricted from publishing events.' }, { status: 403 })
    }

    const { data: existingEvent, error: lookupError } = await adminSupabase
      .from('info_events')
      .select('id, title')
      .eq('id', eventId)
      .eq('created_by', userId)
      .eq('approval_status', 'rejected')
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!existingEvent) {
      return NextResponse.json({ success: false, message: 'Only your rejected event submissions can be edited and resubmitted.' }, { status: 404 })
    }

    const { data: updatedEvent, error: updateError } = await adminSupabase
      .from('info_events')
      .update({
        title,
        description,
        location: location || null,
        venue: location || null,
        start_date: startDate,
        end_date: endDate || startDate,
        start_time: startTime || null,
        end_time: endTime || null,
        category,
        organizer: organizer || null,
        is_free: isFree,
        ticket_price: isFree ? 0 : ticketPrice,
        status: 'draft',
        approval_status: 'pending',
        submitted_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
        rejection_reason: null,
        published_at: null,
      })
      .eq('id', eventId)
      .eq('created_by', userId)
      .eq('approval_status', 'rejected')
      .select('id, title, approval_status, submitted_at')
      .maybeSingle()
    if (updateError) throw updateError
    if (!updatedEvent) {
      return NextResponse.json({ success: false, message: 'This event is no longer available for resubmission.' }, { status: 409 })
    }

    const { error: notificationError } = await adminSupabase.from('info_notifications').insert({
      user_id: userId,
      title: 'Event resubmitted for review',
      message: `Your updated event "${title}" was sent to the admin team for approval.`,
      type: 'info',
      is_read: false,
    })
    if (notificationError) console.error('Event resubmission notification failed:', notificationError)

    await notifyAdministrators(adminSupabase, {
      title: 'Event awaiting approval',
      message: `An updated event proposal needs review: ${title}`,
      type: 'event',
      link: '/info/admin/event-approvals?status=pending',
    })

    return NextResponse.json({ success: true, event: updatedEvent }, {
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Event resubmission failed:', error)
    return NextResponse.json({ success: false, message: 'Unable to resubmit your event right now.' }, { status: 500 })
  }
}
