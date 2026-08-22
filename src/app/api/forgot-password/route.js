// app/api/forgot-password/route.js
import { NextResponse } from 'next/server'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { maskEmail } from '@/lib/safeLogging'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    if (!isSupabaseConfigured()) {
      console.error('❌ Supabase is not configured')
      return NextResponse.json(
        {
          error: 'Supabase is not configured. Please check environment variables.',
          details: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
        },
        { status: 500 }
      )
    }

    const supabase = getSupabase()

    if (!supabase || !supabase.auth || !supabase.auth.resetPasswordForEmail) {
      console.error('❌ Supabase client not properly initialized')
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_VERCEL_URL ||
      'http://localhost:3000'

    const redirectUrl = `${appUrl}/reset-password`

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    })

    if (error) {
      console.error('🔴 Password reset error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to send reset email' },
        { status: 400 }
      )
    }

    console.log('✅ Password reset email sent to:', maskEmail(email))
    return NextResponse.json({
      success: true,
      message: 'Password reset email sent successfully'
    })
  } catch (error) {
    console.error('🔴 API error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message
      },
      { status: 500 }
    )
  }
}