import { NextResponse } from 'next/server'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const configured = isSupabaseConfigured()
    const supabase = getSupabase()
    
    // Test if we can connect
    let connectionTest = false
    let connectionError = null
    let testData = null
    
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('info_users')
          .select('count')
          .limit(1)
        
        connectionTest = !error
        connectionError = error?.message || null
        testData = data
      } catch (err) {
        connectionError = err.message
      }
    }
    
    return NextResponse.json({
      configured,
      hasSupabase: !!supabase,
      hasAuth: !!(supabase?.auth),
      hasSignUp: typeof supabase?.auth?.signUp === 'function',
      connectionTest,
      connectionError,
      testData,
      environment: process.env.NODE_ENV,
      vercel: process.env.VERCEL || false,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
      key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING'
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}