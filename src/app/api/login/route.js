import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loginStoredUser } from '@/lib/authStorage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  console.log('📝 ====== LOGIN API CALLED ======')
  
  try {
    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    // Parse request body
    const body = await request.json()
    const { email, password } = body
    
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()
    const fallbackResult = loginStoredUser({ email: normalizedEmail, password })

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Missing environment variables, using local fallback auth')
      if (fallbackResult.success) {
        return NextResponse.json({
          success: true,
          message: 'Login successful',
          user: {
            id: fallbackResult.user.id,
            email: fallbackResult.user.email,
            full_name: fallbackResult.user.full_name,
            user_type: fallbackResult.user.user_type,
            points: fallbackResult.user.points || 0,
          },
          session: { access_token: null, refresh_token: null, expires_at: null }
        })
      }
      return NextResponse.json(
        { success: false, message: fallbackResult.message || 'Supabase configuration is missing' },
        { status: 401 }
      )
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    console.log('📝 Attempting login for:', normalizedEmail)

    // Sign in with password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (authError) {
      console.error('🔴 Auth login error:', authError)
      
      let errorMessage = 'Invalid email or password'
      if (authError.message.includes('Email not confirmed')) {
        errorMessage = 'Please confirm your email address before logging in. Check your spam folder.'
      } else if (authError.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please try again.'
      }

      if (fallbackResult.success) {
        return NextResponse.json({
          success: true,
          message: 'Login successful',
          user: {
            id: fallbackResult.user.id,
            email: fallbackResult.user.email,
            full_name: fallbackResult.user.full_name,
            user_type: fallbackResult.user.user_type,
            points: fallbackResult.user.points || 0,
          },
          session: { access_token: null, refresh_token: null, expires_at: null }
        })
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

    // Get or create user profile
    let userProfile = null

    try {
      // Try to get existing profile
      const { data, error } = await supabase
        .from('info_users')
        .select('*')
        .eq('id', authData.user.id)
        .single()

      if (error) {
        console.log('📝 Profile not found, creating one...')
        
        // Create new profile
        const newProfile = {
          id: authData.user.id,
          email: authData.user.email,
          full_name: authData.user.user_metadata?.full_name || authData.user.email,
          user_type: authData.user.user_metadata?.user_type || 'tourist',
          points: 0,
          status: 'active',
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
          // Fallback to using auth metadata
          userProfile = {
            id: authData.user.id,
            email: authData.user.email,
            full_name: authData.user.user_metadata?.full_name || authData.user.email,
            user_type: authData.user.user_metadata?.user_type || 'tourist',
            points: 0,
          }
        } else {
          console.log('✅ Created profile:', created)
          userProfile = created
        }
      } else {
        console.log('✅ Profile found:', data)
        userProfile = data
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
        full_name: userProfile?.full_name || authData.user.email,
        user_type: userProfile?.user_type || 'tourist',
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
      { success: false, message: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}