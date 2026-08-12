import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAuthConfig } from '@/lib/supabaseConfig'
import { buildInfoUserRecord } from '@/lib/infoUserData'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  console.log('📝 ====== REGISTRATION API CALLED ======')
  
  try {
    // Parse JSON body safely
    let body = null
    try {
      const rawText = await request.text()
      console.log('📝 Raw request body:', rawText)
      body = rawText ? JSON.parse(rawText) : {}
    } catch (e) {
      console.error('📝 Failed to parse request body:', e.message)
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Get environment variables
    const { url: supabaseUrl, key: supabaseAuthKey } = getSupabaseAuthConfig()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://connect-daet-app.vercel.app'
    
    if (!supabaseUrl || !supabaseAuthKey) {
      console.error('❌ Missing environment variables')
      return NextResponse.json(
        { success: false, message: 'Supabase configuration is missing' },
        { status: 500 }
      )
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAuthKey)

    const { full_name, email, password, user_type } = body
    const normalizedEmail = email?.toLowerCase().trim()
    console.log('📝 Parsed body:', { full_name, email: normalizedEmail, user_type })
    
    // Validate input
    if (!normalizedEmail || !password) {
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

    // Check if this email already exists in the app profile table
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('info_users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingProfileError) {
      console.error('🔴 Error checking existing profile:', existingProfileError)
    }

    if (existingProfile) {
      return NextResponse.json(
        { success: false, message: 'An account with this email already exists. Please log in or reset your password.' },
        { status: 409 }
      )
    }

    console.log('📝 Attempting to register user:', normalizedEmail)

    // Register user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: full_name || '',
          user_type: user_type || 'tourist',
        },
        emailRedirectTo: `${appUrl}/login?message=Please check your email to confirm your account.`,
      },
    })

    console.log('📝 supabase.auth.signUp result:', { authData, authError: authError ? authError.message : null })
    if (authError) {
      console.error('🔴 Auth registration error:', authError)
      
      let errorMessage = authError.message
      const lowerMessage = authError.message?.toLowerCase() || ''

      if (lowerMessage.includes('already registered') || lowerMessage.includes('email already')) {
        errorMessage = 'This email is already registered. Please log in or reset your password.'
      } else if (lowerMessage.includes('invalid api key') || lowerMessage.includes('jwt')) {
        errorMessage = 'Supabase authentication is misconfigured. Please contact support.'
      }
      
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: authError.status === 409 ? 409 : 400 }
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
    const userData = buildInfoUserRecord({
      id: authData.user.id,
      email: normalizedEmail,
      fullName: full_name,
      userType: user_type,
    })

    console.log('📝 Creating user profile:', userData)

    // Try to insert the user profile
    const { data: profileData, error: profileError } = await supabase
      .from('info_users')
      .insert(userData)
      .select()
      .single()

    console.log('📝 profile insert result:', { profileData, profileError: profileError ? profileError.message : null })
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
            email: normalizedEmail,
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
        email: normalizedEmail,
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