import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { clearSecureSessionCookie, getServerSession } from '@/lib/serverAuth'
import { sendAccountLifecycleEmail } from '@/lib/accountLifecycleEmail'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function missingConfig() {
  return response(
    { success: false, message: 'Account lifecycle actions are not configured.' },
    503
  )
}

function unauthorized() {
  return response({ success: false, message: 'You must be signed in.' }, 401)
}

function toLifecycle(row) {
  const deadline = row?.deletion_scheduled_for ? new Date(row.deletion_scheduled_for) : null
  const remainingDays = deadline
    ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000))
    : null
  return {
    status: row?.status || 'active',
    accountDeactivatedAt: row?.account_deactivated_at || null,
    deletionRequestedAt: row?.deletion_requested_at || null,
    deletionScheduledFor: row?.deletion_scheduled_for || null,
    remainingDays,
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
    if (!account) return response({ success: false, message: 'Account not found.' }, 404)
    return response({ success: true, lifecycle: toLifecycle(account) })
  } catch (error) {
    console.error('Account lifecycle fetch failed:', { code: error.code || null })
    return response({ success: false, message: 'Unable to load account status.' }, 500)
  }
}

export async function POST(request) {
  if (!adminSupabase) return missingConfig()
  const session = getServerSession(request)
  if (!session) return unauthorized()
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return response({ success: false, message: 'Request origin is not allowed.' }, 403)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return response({ success: false, message: 'A valid account action is required.' }, 400)
  }

  const { action, password } = body || {}
  if (!['deactivate', 'reactivate', 'schedule_deletion', 'cancel_deletion'].includes(action)) {
    return response({ success: false, message: 'Unsupported account action.' }, 400)
  }

  if ((action === 'schedule_deletion' || action === 'cancel_deletion')
      && (typeof password !== 'string' || password.length === 0 || password.length > 128)) {
    return response({ success: false, message: 'Enter your current password to confirm this change.' }, 400)
  }

  try {
    const current = await getAccount(session.user_id)
    if (!current) return response({ success: false, message: 'Account not found.' }, 404)

    let verifiedEmail = null
    let verifiedAccessToken = null
    if (action === 'schedule_deletion' || action === 'cancel_deletion') {
      if (!supabaseUrl || !anonKey) return missingConfig()
      const { data: userData, error: accountError } = await adminSupabase.auth.admin.getUserById(session.user_id)
      if (accountError || !userData?.user?.email) {
        console.error('Account lifecycle identity lookup failed:', { code: accountError?.code || null })
        return response({ success: false, message: 'Unable to verify your account. Please try again.' }, 500)
      }

      const authClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
        email: userData.user.email,
        password,
      })
      if (authError || authData?.user?.id !== session.user_id || !authData.session?.access_token) {
        return response({ success: false, message: 'Your current password is incorrect.' }, 401)
      }
      verifiedEmail = userData.user.email
      verifiedAccessToken = authData.session.access_token
    }

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
      const { data: lifecycle, error } = await adminSupabase.rpc('request_account_deletion', {
        p_user_id: session.user_id,
      })
      if (error) throw error
      if (!lifecycle) return response({ success: false, message: 'This account cannot be scheduled for deletion in its current state.' }, 409)

      const authSignOut = await adminSupabase.auth.admin.signOut(verifiedAccessToken, 'global')
      if (authSignOut.error) {
        console.error('Account deletion Auth session revocation failed:', { code: authSignOut.error.code || null })
      }
      const notification = await sendAccountLifecycleEmail(verifiedEmail, 'requested', lifecycle.deletion_scheduled_for)
      const result = response({
        success: true,
        lifecycle: toLifecycle({
          status: 'pending_deletion',
          deletion_requested_at: lifecycle.deletion_requested_at,
          deletion_scheduled_for: lifecycle.deletion_scheduled_for,
        }),
        emailNotificationSent: notification.sent,
      })
      clearSecureSessionCookie(result)
      result.cookies.set('daet_auth_session', '', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
      return result
    }

    if (action === 'cancel_deletion') {
      const { data: lifecycle, error } = await adminSupabase.rpc('cancel_account_deletion', {
        p_user_id: session.user_id,
      })
      if (error) throw error
      if (!lifecycle) return response({ success: false, message: 'The account deletion request cannot be cancelled. It may have expired or already be processing.' }, 409)
      const authSignOut = await adminSupabase.auth.admin.signOut(verifiedAccessToken, 'global')
      if (authSignOut.error) {
        console.error('Account deletion cancellation Auth session revocation failed:', { code: authSignOut.error.code || null })
      }
      const notification = await sendAccountLifecycleEmail(verifiedEmail, 'cancelled')
      return response({
        success: true,
        lifecycle: toLifecycle({ status: 'active' }),
        emailNotificationSent: notification.sent,
      })
    }

    const { error } = await adminSupabase
      .from('info_users')
      .update(updates)
      .eq('id', session.user_id)

    if (error) throw error

    const account = await getAccount(session.user_id)
    return response({ success: true, lifecycle: toLifecycle(account) })
  } catch (error) {
    console.error('Account lifecycle update failed:', { code: error.code || null })
    return response({ success: false, message: 'Unable to update account status.' }, 500)
  }
}
