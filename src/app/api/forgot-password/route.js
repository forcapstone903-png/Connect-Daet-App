// app/api/forgot-password/route.js
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase environment variables are missing')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(request) {
  try {
    const { email } = await request.json()

    // Use Supabase's built-in password reset
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
    })

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      message: 'Password reset email sent! Check your inbox.' 
    })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Something went wrong' 
    }, { status: 500 })
  }
}