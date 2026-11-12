import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession, setSecureSessionCookie } from '@/lib/serverAuth'
import { describePasswordPolicy, isPasswordValid } from '@/lib/passwordPolicy'
import { getAppSetting, getPasswordPolicy } from '@/lib/appSettingsServer'
import { verifyPasswordWithLockout } from '@/lib/loginLockout'
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

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return response({ success: false, message: 'Password management is not configured.' }, 503)
  }

  const session = getServerSession(request)
  if (!session?.user_id) {
    return response({ success: false, message: 'Please sign in again to change your password.' }, 401)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  if (!supabaseUrl || !anonKey) {
    return response({ success: false, message: 'Password management is not configured.' }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return response({ success: false, message: 'A valid request body is required.' }, 400)
  }

  const { currentPassword, newPassword, signOutOthers } = body || {}
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return response({ success: false, message: 'Enter your current password and a new password.' }, 400)
  }
  const passwordPolicy = await getPasswordPolicy()
  if (!isPasswordValid(newPassword, passwordPolicy)) {
    return response({ success: false, message: describePasswordPolicy(passwordPolicy) }, 400)
  }
  if (currentPassword === newPassword) {
    return response({ success: false, message: 'Your new password must be different from your current password.' }, 400)
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  try {
    const { data: userResult, error: userError } = await adminSupabase.auth.admin.getUserById(session.user_id)
    const user = userResult?.user
    if (userError || !user?.email) {
      console.error('Password change account lookup failed:', { code: userError?.code || null })
      return response({ success: false, message: 'Unable to verify this account. Please try again.' }, 500)
    }

    const verification = await verifyPasswordWithLockout({
      adminClient: adminSupabase,
      authClient: supabase,
      email: user.email,
      password: currentPassword,
      security: await getAppSetting('security', adminSupabase),
    })
    if (verification.locked) {
      return response({ success: false, message: 'Too many incorrect password attempts. Try again later.' }, 429)
    }
    if (!verification.ok || verification.authData.user.id !== session.user_id) {
      return response({ success: false, message: 'Your current password is incorrect.' }, 401)
    }

    let activeAccessToken = null
    if (signOutOthers === true) {
      const authorization = request.headers.get('authorization') || ''
      activeAccessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || null
      if (!activeAccessToken) {
        return response({ success: false, message: 'Your active session could not be verified. Refresh the page and try again.' }, 401)
      }

      const { data: activeUser, error: activeSessionError } = await supabase.auth.getUser(activeAccessToken)
      if (activeSessionError || activeUser?.user?.id !== session.user_id) {
        return response({ success: false, message: 'Your active session could not be verified. Sign in again and retry.' }, 401)
      }
    }

    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(session.user_id, {
      password: newPassword,
    })
    if (updateError) {
      console.error('Password change failed:', { code: updateError.code || null, status: updateError.status || null })
      return response({ success: false, message: 'Unable to update your password. Please try again.' }, 502)
    }

    let otherSessionsRevoked = null
    let sessionVersion = null
    if (activeAccessToken) {
      const { error: revokeError } = await adminSupabase.auth.admin.signOut(activeAccessToken, 'others')
      if (revokeError) {
        console.error('Other-session revocation failed:', {
          code: revokeError.code || null,
          status: revokeError.status || null,
        })
      }

      try {
        sessionVersion = await revokeUserSessions(createSessionAdminClient(), session.user_id)
      } catch (sessionVersionError) {
        console.error('Other app-session revocation failed:', { code: sessionVersionError.code || null })
      }

      otherSessionsRevoked = !revokeError && Number.isSafeInteger(sessionVersion)
    }

    const notification = await sendPasswordSecurityEmail(user.email, 'changed')
    const result = response({
      success: true,
      emailNotificationSent: notification.sent,
      otherSessionsRevoked,
    })
    if (sessionVersion !== null) {
      const remainingTtl = Math.max(1, Number(session.expires_at) - Math.floor(Date.now() / 1000))
      setSecureSessionCookie(
        result,
        { id: session.user_id, user_type: session.role },
        false,
        sessionVersion,
        remainingTtl,
        { perms: session.perms, idleSeconds: Number(session.idle) || 0 }
      )
    }
    return result
  } catch (error) {
    console.error('Password change request failed:', { code: error.code || null, status: error.status || null })
    return response({ success: false, message: 'Unable to change your password right now.' }, 500)
  }
}
