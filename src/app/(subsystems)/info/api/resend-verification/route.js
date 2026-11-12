import { NextResponse } from 'next/server'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { getAppUrl } from '@/lib/supabaseConfig'
import { maskEmail } from '@/lib/safeLogging'
import { getSettingsClient } from '@/lib/appSettingsServer'
import { clientIp, consumeRateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// The reply is the same whether or not the address is registered, so this
// endpoint cannot be used to discover accounts. Limited per IP and per email.
const GENERIC_SUCCESS = {
  success: true,
  message: 'If this email has an unverified account, a new verification email has been sent.',
}

export async function POST(request) {
  try {
    const supabase = isSupabaseConfigured() ? getSupabase() : null
    if (!supabase || typeof supabase.auth?.resend !== 'function') {
      console.error('Resend verification: Supabase is not configured.')
      return NextResponse.json({ success: false, error: 'Email verification is temporarily unavailable.' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'Valid email is required' }, { status: 400 })
    }

    const adminClient = getSettingsClient()
    const [byIp, byEmail] = await Promise.all([
      consumeRateLimit(adminClient, { scope: 'resend-ip', key: clientIp(request), max: 10, windowSeconds: 3600 }),
      consumeRateLimit(adminClient, { scope: 'resend-email', key: email, max: 3, windowSeconds: 3600 }),
    ])
    if (byIp.unavailable || byEmail.unavailable) {
      return NextResponse.json({ success: false, error: 'Email verification is temporarily unavailable.' }, { status: 503 })
    }
    if (!byIp.allowed || !byEmail.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please wait before trying again.' }, { status: 429 })
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${getAppUrl(request)}/info/confirm` },
    })
    if (error) {
      console.error('Verification resend failed:', { email: maskEmail(email), code: error.code || null, status: error.status || null })
    }
    return NextResponse.json(GENERIC_SUCCESS)
  } catch (error) {
    console.error('Resend verification API error:', { message: error?.message })
    return NextResponse.json({ success: false, error: 'Unable to resend the verification email right now.' }, { status: 500 })
  }
}
