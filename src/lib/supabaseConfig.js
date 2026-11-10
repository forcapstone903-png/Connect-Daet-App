const DEFAULT_PRODUCTION_APP_URL = 'https://connect-daet-app.vercel.app'

export function getAppUrl(request) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const fallbackUrl = process.env.NODE_ENV === 'production'
    ? DEFAULT_PRODUCTION_APP_URL
    : new URL(request.url).origin
  const appUrl = new URL(configuredUrl || fallbackUrl)

  if (appUrl.protocol !== 'http:' && appUrl.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.')
  }

  return appUrl.origin
}

export function getSupabaseAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url) {
    return { url: null, key: null, source: null }
  }

  if (serviceRoleKey) {
    return {
      url,
      key: serviceRoleKey,
      source: 'service_role',
    }
  }

  return {
    url,
    key: anonKey || null,
    source: anonKey ? 'anon' : null,
  }
}
