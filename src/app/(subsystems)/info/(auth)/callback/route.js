import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { setSecureSessionCookie } from '@/lib/serverAuth'

export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: () => cookieStore }
  )

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('Callback code exchange failed:', error)
      return NextResponse.redirect(new URL('/login?message=Unable to complete sign in. Please try again.', request.url))
    }

    // Establish the full session so the proxy (which authorizes via the signed
    // HTTP-only cookie) lets the user through on the next request.
    const user = data?.user
    if (user) {
      let role = String(user.user_metadata?.user_type || 'tourist').trim().toLowerCase()

      try {
        const { data: profile } = await supabase
          .from('info_users')
          .select('user_type, full_name, profile_image_url, email_verified')
          .eq('id', user.id)
          .maybeSingle()

        if (profile?.user_type) role = String(profile.user_type).trim().toLowerCase()

        const redirectUrl = role === 'admin' ? '/admin/dashboard' : '/user/dashboard'
        const response = NextResponse.redirect(new URL(redirectUrl, request.url))

        const userProfile = {
          id: user.id,
          full_name: profile?.full_name || user.user_metadata?.full_name || user.email,
          email: user.email,
          user_type: role,
          profile_image_url: profile?.profile_image_url || null,
        }
        setSecureSessionCookie(response, userProfile)
        response.cookies.set(
          'daet_auth_session',
          encodeURIComponent(JSON.stringify({
            user_id: user.id,
            user_name: userProfile.full_name,
            user_email: user.email,
            role,
            avatar_url: userProfile.profile_image_url || '',
            profile_image_url: userProfile.profile_image_url || '',
            logged_in: true,
            login_time: new Date().toISOString(),
          })),
          { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 24 * 60 * 60, path: '/' }
        )

        return response
      } catch (profileError) {
        console.error('Callback profile lookup failed:', profileError)
      }
    }
  }

  // URL to redirect to after sign-in process completes
  return NextResponse.redirect(new URL('/user/dashboard', request.url))
}
