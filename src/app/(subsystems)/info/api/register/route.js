import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientIp, consumeRateLimit } from '@/lib/rateLimit'
import bcrypt from 'bcryptjs'
import { getAppUrl, getSupabaseAuthConfig } from '@/lib/supabaseConfig'
import { buildInfoUserRecord } from '@/lib/infoUserData'
import { isDuplicateEmailError } from '@/lib/authFlow'
import { describePasswordPolicy, isPasswordValid } from '@/lib/passwordPolicy'
import { getPasswordPolicy } from '@/lib/appSettingsServer'
import { publicErrorMessage } from '@/lib/publicError'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({ success: true, message: 'Register API is reachable' })
}

export async function POST(request) {
  
  try {
    // Parse JSON body safely
    let body = null
    try {
      const rawText = await request.text()
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
    const appUrl = getAppUrl(request)
    
    if (!supabaseUrl || !supabaseAuthKey) {
      console.error('❌ Missing environment variables')
      return NextResponse.json(
        { success: false, message: 'Supabase configuration is missing' },
        { status: 500 }
      )
    }

    // Create Supabase client for auth operations
    const supabase = createClient(supabaseUrl, supabaseAuthKey)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    const adminSupabase = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

    // 5 sign-ups per IP address per hour.
    const limit = await consumeRateLimit(adminSupabase, { scope: 'register', key: clientIp(request), max: 5, windowSeconds: 3600 })
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, message: limit.unavailable ? 'Registration is temporarily unavailable. Please try again later.' : 'Too many sign-up attempts. Please try again later.' },
        { status: limit.unavailable ? 503 : 429 }
      )
    }

    const { full_name, email, password } = body
    const normalizedEmail = email?.toLowerCase().trim()
    
    // Validate input
    if (!full_name || !normalizedEmail || typeof password !== 'string' || !password) {
      return NextResponse.json(
        { success: false, message: 'Full name, email, and password are required' },
        { status: 400 }
      )
    }

    const passwordPolicy = await getPasswordPolicy()
    if (!isPasswordValid(password, passwordPolicy)) {
      return NextResponse.json(
        { success: false, message: describePasswordPolicy(passwordPolicy) },
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


    if (!adminSupabase) {
      console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY for profile insertion')
      return NextResponse.json(
        { success: false, message: 'Server is not configured to create user profiles. Please contact support.' },
        { status: 500 }
      )
    }

    // Register user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: full_name || '',
          user_type: 'tourist',
        },
        emailRedirectTo: `${appUrl}/info/confirm`,
      },
    })

    if (authError) {
      console.error('🔴 Auth registration error:', authError)
      
      let errorMessage = authError.message
      const lowerMessage = authError.message?.toLowerCase() || ''

      if (isDuplicateEmailError(authError.message)) {
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


    // Create user profile in info_users table using service role client
    const hashedPassword = await bcrypt.hash(password, 12)
    const userData = buildInfoUserRecord({
      id: authData.user.id,
      email: normalizedEmail,
      fullName: full_name,
      userType: 'tourist',
      password: hashedPassword,
      mobileNumber: null,
    })


    // Try to insert the user profile
    const { data: profileData, error: profileError } = await adminSupabase
      .from('info_users')
      .insert(userData)
      .select()
      .single()

    if (profileError) {
      console.error('🔴 Profile creation error:', profileError)
      
      // If insert fails, try upsert with admin client
      const { data: upsertData, error: upsertError } = await adminSupabase
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
            user_type: 'tourist',
          },
          warning: 'Profile creation had issues'
        })
      } else {
      }
    } else {
    }

    const { error: publicProfileError } = await adminSupabase
      .from('profiles')
      .upsert({
        user_id: authData.user.id,
        full_name: full_name || '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (publicProfileError) {
      console.error('Public profile creation error:', publicProfileError)
    }

    // Return success
    return NextResponse.json({ 
      success: true,
      message: 'Registration successful! Please check your email to confirm your account.',
      user: {
        id: authData.user.id,
        email: normalizedEmail,
        full_name: full_name || '',
        user_type: 'tourist',
      },
      requiresConfirmation: true
    })
    
  } catch (error) {
    console.error('🔴 API error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 }
    )
  }
}