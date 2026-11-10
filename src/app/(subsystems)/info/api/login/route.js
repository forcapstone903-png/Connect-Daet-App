import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAuthConfig } from '@/lib/supabaseConfig'
import { maskEmail, sanitizeUserProfileForLog } from '@/lib/safeLogging'
import { setSecureSessionCookie } from '@/lib/serverAuth'
import { createSessionAdminClient, getUserSessionVersion } from '@/lib/sessionVersions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  console.log('📝 ====== LOGIN API CALLED ======')
  
  try {
    // Get environment variables
    const { url: supabaseUrl, key: supabaseAuthKey } = getSupabaseAuthConfig()
    
    // Parse request body
    const body = await request.json()
    const { email, password, rememberMe } = body
    
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    if (!supabaseUrl || !supabaseAuthKey) {
      console.error('❌ Missing environment variables: email verification login is unavailable')
      return NextResponse.json(
        { success: false, message: 'Supabase authentication is not configured. Please contact support.' },
        { status: 500 }
      )
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAuthKey)

    console.log('📝 Attempting login for:', maskEmail(normalizedEmail))

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
        return NextResponse.json({ success: false, message: errorMessage }, { status: 403 })
      }

      if (authError.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please try again.'
      }

      return NextResponse.json({ success: false, message: errorMessage }, { status: 401 })
    }

    if (!authData?.user) {
      console.error('🔴 No user data returned')
      return NextResponse.json(
        { success: false, message: 'Failed to get user data' },
        { status: 500 }
      )
    }

    const sessionAdmin = createSessionAdminClient()
    if (!sessionAdmin) {
      return NextResponse.json(
        { success: false, message: 'Unable to establish a secure session. Please try again.' },
        { status: 503 }
      )
    }

    const { data: accountState, error: accountStateError } = await sessionAdmin
      .from('info_users')
      .select('status, deletion_requested_at')
      .eq('id', authData.user.id)
      .maybeSingle()
    if (accountStateError) {
      console.error('Account state lookup failed during login:', { code: accountStateError.code || null })
      return NextResponse.json(
        { success: false, message: 'Unable to load your account profile. Please try again.' },
        { status: 503 }
      )
    }
    if (accountState?.status === 'pending_deletion' || accountState?.deletion_requested_at) {
      return NextResponse.json(
        { success: false, message: 'This account is scheduled for deletion. Use Account recovery to cancel the request during the 30-day grace period.' },
        { status: 403 }
      )
    }

    const userProfileLookup = await supabase
      .from('info_users')
      .select('email_verified')
      .eq('id', authData.user.id)
      .maybeSingle()

    const profileVerified = !!userProfileLookup?.data?.email_verified

    if (!authData.user.email_confirmed_at && !profileVerified) {
      console.warn('⚠️ Login denied: user email is not confirmed', {
        userId: authData.user.id,
        authEmailConfirmedAt: authData.user.email_confirmed_at,
        profileEmailVerified: profileVerified,
      })
      return NextResponse.json(
        { success: false, message: 'Please confirm your email address before logging in. Check your spam folder.' },
        { status: 403 }
      )
    }

    console.log('✅ User authenticated:', authData.user.id)

    // Get or create user profile
    const metadataRole = String(authData.user.user_metadata?.user_type || 'tourist').trim().toLowerCase()
    const normalizedRole = ['admin', 'moderator', 'tourist', 'business'].includes(metadataRole) ? metadataRole : 'tourist'
    const dbUserType = normalizedRole
    let userProfile = null

    try {
      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('info_users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle()

      if (profileLookupError) {
        console.error('🔴 Profile lookup error:', profileLookupError)
        return NextResponse.json(
          { success: false, message: 'Unable to load your account profile. Please try again.' },
          { status: 500 }
        )
      }

      userProfile = existingProfile

      if (!userProfile) {
        const newProfile = {
          id: authData.user.id,
          email: authData.user.email,
          full_name: authData.user.user_metadata?.full_name || authData.user.email,
          user_type: dbUserType || 'tourist',
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
          return NextResponse.json(
            { success: false, message: 'Unable to create your account profile. Please try again or contact support.' },
            { status: 500 }
          )
        }

        console.log('✅ Created profile:', sanitizeUserProfileForLog(created))
        userProfile = created
      } else {
        console.log('✅ Profile found:', sanitizeUserProfileForLog(userProfile))
      }

      if (userProfile?.status === 'pending_deletion' || userProfile?.deletion_requested_at) {
        return NextResponse.json(
          { success: false, message: 'This account is scheduled for deletion. Use Account recovery to cancel the request during the 30-day grace period.' },
          { status: 403 }
        )
      }

      if (!userProfile || userProfile.status !== 'active') {
        return NextResponse.json(
          { success: false, message: 'This account is not active. Please contact support.' },
          { status: 403 }
        )
      }

      const signedInAt = new Date().toISOString()
      const [lastLoginUpdate, loginActivityInsert] = await Promise.all([
        sessionAdmin
          .from('info_users')
          .update({ last_login: signedInAt })
          .eq('id', authData.user.id),
        sessionAdmin
          .from('user_activity_log')
          .insert({
            user_id: authData.user.id,
            activity_type: 'login',
            description: 'Successful sign-in',
            metadata: {
              userAgent: (request.headers.get('user-agent') || '').slice(0, 200) || null,
            },
            created_at: signedInAt,
          }),
      ])
      if (lastLoginUpdate.error) {
        console.error('Successful login timestamp update failed:', { code: lastLoginUpdate.error.code || null })
      }
      if (loginActivityInsert.error) {
        console.error('Successful login activity record failed:', { code: loginActivityInsert.error.code || null })
      }
    } catch (error) {
      console.error('🔴 Profile fetch exception:', error)
      return NextResponse.json(
        { success: false, message: 'Unable to load your account profile. Please try again.' },
        { status: 500 }
      )
    }

    // Return success with user data
    let sessionVersion
    try {
      sessionVersion = await getUserSessionVersion(sessionAdmin, authData.user.id)
    } catch (sessionVersionError) {
      console.error('Login session version lookup failed:', { code: sessionVersionError.code || null })
      return NextResponse.json(
        { success: false, message: 'Unable to establish a secure session. Please try again.' },
        { status: 503 }
      )
    }

    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        full_name: userProfile?.full_name || authData.user.email,
        user_type: userProfile?.user_type || normalizedRole || 'tourist',
        points: userProfile?.points || 0,
        profile_image_url: userProfile?.profile_image_url || null,
        onboarding_completed: !!userProfile?.onboarding_completed,
      },
      session: {
        access_token: authData.session?.access_token,
        refresh_token: authData.session?.refresh_token,
        expires_at: authData.session?.expires_at,
      }
    })

    setSecureSessionCookie(response, userProfile, rememberMe === true, sessionVersion)
    return response
    
  } catch (error) {
    console.error('🔴 Login API error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}