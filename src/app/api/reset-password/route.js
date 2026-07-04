// app/api/reset-password/route.js
import { NextResponse } from 'next/server'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      console.error('❌ Supabase is not configured')
      return NextResponse.json(
        { 
          success: false, 
          message: 'Supabase is not configured. Please check environment variables.' 
        },
        { status: 500 }
      )
    }

    const supabase = getSupabase()
    
    // Verify we have a real client
    if (!supabase || !supabase.from) {
      console.error('❌ Supabase client not properly initialized')
      return NextResponse.json(
        { 
          success: false, 
          message: 'Supabase client not available' 
        },
        { status: 500 }
      )
    }

    const { token, email, newPassword } = await request.json()

    // Validate input
    if (!token || !email || !newPassword) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Token, email, and new password are required' 
        },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Password must be at least 6 characters long' 
        },
        { status: 400 }
      )
    }

    console.log('🔄 Resetting password for:', email)

    // Find user with valid reset token
    const { data: user, error: userError } = await supabase
      .from('info_users')
      .select('id, reset_token, reset_token_expires')
      .eq('email', email)
      .eq('reset_token', token)
      .single()

    if (userError || !user) {
      console.error('🔴 User not found with token:', userError)
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid or expired reset token' 
        },
        { status: 400 }
      )
    }

    // Check if token is expired
    const tokenExpires = new Date(user.reset_token_expires)
    if (tokenExpires < new Date()) {
      console.error('🔴 Token expired for user:', user.id)
      return NextResponse.json(
        { 
          success: false, 
          message: 'Reset token has expired. Please request a new one.' 
        },
        { status: 400 }
      )
    }

    // Update password and clear reset token
    const { error: updateError } = await supabase
      .from('info_users')
      .update({
        password: newPassword,
        reset_token: null,
        reset_token_expires: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('🔴 Error updating password:', updateError)
      return NextResponse.json(
        { 
          success: false, 
          message: 'Failed to update password' 
        },
        { status: 500 }  // ✅ Fixed: Changed ) to }
      )
    }

    console.log('✅ Password reset successfully for:', email)

    return NextResponse.json(
      { 
        success: true, 
        message: 'Password has been reset successfully!' 
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('🔴 Reset password API error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Something went wrong',
        details: error.message 
      },
      { status: 500 }
    )
  }
}