import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { clearSecureSessionCookie, setSecureSessionCookie } from '@/lib/serverAuth'
import { createSessionAdminClient, getUserSessionVersion } from '@/lib/sessionVersions'
import { getStaffHomePath, isStaffRole, resolveAuthenticatedUserRole } from '@/lib/staffRoles.mjs'
import { loadSessionOptions } from '@/lib/sessionIssue'
import { describeSuspension, getActiveSuspension } from '@/lib/contentRestrictions'

function clearCallbackAuthCookies(response, cookieStore) {
  clearSecureSessionCookie(response)
  response.cookies.set('daet_auth_session', '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
    }
  }
}

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
      return NextResponse.redirect(new URL('/info/login?message=Unable to complete sign in. Please try again.', request.url))
    }

    // Establish the full session so the proxy (which authorizes via the signed
    // HTTP-only cookie) lets the user through on the next request.
    const user = data?.user
    if (user) {
      try {
        const sessionAdmin = createSessionAdminClient()
        if (!sessionAdmin) throw new Error('Secure account profile lookup is unavailable.')

        const { data: profile, error: profileError } = await sessionAdmin
          .from('info_users')
          .select('user_type, full_name, profile_image_url, email_verified')
          .eq('id', user.id)
          .maybeSingle()
        if (profileError) throw profileError

        const role = resolveAuthenticatedUserRole(profile?.user_type, user.user_metadata?.user_type)

        const redirectUrl = isStaffRole(role) ? getStaffHomePath(role) : '/info/user/dashboard'
        const response = NextResponse.redirect(new URL(redirectUrl, request.url))

        const userProfile = {
          id: user.id,
          full_name: profile?.full_name || user.user_metadata?.full_name || user.email,
          email: user.email,
          user_type: role,
          profile_image_url: profile?.profile_image_url || null,
        }
        const suspension = await getActiveSuspension(sessionAdmin, user.id)
        if (suspension) {
          const deniedUrl = new URL('/info/login', request.url)
          deniedUrl.searchParams.set('message', describeSuspension(suspension))
          return NextResponse.redirect(deniedUrl)
        }
        const sessionVersion = await getUserSessionVersion(sessionAdmin, user.id)
        const sessionOptions = await loadSessionOptions(sessionAdmin, userProfile)
        setSecureSessionCookie(response, userProfile, false, sessionVersion, null, sessionOptions)
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
        const response = NextResponse.redirect(new URL(
          '/info/login?message=Unable%20to%20verify%20your%20account.%20Please%20sign%20in%20again.',
          request.url
        ))
        clearCallbackAuthCookies(response, cookieStore)
        return response
      }
    }
  }

  // URL to redirect to after sign-in process completes
  return NextResponse.redirect(new URL('/info/user/dashboard', request.url))
}
