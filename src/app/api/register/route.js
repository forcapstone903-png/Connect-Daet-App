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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://connect-daet-app.vercel.app'
    
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
        emailRedirectTo: `${appUrl}/login?message=Please check your email to confirm your account.`,
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

    // Create user profile in info_users table
    const userData = {
      id: authData.user.id,
      email: authData.user.email,
      full_name: full_name || '',
      user_type: user_type || 'tourist',
      points: 0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    console.log('📝 Creating user profile:', userData)

    // Try to insert the user profile
    const { data: profileData, error: profileError } = await supabase
      .from('info_users')
      .insert(userData)
      .select()
      .single()

    if (profileError) {
      console.error('🔴 Profile creation error:', profileError)
      
      // If insert fails, try upsert
      const { data: upsertData, error: upsertError } = await supabase
        .from('info_users')
        .upsert(userData, { onConflict: 'id' })
        .select()
        .single()

      if (upsertError) {
        console.error('🔴 Upsert fallback error:', upsertError)
        
        // Return success anyway since auth user is created
        return NextResponse.json({ 
          success: true,
          message: 'Registration successful but profile creation had issues. Please contact support if you cannot login.',
          user: {
            id: authData.user.id,
            email: authData.user.email,
            full_name: full_name || '',
            user_type: user_type || 'tourist',
          },
          warning: 'Profile creation had issues'
        })
      } else {
        console.log('✅ User profile created with upsert:', upsertData)
      }
    } else {
      console.log('✅ User profile created:', profileData)
    }

    // Return success
    return NextResponse.json({ 
      success: true,
      message: 'Registration successful! Please check your email to confirm your account.',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        full_name: full_name || '',
        user_type: user_type || 'tourist',
      },
      requiresConfirmation: true
    })
    
  } catch (error) {
    console.error('🔴 API error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}