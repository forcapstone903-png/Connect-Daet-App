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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Log environment status (but only in development or when debugging)
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 Supabase Environment Check:')
    console.log('  - URL:', supabaseUrl ? '✅ Set' : '❌ Missing')
    console.log('  - Key:', supabaseAnonKey ? '✅ Set' : '❌ Missing')
  }

  // Check if we're in a build environment (Vercel build)
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                      process.env.NODE_ENV === 'production' && !supabaseUrl

  // During build time OR if variables are missing, return a mock client
  if (isBuildTime) {
    console.log('🔨 Build time: Using mock Supabase client')
    return createMockSupabase()
  }

  // If variables are missing, return mock client
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase environment variables are missing. Using mock client.')
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
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured() {
  const configured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && 
         process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  
  // Log the configuration status (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 Supabase Configured:', configured)
  }
  
  return configured
}

/**
 * Create a mock Supabase client for build time or when variables are missing
 */
function createMockSupabase() {
  // Create a function that returns a mock query builder
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
        maybeSingle: async () => ({ data: null, error: null }),
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
    upsert: () => ({
      select: () => ({
        single: async () => ({ data: null, error: null }),
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
    // Auth methods
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
    // Database methods
    from: createMockQueryBuilder,
    // Storage methods
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        download: async () => ({ data: null, error: null }),
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    // Realtime methods
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

// For backward compatibility, export a default client
export const supabase = getSupabase()