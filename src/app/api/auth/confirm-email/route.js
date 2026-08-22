import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAuthConfig } from '@/lib/supabaseConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  try {
    const { token_hash, type } = await request.json()

    if (!token_hash || !type) {
      return NextResponse.json(
        { success: false, message: 'Missing verification token or type.' },
        { status: 400 }
      )
    }

    const { url, key } = getSupabaseAuthConfig()

    if (!url || !key) {
      return NextResponse.json(
        { success: false, message: 'Supabase authentication is not configured.' },
        { status: 500 }
      )
    }

    const supabase = createClient(url, key)
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    })

    if (error) {
      console.error('Email verification error:', error)
      return NextResponse.json(
        { success: false, message: error.message || 'Unable to verify email.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully.'
    })
  } catch (error) {
    console.error('Confirm email API error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}
