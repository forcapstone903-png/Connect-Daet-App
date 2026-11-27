import { createClient } from '@supabase/supabase-js'

export function createSupabaseServiceRoleClient(options) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, options)
}
