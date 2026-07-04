// app/api/forgot-password/route.js
import { NextResponse } from 'next/server'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

// Prevent static generation during build
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    // Check if Supabase is configured
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
    
    // Verify we have a real client (not mock)
    if (!supabase || !supabase.auth || !supabase.auth.resetPasswordForEmail) {
      console.error('❌ Supabase client not properly initialized')
      return NextResponse.json(
        { error: 'Supabase client not properly initialized' },
        { status: 500 }
      )
    }

    const { email } = await request.json()
    
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      )
    }

    // Get the app URL from environment
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.NEXT_PUBLIC_VERCEL_URL || 
                   'https://connect-daet-app.pages.dev'
    
    // Send password reset email
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/reset-password`,
    })

    if (error) {
      console.error('🔴 Password reset error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to send reset email' },
        { status: 400 }
      )
    }

    console.log('✅ Password reset email sent to:', email)
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