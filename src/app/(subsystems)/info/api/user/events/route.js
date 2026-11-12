import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const session = getServerSession(request)
  if (!session?.user_id) {
    return NextResponse.json({ success: false, message: 'Please sign in to view your event submissions.' }, {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json({ success: false, message: 'Event submissions are not configured.' }, { status: 500 })
  }

  try {
    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await client
      .from('info_events')
      .select('id, title, description, location, start_date, end_date, start_time, end_time, category, organizer, is_free, ticket_price, status, approval_status, submitted_at, reviewed_at, rejection_reason, published_at')
      .eq('created_by', session.user_id)
      .in('approval_status', ['pending', 'approved', 'rejected'])
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .limit(100)
    if (error) throw error

    return NextResponse.json({ success: true, events: data || [] }, {
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('User event submissions lookup failed:', error)
    const missingModerationSchema = ['42703', 'PGRST204'].includes(error?.code)
      && /approval_status|submitted_at/i.test(`${error?.message || ''} ${error?.details || ''}`)
    return NextResponse.json({
      success: false,
      message: missingModerationSchema
        ? 'Event approval is not configured in the database yet. Apply migration 082_event_admin_approval.sql.'
        : 'Unable to load your event submissions.',
    }, { status: missingModerationSchema ? 503 : 500 })
  }
}
