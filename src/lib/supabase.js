// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

let supabaseInstance = null

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
  console.log('🔍 Initializing Supabase Client:')
  console.log('  - Environment:', process.env.NODE_ENV)
  console.log('  - VERCEL:', process.env.VERCEL || 'false')
  console.log('  - URL exists:', !!supabaseUrl)
  console.log('  - KEY exists:', !!supabaseAnonKey)

  // If variables are missing, throw an error
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase environment variables are missing')
    return null
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