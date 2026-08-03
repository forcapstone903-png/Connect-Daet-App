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
