import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { notifyContentAuthorsOfDeletion } from '@/lib/contentDeletionNotifications.mjs'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) {
    return NextResponse.json({ success: false, message: 'Event moderation is not configured.' }, { status: 500 })
  }

  const params = new URL(request.url).searchParams
  try {
    const [total, pending, approved, rejected] = await Promise.all(
      ['all', 'pending', 'approved', 'rejected'].map(async (status) => {
        let query = client.from('info_events').select('id', { count: 'exact', head: true })
        if (status !== 'all') query = query.eq('approval_status', status)
        if (status === 'approved') query = query.eq('status', 'published')
        const { count, error } = await query
        if (error) throw error
        return count || 0
      })
    )
    const stats = { total, pending, approved, rejected }

    if (params.get('view') === 'history') {
      const { data, error } = await client
        .from('event_moderation_history')
        .select('id, event_id, event_title, event_author_id, reviewed_by, action, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error

      const userIds = [...new Set((data || []).flatMap((entry) => [entry.event_author_id, entry.reviewed_by]).filter(Boolean))]
      const { data: users, error: usersError } = userIds.length
        ? await client.from('info_users').select('id, full_name, email').in('id', userIds)
        : { data: [], error: null }
      if (usersError) throw usersError
      const usersById = new Map((users || []).map((user) => [user.id, user]))
      return NextResponse.json({
        success: true,
        history: (data || []).map((entry) => ({
          ...entry,
          author: usersById.get(entry.event_author_id) || null,
          reviewer: usersById.get(entry.reviewed_by) || null,
        })),
        stats,
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const approvalStatus = params.get('status') || 'pending'
    if (!['all', 'pending', 'approved', 'rejected'].includes(approvalStatus)) {
      return NextResponse.json({ success: false, message: 'Invalid event approval status.' }, { status: 400 })
    }
    const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1)
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(params.get('pageSize') || '10', 10) || 10))
    const search = (params.get('search') || '').trim().slice(0, 120)

    let query = client
      .from('info_events')
      .select('id, title, description, location, venue, start_date, end_date, start_time, end_time, category, organizer, is_free, ticket_price, featured_image, images, status, approval_status, submitted_at, reviewed_at, reviewed_by, rejection_reason, created_by, created_at, published_at', { count: 'exact' })
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (approvalStatus !== 'all') query = query.eq('approval_status', approvalStatus)
    if (approvalStatus === 'approved') query = query.eq('status', 'published')
    if (search) query = query.ilike('title', `%${search}%`)

    const { data, count, error } = await query
    if (error) throw error
    const userIds = [...new Set((data || []).flatMap((event) => [event.created_by, event.reviewed_by]).filter(Boolean))]
    const { data: users, error: usersError } = userIds.length
      ? await client.from('info_users').select('id, full_name, email').in('id', userIds)
      : { data: [], error: null }
    if (usersError) throw usersError
    const usersById = new Map((users || []).map((user) => [user.id, user]))

    return NextResponse.json({
      success: true,
      events: (data || []).map((event) => ({
        ...event,
        author: usersById.get(event.created_by) || null,
        reviewer: usersById.get(event.reviewed_by) || null,
      })),
      pagination: { page, pageSize, total: count || 0, pages: Math.ceil((count || 0) / pageSize) },
      stats,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Admin event moderation list failed:', error)
    const missingModerationSchema = ['42703', 'PGRST204', '42P01'].includes(error?.code)
      && /approval_status|event_moderation_history/i.test(`${error?.message || ''} ${error?.details || ''}`)
    return NextResponse.json({
      success: false,
      message: missingModerationSchema
        ? 'Event approval is not configured in the database yet. Apply migration 082_event_admin_approval.sql.'
        : 'Unable to load event moderation data.',
    }, { status: missingModerationSchema ? 503 : 500 })
  }
}

export async function DELETE(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) {
    return NextResponse.json({ success: false, message: 'Event moderation is not configured.' }, { status: 500 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Select at least one event to delete.' }, { status: 400 })
  }

  const ids = [...new Set(Array.isArray(body?.ids) ? body.ids : [])]
  if (!ids.length || ids.length > 200 || ids.some((id) => !isValidUuid(id))) {
    return NextResponse.json({ success: false, message: 'Select between 1 and 200 valid events.' }, { status: 400 })
  }

  try {
    let query = client.from('info_events').delete().in('id', ids)
    if (String(authorization.session.role || '').trim().toLowerCase() === 'tourism_officer') {
      query = query.eq('approval_status', 'approved')
    }

    const { data: deleted, error } = await query.select('id, title, created_by')
    if (error) throw error
    if (!deleted?.length) {
      return NextResponse.json({ success: false, message: 'No selected event is available for deletion.' }, { status: 404 })
    }

    const notifications = await notifyContentAuthorsOfDeletion(client, deleted.map((event) => ({
      authorId: event.created_by,
      actorId: authorization.session.user_id,
      contentType: 'event',
      contentTitle: event.title,
    })))
    const skipped = ids.length - deleted.length

    return NextResponse.json({
      success: true,
      deleted: deleted.length,
      skipped,
      skippedWarning: skipped
        ? 'Some selected events were unavailable or not permitted for your role.'
        : null,
      notificationWarning: notifications.warning,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Admin event deletion failed:', error)
    return NextResponse.json({ success: false, message: 'Unable to delete the selected event(s).' }, { status: 500 })
  }
}
