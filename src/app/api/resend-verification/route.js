import { NextResponse } from 'next/server'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { maskEmail } from '@/lib/safeLogging'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          error: 'Supabase is not configured. Please check environment variables.',
          details: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
        },
        { status: 500 }
      )
    }

    const supabase = getSupabase()

    if (!supabase || !supabase.auth || typeof supabase.auth.resend !== 'function') {
      return NextResponse.json(
        { error: 'Supabase client not properly initialized' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const email = typeof body?.email === 'string' ? body.email.trim() : ''

    if (!email) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    })

    if (error) {
      console.error('🔴 Verification resend error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to resend verification email' },
        { status: 400 }
      )
    }

    console.log('✅ Verification email resent to:', maskEmail(email))
    return NextResponse.json({
      success: true,
      message: 'A new verification email has been sent.',
    })
  } catch (error) {
    console.error('🔴 Resend verification API error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
