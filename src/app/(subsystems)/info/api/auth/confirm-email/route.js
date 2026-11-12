import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { publicErrorMessage } from '@/lib/publicError'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  try {
    const { token_hash, type } = await request.json()

    if (typeof token_hash !== 'string' || !token_hash || type !== 'email') {
      return NextResponse.json(
        { success: false, message: 'Missing or invalid email verification token.' },
        { status: 400 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

    if (!url || !anonKey) {
      return NextResponse.json(
        { success: false, message: 'Supabase authentication is not configured.' },
        { status: 500 }
      )
    }

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data: verificationData, error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    })

    if (error) {
      console.error('Email verification error:', error)
      return NextResponse.json(
        { success: false, message: publicErrorMessage(error, 'Unable to verify email.') },
        { status: 400 }
      )
    }

    const verifiedUserId = verificationData?.user?.id
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (verifiedUserId && serviceRoleKey) {
      const adminSupabase = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { error: profileError } = await adminSupabase
        .from('info_users')
        .update({ email_verified: true, updated_at: new Date().toISOString() })
        .eq('id', verifiedUserId)

      if (profileError) {
        console.error('Email verification profile update error:', profileError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully.'
    })
  } catch (error) {
    console.error('Confirm email API error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 }
    )
  }
}
