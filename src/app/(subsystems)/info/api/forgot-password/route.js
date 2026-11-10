// app/(subsystems)/info/api/forgot-password/route.js
import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function genericSuccess() {
  return response({
    success: true,
    message: 'If an account exists for that email, a password reset link will be sent.',
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
    console.error('Password reset service is not configured.')
    return response({ success: false, message: 'Password recovery is temporarily unavailable.' }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch (error) {
    return response({ success: false, message: 'A valid request body is required.' }, 400)
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ success: false, message: 'Enter a valid email address.' }, 400)
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  const clientIp = request.headers.get('x-real-ip')?.trim()
    || forwardedFor?.split(',').at(-1)?.trim()
    || 'unknown'
  const bucketKey = createHmac('sha256', serviceRoleKey).update(clientIp).digest('hex')
  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  try {
    const { data: allowed, error: limitError } = await adminSupabase.rpc('consume_password_reset_rate_limit', {
      p_bucket_key: bucketKey,
      p_window_seconds: 900,
      p_max_requests: 5,
    })
    if (limitError) {
      console.error('Password reset rate-limit check failed:', { code: limitError.code || null })
      return response({ success: false, message: 'Password recovery is temporarily unavailable.' }, 503)
    }
    if (allowed !== true) return genericSuccess()

    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
      || (process.env.NODE_ENV === 'production'
        ? 'https://connect-daet-app.vercel.app'
        : new URL(request.url).origin)
    const appUrl = configuredAppUrl.replace(/\/+$/, '')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/info/reset-password`,
    })

    if (error) {
      console.error('Supabase password reset email request failed:', {
        code: error.code || null,
        status: error.status || null,
      })
      return genericSuccess()
    }

    return genericSuccess()
  } catch (error) {
    console.error('Password reset request failed:', { code: error.code || null, status: error.status || null })
    return response({ success: false, message: 'Password recovery is temporarily unavailable.' }, 503)
  }
}