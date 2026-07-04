// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

let supabaseInstance = null

/**
 * Get Supabase client instance
 * THIS VERSION DOES NOT USE MOCK CLIENTS IN PRODUCTION
 */
export function getSupabase() {
  // Return existing instance if already initialized
  if (supabaseInstance) {
    return supabaseInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // CRITICAL: Log environment status in production for debugging
  console.log('🔍 Supabase Client Initialization:')
  console.log('  - Environment:', process.env.NODE_ENV)
  console.log('  - VERCEL:', process.env.VERCEL || 'false')
  console.log('  - URL exists:', !!supabaseUrl)
  console.log('  - KEY exists:', !!supabaseAnonKey)
  console.log('  - URL value:', supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'undefined')
  console.log('  - KEY value:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'undefined')

  // If variables are missing, throw an error (don't use mock in production)
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Supabase environment variables are missing')
    console.error('❌', error.message)
    console.error('  - URL:', supabaseUrl || 'undefined')
    console.error('  - KEY:', supabaseAnonKey || 'undefined')
    throw error
  }

  // Create real Supabase client
  try {
    console.log('✅ Creating real Supabase client...')
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
    console.log('✅ Supabase client created successfully')
    return supabaseInstance
  } catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error)
    throw error
  }
}

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured() {
  const configured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && 
         process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  
  console.log('🔍 Supabase Configured Check:', configured)
  return configured
}

// Export a default client (DO NOT instantiate at module level)
export const supabase = null // Remove this to force using getSupabase()