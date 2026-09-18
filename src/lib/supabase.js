// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

let supabaseInstance = null

// The client is created once per bundle, so these lines would otherwise repeat
// on every single page load. Keep them in development; only genuine failures
// (missing env vars, client creation errors) log in production.
const debugLog = (...args) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args)
}

/**
 * Get Supabase client instance
 */
export function getSupabase() {
  // Return existing instance if already initialized
  if (supabaseInstance) {
    return supabaseInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Log environment status for debugging
  debugLog('🔍 Initializing Supabase Client:')
  debugLog('  - Environment:', process.env.NODE_ENV)
  debugLog('  - VERCEL:', process.env.VERCEL || 'false')
  debugLog('  - URL exists:', !!supabaseUrl)
  debugLog('  - KEY exists:', !!supabaseAnonKey)

  // If variables are missing, throw an error
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase environment variables are missing')
    return null
  }

  // Create real Supabase client
  try {
    debugLog('✅ Creating real Supabase client...')
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
    debugLog('✅ Supabase client created successfully')
    return supabaseInstance
  } catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error)
    return null
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

// IMPORTANT: Export supabase for backward compatibility
// This creates a singleton instance that all files can import
export const supabase = getSupabase()