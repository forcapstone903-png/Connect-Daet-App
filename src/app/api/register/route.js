// app/api/register/route.js
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
    if (!supabase || !supabase.auth || !supabase.auth.signUp) {
      console.error('❌ Supabase client not properly initialized')
      return NextResponse.json(
        { 
          success: false,
          message: 'Supabase client not available' 
        },
        { status: 500 }
      )
    }

    // Parse request body
    const { full_name, email, password, user_type } = await request.json()
    
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

    console.log('📝 Registering user:', email)

    // Register user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: full_name || '',
          user_type: user_type || 'tourist',
        },
      },
    })

    if (authError) {
      console.error('🔴 Auth registration error:', authError)
      return NextResponse.json(
        { 
          success: false,
          message: authError.message || 'Failed to register user'
        },
        { status: 400 }
      )
    }

    if (!authData?.user) {
      console.error('🔴 No user data returned')
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
        // User is created but profile failed - we should still return success
        // but log the error for debugging
      } else {
        console.log('✅ User profile created in info_users')
      }
    } catch (profileError) {
      console.error('🔴 Profile creation exception:', profileError)
      // Don't fail the whole request, just log it
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
        details: error.message 
      },
      { status: 500 }
    )
  }
}