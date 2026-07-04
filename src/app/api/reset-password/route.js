// app/api/reset-password/route.js
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  try {
    const { token, email, newPassword } = await request.json()

    // Find user with valid reset token
    const { data: user, error } = await supabase
      .from('info_users')
      .select('id, reset_token, reset_token_expires')
      .eq('email', email)
      .eq('reset_token', token)
      .single()

    if (error || !user) {
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid or expired reset token' 
      }, { status: 400 })
    }

    // Check if token is expired
    const tokenExpires = new Date(user.reset_token_expires)
    if (tokenExpires < new Date()) {
      return NextResponse.json({ 
        success: false, 
        message: 'Reset token has expired. Please request a new one.' 
      }, { status: 400 })
    }

    // Update password and clear reset token
    const { error: updateError } = await supabase
      .from('info_users')
      .update({
        password: newPassword,
        reset_token: null,
        reset_token_expires: null
      })
      .eq('id', user.id)

    if (updateError) throw updateError

    return NextResponse.json({ 
      success: true, 
      message: 'Password has been reset successfully!' 
    })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ 
      success: false, 
      message: 'Something went wrong' 
    }, { status: 500 })
  }
}