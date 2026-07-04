// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

let supabaseInstance = null
let isInitialized = false

/**
 * Get Supabase client instance (lazy initialization)
 * Returns a mock client during build time to prevent errors
 */
export function getSupabase() {
  // Return existing instance if already initialized
  if (isInitialized && supabaseInstance) {
    return supabaseInstance
  }

  // Check if we're in a build environment
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                      process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SUPABASE_URL

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // During build time OR if variables are missing, return a mock client
  if (isBuildTime || !supabaseUrl || !supabaseAnonKey) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Supabase environment variables are missing. Using mock client.')
    } else {
      console.log('🔨 Build time: Using mock Supabase client')
    }
    return createMockSupabase()
  }

  // Create real Supabase client for runtime
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
    isInitialized = true
    console.log('✅ Supabase client initialized successfully')
    return supabaseInstance
  } catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error)
    return createMockSupabase()
  }
}

/**
 * Create a mock Supabase client for build time or when variables are missing
 */
function createMockSupabase() {
  const createMockQueryBuilder = () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: null }),
        order: () => ({ data: [], error: null }),
        limit: () => ({ data: [], error: null }),
        range: () => ({ data: [], error: null }),
      }),
      order: () => ({ data: [], error: null }),
      limit: () => ({ data: [], error: null }),
      range: () => ({ data: [], error: null }),
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (onFulfilled) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({ data: null, error: null }),
      }),
      single: async () => ({ data: null, error: null }),
    }),
    update: () => ({
      eq: () => ({
        select: () => ({
          single: async () => ({ data: null, error: null }),
        }),
        single: async () => ({ data: null, error: null }),
      }),
    }),
    delete: () => ({
      eq: () => ({
        select: () => ({
          single: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    order: () => ({ data: [], error: null }),
    limit: () => ({ data: [], error: null }),
    range: () => ({ data: [], error: null }),
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (onFulfilled) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
  })

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ 
        data: null, 
        error: new Error('Supabase not configured. Please check environment variables.')
      }),
      signInWithOAuth: async () => ({ 
        data: null, 
        error: new Error('Supabase not configured. Please check environment variables.')
      }),
      signUp: async () => ({ 
        data: null, 
        error: new Error('Supabase not configured. Please check environment variables.')
      }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ 
        data: null, 
        error: new Error('Supabase not configured. Please check environment variables.')
      }),
      updateUser: async () => ({ 
        data: null, 
        error: new Error('Supabase not configured. Please check environment variables.')
      }),
    },
    from: createMockQueryBuilder,
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        download: async () => ({ data: null, error: null }),
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    channel: () => ({
      on: () => ({
        subscribe: () => ({ unsubscribe: () => {} }),
      }),
    }),
    removeChannel: () => {},
    removeAllChannels: () => {},
    getChannels: () => [],
  }
}

// Helper to check if Supabase is actually configured
export function isSupabaseConfigured() {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
         !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

// For backward compatibility
export const supabase = getSupabase()