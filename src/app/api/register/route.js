import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  console.log('📝 ====== REGISTRATION API CALLED ======')
  
  try {
    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Missing environment variables')
      return NextResponse.json(
        { success: false, message: 'Supabase configuration is missing' },
        { status: 500 }
      )
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Parse request body
    const body = await request.json()
    const { full_name, email, password, user_type } = body
    
    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 6 characters long' },
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
      
      let errorMessage = authError.message
      if (authError.message.includes('User already registered')) {
        errorMessage = 'This email is already registered. Please login instead.'
      }
      
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: 400 }
      )
    }

    if (!authData?.user) {
      console.error('🔴 No user data returned from auth')
      return NextResponse.json(
        { success: false, message: 'Failed to create user account' },
        { status: 500 }
      )
    }

    console.log('✅ User registered in Auth:', authData.user.id)

    // CRITICAL FIX: Create user profile in info_users table
    // Use upsert to handle any existing data issues
    const userData = {
      id: authData.user.id,
      email: authData.user.email,
      full_name: full_name || '',
      user_type: user_type || 'tourist',
      points: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    console.log('📝 Creating user profile:', userData)

    const { data: profileData, error: profileError } = await supabase
      .from('info_users')
      .upsert(userData, { onConflict: 'id' })
      .select()
      .single()

    if (profileError) {
      console.error('🔴 Profile creation error:', profileError)
      
      // Try a different approach - insert without select
      const { error: insertError } = await supabase
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

      if (insertError) {
        console.error('🔴 Insert fallback error:', insertError)
        // Still return success since user is created in auth
      } else {
        console.log('✅ User profile created with fallback insert')
      }
    } else {
      console.log('✅ User profile created:', profileData)
    }

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
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}