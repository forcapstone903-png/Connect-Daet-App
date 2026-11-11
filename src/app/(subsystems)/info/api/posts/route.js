import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { notifyFollowers } from '@/lib/notificationAudience'
import { getActivePublishingRestriction } from '@/lib/contentRestrictions'
import { notifyAdministrators } from '@/lib/adminNotifications'

export async function POST(request) {
  try {
    const session = getServerSession(request)
    const userId = session?.user_id || null

    if (!userId) {
      return NextResponse.json({ success: false, message: 'Please sign in to create content.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: 'A content submission is required.' }, { status: 400 })
    }
    const shareType = String(body.shareType || '').trim().toLowerCase()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: 'Post service is not configured.' }, { status: 500 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

    if (shareType === 'forum' || shareType === 'event') {
      const restriction = await getActivePublishingRestriction(adminSupabase, userId)
      if (restriction) {
        return NextResponse.json({ success: false, message: 'Your account is currently restricted from publishing content.' }, { status: 403 })
      }
    }

    if (shareType === 'forum') {
      const title = String(body.forumForm?.title || '').trim()
      const content = String(body.forumForm?.content || '').trim()
      const tags = Array.isArray(body.forumForm?.tags) ? body.forumForm.tags.filter(Boolean) : []
      const attachments = Array.isArray(body.forumForm?.attachments) ? body.forumForm.attachments.filter(Boolean) : []
      const location = String(body.forumForm?.location || '').trim()

      if (!title || !content) {
        return NextResponse.json({ success: false, message: 'Please add a discussion title and message.' }, { status: 400 })
      }

      const extendedPayload = {
        title,
        content,
        status: 'published',
        created_by: userId,
        tags,
        image_urls: attachments,
        location: location || null,
      }
      let warning
      let { data, error } = await adminSupabase
        .from('forum_threads')
        .insert(extendedPayload)
        .select('id')
        .single()

      const optionalColumnMissing = error && (
        error.code === '42703'
        || error.code === 'PGRST204'
        || /column .* does not exist|could not find the .* column/i.test(error.message || '')
      )
      if (optionalColumnMissing) {
        warning = 'The discussion was saved, but some optional fields were added to its message because the database migration is missing.'
        const footer = [
          tags.length ? `Topics: ${tags.join(', ')}` : '',
          location ? `Location: ${location}` : '',
          attachments.length ? `Attachments: ${attachments.join('\n')}` : '',
        ].filter(Boolean).join('\n')
        const fallback = await adminSupabase
          .from('forum_threads')
          .insert({
            title,
            content: [content, footer].filter(Boolean).join('\n\n'),
            status: 'published',
            created_by: userId,
          })
          .select('id')
          .single()
        data = fallback.data
        error = fallback.error
      }

      if (error) {
        return NextResponse.json({ success: false, message: error.message || 'Unable to create forum discussion.' }, { status: 500 })
      }

      await notifyFollowers(adminSupabase, {
        authorId: userId,
        type: 'forum',
        link: `/info/user/forums/${data.id}`,
        postId: data.id,
        title: 'New forum discussion',
        actionText: 'started a new discussion',
        subject: title,
      })

      return NextResponse.json({ success: true, id: data?.id, destination: '/info/user/dashboard', warning })
    }

    if (shareType === 'event') {
      const title = String(body.eventForm?.title || '').trim()
      const description = String(body.eventForm?.description || '').trim()
      const startDate = String(body.eventForm?.start_date || '').trim()
      const endDate = String(body.eventForm?.end_date || '').trim()
      const startTime = String(body.eventForm?.start_time || '').trim()
      const endTime = String(body.eventForm?.end_time || '').trim()
      const location = String(body.eventForm?.location || '').trim()
      const category = String(body.eventForm?.category || '').trim()
      const organizer = String(body.eventForm?.organizer || '').trim()
      const isFree = body.eventForm?.is_free === true
      const rawTicketPrice = body.eventForm?.ticket_price
      const ticketPrice = Number(rawTicketPrice)

      if (typeof body.eventForm?.is_free !== 'boolean') {
        return NextResponse.json({ success: false, message: 'Choose whether the event is free or ticketed.' }, { status: 400 })
      }
      if (!title || !description || !startDate) {
        return NextResponse.json({ success: false, message: 'Please add an event title, description, and date.' }, { status: 400 })
      }
      if (title.length > 180 || description.length > 10000 || location.length > 240 || organizer.length > 180) {
        return NextResponse.json({ success: false, message: 'One or more event fields exceed the allowed length.' }, { status: 400 })
      }
      const isValidDate = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
        const parsed = new Date(`${value}T00:00:00.000Z`)
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      }
      if (!isValidDate(startDate) || (endDate && !isValidDate(endDate))) {
        return NextResponse.json({ success: false, message: 'Enter valid event dates.' }, { status: 400 })
      }
      const isValidTime = (value) => {
        if (!value) return true
        const match = /^(\d{2}):(\d{2})$/.exec(value)
        return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59)
      }
      if (!isValidTime(startTime) || !isValidTime(endTime)) {
        return NextResponse.json({ success: false, message: 'Enter valid event times.' }, { status: 400 })
      }
      if (endDate && endDate < startDate) {
        return NextResponse.json({ success: false, message: 'The event end date cannot be before its start date.' }, { status: 400 })
      }
      if (!['festival', 'concert', 'exhibition', 'workshop', 'sports', 'cultural'].includes(category)) {
        return NextResponse.json({ success: false, message: 'Choose a valid event category.' }, { status: 400 })
      }
      if (!isFree && (rawTicketPrice === undefined || rawTicketPrice === null || String(rawTicketPrice).trim() === '' || !Number.isFinite(ticketPrice) || ticketPrice < 0)) {
        return NextResponse.json({ success: false, message: 'Enter a valid ticket price.' }, { status: 400 })
      }

      const { data, error } = await adminSupabase
        .from('info_events')
        .insert({
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
          published_at: null,
          created_by: userId,
        })
        .select('id, title, approval_status, submitted_at')
        .single()

      if (error) {
        console.error('Event submission failed:', error)
        const missingApprovalColumn = ['42703', 'PGRST204'].includes(error.code)
          && /approval_status|submitted_at/i.test(`${error.message || ''} ${error.details || ''}`)
        return NextResponse.json({
          success: false,
          message: missingApprovalColumn
            ? 'Event approval is not configured in the database yet. Apply migration 082_event_admin_approval.sql and retry.'
            : 'Unable to submit your event for approval.',
        }, { status: missingApprovalColumn ? 503 : 500 })
      }

      const { error: notificationError } = await adminSupabase
        .from('info_notifications')
        .insert({
          user_id: userId,
          title: 'Event submitted for review',
          message: `Your event "${title}" was sent to the admin team for approval.`,
          type: 'info',
          is_read: false,
        })
      if (notificationError) console.error('Event submission notification failed:', notificationError)

      await notifyAdministrators(adminSupabase, {
        title: 'Event awaiting approval',
        message: `A new event proposal needs review: ${title}`,
        type: 'event',
        link: '/info/admin/event-approvals?status=pending',
      })

      return NextResponse.json({
        success: true,
        id: data.id,
        approval_status: data.approval_status,
        submitted_at: data.submitted_at,
        destination: '/info/user/event-submissions',
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    if (shareType === 'complaint') {
      const title = String(body.complaintForm?.title || 'Complaint submission').trim()
      const message = String(body.complaintForm?.message || '').trim()
      const category = String(body.complaintForm?.category || '').trim()
      const images = Array.isArray(body.complaintForm?.images) ? body.complaintForm.images : []

      if (!message) {
        return NextResponse.json({ success: false, message: 'Please add your complaint message.' }, { status: 400 })
      }

      const { data, error } = await adminSupabase
        .from('info_inquiries')
        .insert({
          user_id: userId,
          title,
          message,
          category,
          image_urls: images,
          status: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (error) {
        return NextResponse.json({ success: false, message: error.message || 'Unable to submit complaint.' }, { status: 500 })
      }

      const { error: notificationError } = await adminSupabase
        .from('info_notifications')
        .insert({
          user_id: userId,
          title: 'Complaint submitted',
          message: 'Your complaint has been logged and is being reviewed.',
          type: 'warning',
          is_read: false,
        })

      if (notificationError) {
        console.error('Complaint notification insert failed:', notificationError)
      }

      await notifyAdministrators(adminSupabase, {
        title: 'New complaint received',
        message: `A user submitted a complaint: ${title}`,
        type: 'warning',
        link: '/info/admin/feedback',
      })

      return NextResponse.json({ success: true, id: data?.id, destination: '/info/user/feedback' })
    }

    if (shareType === 'feedback') {
      const title = String(body.feedbackForm?.title || 'General feedback').trim()
      const message = String(body.feedbackForm?.message || '').trim()
      const category = String(body.feedbackForm?.category || '').trim()
      const rating = Number(body.feedbackForm?.rating || 0)
      const images = Array.isArray(body.feedbackForm?.images) ? body.feedbackForm.images.filter(Boolean) : []
      const location = String(body.feedbackForm?.location || '').trim()

      if (!message) {
        return NextResponse.json({ success: false, message: 'Please add your feedback message.' }, { status: 400 })
      }

      const extendedPayload = {
        user_id: userId,
        title,
        message,
        category,
        rating,
        image_urls: images,
        location: location || null,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      let warning
      let { data, error } = await adminSupabase
        .from('info_feedback')
        .insert(extendedPayload)
        .select('id')
        .single()

      const optionalColumnMissing = error && (
        error.code === '42703'
        || error.code === 'PGRST204'
        || /column .* does not exist|could not find the .* column/i.test(error.message || '')
      )
      if (optionalColumnMissing) {
        warning = 'Feedback was saved, but the photo or location was added to the message because the database migration is missing.'
        const details = [
          location ? `Location: ${location}` : '',
          images.length ? `Photos: ${images.join(', ')}` : '',
        ].filter(Boolean).join('\n')
        const fallback = await adminSupabase
          .from('info_feedback')
          .insert({
            user_id: userId,
            title,
            message: [message, details].filter(Boolean).join('\n\n'),
            category,
            rating,
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        data = fallback.data
        error = fallback.error
      }

      if (error) {
        return NextResponse.json({ success: false, message: error.message || 'Unable to submit feedback.' }, { status: 500 })
      }

      const { error: notificationError } = await adminSupabase
        .from('info_notifications')
        .insert({
          user_id: userId,
          title: 'Feedback received',
          message: 'Thanks for sharing your feedback. Our team will review it soon.',
          type: 'info',
          is_read: false,
        })

      if (notificationError) {
        console.error('Feedback notification insert failed:', notificationError)
      }

      await notifyAdministrators(adminSupabase, {
        title: 'New user feedback',
        message: `A user submitted feedback: ${title}`,
        type: 'info',
        link: '/info/admin/feedback',
      })

      return NextResponse.json({ success: true, id: data?.id, destination: '/info/user/feedback', warning })
    }

    return NextResponse.json({ success: false, message: 'Unsupported post type.' }, { status: 400 })
  } catch (error) {
    console.error('Create post route error:', error)
    return NextResponse.json({ success: false, message: error?.message || 'Unable to create content.' }, { status: 500 })
  }
}
