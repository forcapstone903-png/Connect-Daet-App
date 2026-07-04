import { NextResponse } from 'next/server'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  console.log('📝 ====== REGISTRATION API CALLED ======')
  
  try {
    // Check if Supabase is configured
    const configured = isSupabaseConfigured()
    console.log('🔍 Supabase Configured:', configured)
    
    if (!configured) {
      console.error('❌ Supabase is NOT configured')
      return NextResponse.json(
        { 
          success: false,
          message: 'Supabase is not configured. Please check environment variables.'
        },
        { status: 500 }
      )
    }

    // Get Supabase client
    const supabase = getSupabase()
    console.log('🔍 Supabase client obtained:', !!supabase)
    
    if (!supabase) {
      console.error('❌ Failed to get Supabase client')
      return NextResponse.json(
        { 
          success: false,
          message: 'Failed to initialize Supabase client' 
        },
        { status: 500 }
      )
    }

    // Verify client has required methods
    if (!supabase.auth || typeof supabase.auth.signUp !== 'function') {
      console.error('❌ Supabase client missing auth methods')
      return NextResponse.json(
        { 
          success: false,
          message: 'Supabase client not properly initialized' 
        },
        { status: 500 }
      )
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError)
      return NextResponse.json(
        { 
          success: false,
          message: 'Invalid request body' 
        },
        { status: 400 }
      )
    }

    const { full_name, email, password, user_type } = body
    
    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { 
          success: false,
          message: 'Email and password are required' 
        },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { 
          success: false,
          message: 'Password must be at least 6 characters long' 
        },
        { status: 400 }
      )
    }

    console.log('📝 Attempting to register user:', email)

    // Register user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        data: {
          full_name: full_name || '',
          user_type: user_type || 'tourist',
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://connect-daet-app.vercel.app'}/login`,
      },
    })

    if (authError) {
      console.error('🔴 Auth registration error:', authError)
      
      // Handle specific error cases
      let errorMessage = authError.message
      if (authError.message.includes('User already registered')) {
        errorMessage = 'This email is already registered. Please login instead.'
      } else if (authError.message.includes('Password should be at least')) {
        errorMessage = 'Password must be at least 6 characters long.'
      } else if (authError.message.includes('Invalid API key')) {
        errorMessage = 'Invalid API key. Please try again or contact support.'
      }
      
      return NextResponse.json(
        { 
          success: false,
          message: errorMessage,
          code: authError.code
        },
        { status: 400 }
      )
    }

    if (!authData?.user) {
      console.error('🔴 No user data returned from auth')
      return NextResponse.json(
        { 
          success: false,
          message: 'Failed to create user account' 
        },
        { status: 500 }
      )
    }

    console.log('✅ User registered in Auth:', authData.user.id)

    // Create user profile in info_users table
    try {
      const { error: profileError } = await supabase
        .from('info_users')
        .insert({
          id: authData.user.id,
          email: authData.user.email,
          full_name: full_name || '',
          user_type: user_type || 'tourist',
          points: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

      if (profileError) {
        console.error('🔴 Profile creation error:', profileError)
        // Don't fail the whole request, just log it
      } else {
        console.log('✅ User profile created in info_users')
      }
    } catch (profileError) {
      console.error('🔴 Profile creation exception:', profileError)
    }

    // Return success with user data
    return NextResponse.json({ 
      success: true,
      message: 'Registration successful',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        full_name: full_name || '',
        user_type: user_type || 'tourist',
      }
    })
    
  } catch (error) {
    console.error('🔴 API error:', error)
    return NextResponse.json(
      { 
        success: false,
        message: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
  }
}