import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
const DELETION_GRACE_PERIOD_DAYS = 30

function missingConfig() {
  return NextResponse.json(
    { success: false, message: 'Account lifecycle actions are not configured.' },
    { status: 500 }
  )
}

function unauthorized() {
  return NextResponse.json({ success: false, message: 'You must be signed in.' }, { status: 401 })
}

function toLifecycle(row) {
  return {
    status: row?.status || 'active',
    accountDeactivatedAt: row?.account_deactivated_at || null,
    deletionRequestedAt: row?.deletion_requested_at || null,
    deletionScheduledFor: row?.deletion_scheduled_for || null,
  }
}

async function getAccount(userId) {
  const { data, error } = await adminSupabase
    .from('info_users')
    .select('status, account_deactivated_at, deletion_requested_at, deletion_scheduled_for')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function GET(request) {
  if (!adminSupabase) return missingConfig()
  const session = getServerSession(request)
  if (!session) return unauthorized()

  try {
    const account = await getAccount(session.user_id)
    if (!account) return NextResponse.json({ success: false, message: 'Account not found.' }, { status: 404 })
    return NextResponse.json({ success: true, lifecycle: toLifecycle(account) })
  } catch (error) {
    console.error('Account lifecycle fetch failed:', error)
    return NextResponse.json({ success: false, message: 'Unable to load account status.' }, { status: 500 })
  }
}

export async function POST(request) {
  if (!adminSupabase) return missingConfig()
  const session = getServerSession(request)
  if (!session) return unauthorized()

  let action
  try {
    ({ action } = await request.json())
  } catch {
    return NextResponse.json({ success: false, message: 'A valid account action is required.' }, { status: 400 })
  }

  if (!['deactivate', 'reactivate', 'schedule_deletion', 'cancel_deletion'].includes(action)) {
    return NextResponse.json({ success: false, message: 'Unsupported account action.' }, { status: 400 })
  }

  try {
    const current = await getAccount(session.user_id)
    if (!current) return NextResponse.json({ success: false, message: 'Account not found.' }, { status: 404 })

    const now = new Date()
    const updates = { updated_at: now.toISOString() }

    if (action === 'deactivate') {
      if (current.deletion_requested_at) {
        return NextResponse.json({ success: false, message: 'Cancel the deletion request before deactivating the account.' }, { status: 409 })
      }
      updates.status = 'suspended'
      updates.account_deactivated_at = now.toISOString()
    }

    if (action === 'reactivate') {
      if (!current.account_deactivated_at || current.deletion_requested_at) {
        return NextResponse.json({ success: false, message: 'This account cannot be reactivated from its current state.' }, { status: 409 })
      }
      updates.status = 'active'
      updates.account_deactivated_at = null
    }

    if (action === 'schedule_deletion') {
      if (current.deletion_requested_at) {
        return NextResponse.json({ success: false, message: 'Account deletion is already scheduled.' }, { status: 409 })
      }
      if (current.account_deactivated_at) {
        return NextResponse.json({ success: false, message: 'Reactivate the account before scheduling deletion.' }, { status: 409 })
      }
      const scheduledFor = new Date(now.getTime() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
      updates.status = 'suspended'
      updates.deletion_requested_at = now.toISOString()
      updates.deletion_scheduled_for = scheduledFor.toISOString()
    }

    if (action === 'cancel_deletion') {
      if (!current.deletion_requested_at) {
        return NextResponse.json({ success: false, message: 'No deletion request is scheduled.' }, { status: 409 })
      }
      updates.status = 'active'
      updates.deletion_requested_at = null
      updates.deletion_scheduled_for = null
    }

    const { error } = await adminSupabase
      .from('info_users')
      .update(updates)
      .eq('id', session.user_id)

    if (error) throw error

    const account = await getAccount(session.user_id)
    return NextResponse.json({ success: true, lifecycle: toLifecycle(account) })
  } catch (error) {
    console.error('Account lifecycle update failed:', error)
    return NextResponse.json({ success: false, message: 'Unable to update account status.' }, { status: 500 })
  }
}
