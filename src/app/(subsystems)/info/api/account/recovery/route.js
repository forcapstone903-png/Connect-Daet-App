import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendAccountLifecycleEmail } from '@/lib/accountLifecycleEmail'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function POST(request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return response({ success: false, message: 'Request origin is not allowed.' }, 403)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ success: false, message: 'Account recovery is temporarily unavailable.' }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return response({ success: false, message: 'Enter your email and current password.' }, 400)
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length === 0 || password.length > 128) {
    return response({ success: false, message: 'Enter a valid email address and password.' }, 400)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  try {
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password })
    if (authError || !authData?.user?.id || !authData.session?.access_token) {
      return response({ success: false, message: 'The email or password is incorrect.' }, 401)
    }

    const { data: account, error: accountError } = await adminSupabase
      .from('info_users')
      .select('status, deletion_scheduled_for')
      .eq('id', authData.user.id)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account || account.status !== 'pending_deletion') {
      return response({ success: false, message: 'There is no active deletion request to cancel.' }, 409)
    }

    const { data: cancelled, error: cancelError } = await adminSupabase.rpc('cancel_account_deletion', {
      p_user_id: authData.user.id,
    })
    if (cancelError) throw cancelError
    if (!cancelled) {
      return response({ success: false, message: 'The grace period has ended or deletion is already being processed.' }, 409)
    }

    const { error: signOutError } = await adminSupabase.auth.admin.signOut(authData.session.access_token, 'global')
    if (signOutError) {
      console.error('Account recovery Auth session revocation failed:', { code: signOutError.code || null })
    }

    const notification = await sendAccountLifecycleEmail(authData.user.email || email, 'cancelled')
    return response({
      success: true,
      emailNotificationSent: notification.sent,
      message: 'Your deletion request was cancelled and your account is active again. Sign in to continue.',
    })
  } catch (error) {
    console.error('Account recovery failed:', { code: error.code || null })
    return response({ success: false, message: 'Unable to restore the account right now. Please try again.' }, 500)
  }
}
