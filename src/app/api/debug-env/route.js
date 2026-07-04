import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // WARNING: This exposes environment variables - only use for debugging!
  const debug = {
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL || false,
    vercelEnv: process.env.VERCEL_ENV || 'not set',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
    supabaseUrlValue: process.env.NEXT_PUBLIC_SUPABASE_URL || 'MISSING',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
    supabaseAnonKeyValue: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20)}...` : 'MISSING',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'MISSING',
    allEnvKeys: Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_'))
  }
  
  return NextResponse.json(debug)
}