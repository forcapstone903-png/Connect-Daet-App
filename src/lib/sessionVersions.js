import { createClient } from '@supabase/supabase-js'

export function createSessionAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function getUserSessionVersion(adminSupabase, userId) {
  if (!adminSupabase || !userId) throw new Error('Session version service is unavailable.')

  const { data, error } = await adminSupabase
    .from('user_session_versions')
    .select('version')
    .eq('user_id', userId)
    .maybeSingle()
  if (error?.code === 'PGRST205') {
    console.warn('Session version table is unavailable; using version 0 until migration 071 is applied.')
    return 0
  }
  if (error) throw error
  return Number(data?.version || 0)
}

export async function revokeUserSessions(adminSupabase, userId) {
  if (!adminSupabase || !userId) throw new Error('Session revocation service is unavailable.')

  const { data, error } = await adminSupabase.rpc('revoke_user_sessions', {
    p_user_id: userId,
  })
  if (error) throw error
  const version = Number(data)
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error('Session revocation returned an invalid version.')
  }
  return version
}
