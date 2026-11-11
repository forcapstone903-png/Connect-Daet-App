import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { sendAccountLifecycleEmail } from '@/lib/accountLifecycleEmail'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const runtime = 'nodejs'

function missingConfig() {
  return NextResponse.json(
    { success: false, message: 'Server is not configured for user administration.' },
    { status: 500 }
  )
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  try {
    const { data, error } = await adminSupabase
      .from('info_users')
      .select('id, email, full_name, user_type, status, profile_image_url, points, last_login, is_online, created_at, updated_at, deletion_scheduled_for')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Admin users fetch error:', error)
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, users: data || [] })
  } catch (error) {
    console.error('Admin users route error:', error)
    return NextResponse.json(
      { success: false, message: error.message || 'Unable to load users right now.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json(
      { success: false, message: 'Cross-origin requests are not allowed.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  try {
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, message: 'A valid JSON request body is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    const targetUserId = typeof body?.userId === 'string' ? body.userId : ''
    if (!UUID_PATTERN.test(targetUserId)) {
      return NextResponse.json(
        { success: false, message: 'A valid user ID is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const { data: target, error: targetError } = await adminSupabase
      .from('info_users')
      .select('id, email, user_type, status, deletion_requested_at, deletion_scheduled_for')
      .eq('id', targetUserId)
      .maybeSingle()

    if (targetError) {
      console.error('Admin account deletion lookup failed:', targetError)
      return NextResponse.json(
        { success: false, message: 'Unable to verify the selected account.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    if (!target) {
      return NextResponse.json(
        { success: false, message: 'The selected account was not found.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    if (['admin', 'administrator', 'moderator'].includes(String(target.user_type).toLowerCase())) {
      return NextResponse.json(
        { success: false, message: 'Administrator and moderator accounts cannot be deleted here.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    if (target.status === 'pending_deletion' || target.deletion_requested_at || target.deletion_scheduled_for) {
      return NextResponse.json(
        { success: false, message: 'This account already has a deletion scheduled.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const { data: schedule, error: scheduleError } = await adminSupabase.rpc(
      'schedule_admin_account_deletion',
      { p_admin_user_id: session.user_id, p_target_user_id: targetUserId }
    )
    if (scheduleError) {
      console.error('Admin account deletion scheduling failed:', scheduleError)
      return NextResponse.json(
        { success: false, message: 'Unable to schedule account deletion right now.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    if (!schedule) {
      return NextResponse.json(
        { success: false, message: 'The account could not be scheduled for deletion. Refresh and try again.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    let emailNotificationSent = false
    if (target.email) {
      try {
        const emailResult = await sendAccountLifecycleEmail(
          target.email,
          'requested',
          schedule.scheduled_for,
          { gracePeriodDays: 15 }
        )
        emailNotificationSent = emailResult.sent
      } catch (emailError) {
        console.error('Admin deletion notification failed:', emailError)
      }
    }

    return NextResponse.json(
      {
        success: true,
        scheduledFor: schedule.scheduled_for,
        emailNotificationSent,
        message: 'Account access has been revoked and permanent deletion is scheduled after a 15-day grace period.',
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Admin account deletion route error:', error)
    return NextResponse.json(
      { success: false, message: 'Unable to schedule account deletion right now.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
