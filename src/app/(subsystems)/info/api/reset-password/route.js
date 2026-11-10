import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isPasswordValid } from '@/lib/passwordPolicy'
import { sendPasswordSecurityEmail } from '@/lib/securityEmail'
import { createSessionAdminClient, revokeUserSessions } from '@/lib/sessionVersions'

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
    return response({ success: false, message: 'Password recovery is temporarily unavailable.' }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return response({ success: false, message: 'A valid request body is required.' }, 400)
  }

  const newPassword = body?.newPassword
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (typeof newPassword !== 'string' || !newPassword || !accessToken) {
    return response({ success: false, message: 'The reset link is invalid or expired. Request a new link.' }, 400)
  }
  if (newPassword.length > 128 || !isPasswordValid(newPassword)) {
    return response({ success: false, message: 'Meet all password requirements before saving.' }, 400)
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  try {
    const { data: userResult, error: userError } = await supabase.auth.getUser(accessToken)
    const user = userResult?.user
    if (userError || !user?.id || !user.email) {
      return response({ success: false, message: 'The reset link is invalid or expired. Request a new link.' }, 400)
    }

    const tokenHash = createHmac('sha256', serviceRoleKey).update(accessToken).digest('hex')
    const { data: tokenAccepted, error: tokenError } = await adminSupabase.rpc('consume_password_reset_token', {
      p_token_hash: tokenHash,
    })
    if (tokenError) {
      console.error('Password reset token validation failed:', { code: tokenError.code || null })
      return response({ success: false, message: 'Password recovery is temporarily unavailable.' }, 503)
    }
    if (tokenAccepted !== true) {
      return response({ success: false, message: 'This reset link has already been used. Request a new link.' }, 400)
    }

    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })
    if (updateError) {
      console.error('Password reset update failed:', { code: updateError.code || null, status: updateError.status || null })
      return response({ success: false, message: 'Unable to reset your password. Request a new link and try again.' }, 502)
    }

    const { error: revokeError } = await adminSupabase.auth.admin.signOut(accessToken, 'global')
    if (revokeError) {
      console.error('Password reset session revocation failed:', {
        code: revokeError.code || null,
        status: revokeError.status || null,
      })
    }

    let appSessionsRevoked = false
    try {
      await revokeUserSessions(createSessionAdminClient(), user.id)
      appSessionsRevoked = true
    } catch (sessionVersionError) {
      console.error('Password reset app-session revocation failed:', { code: sessionVersionError.code || null })
    }

    const notification = await sendPasswordSecurityEmail(user.email, 'reset')
    return response({
      success: true,
      emailNotificationSent: notification.sent,
      sessionsRevoked: !revokeError && appSessionsRevoked,
    })
  } catch (error) {
    console.error('Password reset request failed:', { code: error.code || null, status: error.status || null })
    return response({ success: false, message: 'Unable to reset your password right now.' }, 500)
  }
}
