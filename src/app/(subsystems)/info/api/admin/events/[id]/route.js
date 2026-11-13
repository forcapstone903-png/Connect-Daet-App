import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request, { params }) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json({ success: false, message: 'Event moderation is not configured.' }, { status: 500 })
  }

  const eventId = (await params)?.id
  if (!eventId) {
    return NextResponse.json({ success: false, message: 'An event is required.' }, { status: 400 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'A moderation decision is required.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: 'A moderation decision is required.' }, { status: 400 })
  }

  const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!decision || (decision === 'rejected' && !reason)) {
    return NextResponse.json({ success: false, message: 'Choose approve or provide a rejection reason.' }, { status: 400 })
  }
  if (reason.length > 1000) {
    return NextResponse.json({ success: false, message: 'Rejection reasons must be 1,000 characters or fewer.' }, { status: 400 })
  }

  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await client.rpc('moderate_info_event', {
    p_event_id: eventId,
    p_reviewer_id: authorization.session.user_id,
    p_decision: decision,
    p_reason: reason || null,
  })

  if (error) {
    console.error('Event moderation failed:', error.message)
    const status = /not pending|not found/i.test(error.message || '') ? 409 : 500
    return NextResponse.json({
      success: false,
      message: status === 409
        ? 'This event is no longer pending review. Refresh the list and try again.'
        : 'Unable to save the moderation decision.',
    }, { status })
  }

  return NextResponse.json({ success: true, event: data }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
