import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  console.log('📝 ====== LOGIN API CALLED ======')
  
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
    const { email, password } = body
    
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      )
    }

    console.log('📝 Attempting login for:', email)

    // Sign in with password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    })

    if (authError) {
      console.error('🔴 Auth login error:', authError)
      
      let errorMessage = 'Invalid email or password'
      if (authError.message.includes('Email not confirmed')) {
        errorMessage = 'Please confirm your email address before logging in.'
      } else if (authError.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please try again.'
      }
      
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: 401 }
      )
    }

    if (!authData?.user) {
      console.error('🔴 No user data returned')
      return NextResponse.json(
        { success: false, message: 'Failed to get user data' },
        { status: 500 }
      )
    }

    console.log('✅ User authenticated:', authData.user.id)

    // Get user profile from info_users
    let userProfile = null
    let profileError = null

    try {
      const { data, error } = await supabase
        .from('info_users')
        .select('*')
        .eq('id', authData.user.id)
        .single()

      userProfile = data
      profileError = error

      if (profileError) {
        console.error('🔴 Profile fetch error:', profileError)
        
        // If profile doesn't exist, create it
        if (profileError.code === 'PGRST116') {
          console.log('📝 Creating missing user profile...')
          
          const newProfile = {
            id: authData.user.id,
            email: authData.user.email,
            full_name: authData.user.user_metadata?.full_name || authData.user.email,
            user_type: authData.user.user_metadata?.user_type || 'tourist',
            points: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }

          const { data: created, error: createError } = await supabase
            .from('info_users')
            .insert(newProfile)
            .select()
            .single()

          if (createError) {
            console.error('🔴 Profile creation error:', createError)
            // Still allow login, use auth data
            userProfile = {
              id: authData.user.id,
              email: authData.user.email,
              full_name: authData.user.user_metadata?.full_name || authData.user.email,
              user_type: authData.user.user_metadata?.user_type || 'tourist',
              points: 0,
            }
          } else {
            console.log('✅ Created missing profile:', created)
            userProfile = created
          }
        }
      } else {
        console.log('✅ User profile found:', userProfile)
      }
    } catch (error) {
      console.error('🔴 Profile fetch exception:', error)
      // Fallback to auth data
      userProfile = {
        id: authData.user.id,
        email: authData.user.email,
        full_name: authData.user.user_metadata?.full_name || authData.user.email,
        user_type: authData.user.user_metadata?.user_type || 'tourist',
        points: 0,
      }
    }

    // Return success with user data
    return NextResponse.json({ 
      success: true,
      message: 'Login successful',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        full_name: userProfile?.full_name || authData.user.user_metadata?.full_name || authData.user.email,
        user_type: userProfile?.user_type || authData.user.user_metadata?.user_type || 'tourist',
        points: userProfile?.points || 0,
      },
      session: {
        access_token: authData.session?.access_token,
        refresh_token: authData.session?.refresh_token,
        expires_at: authData.session?.expires_at,
      }
    })
    
  } catch (error) {
    console.error('🔴 Login API error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}