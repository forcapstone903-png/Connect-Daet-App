import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json(
      { success: false, message: 'Community guidelines are unavailable.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await client.from('admin_app_settings')
    .select('value, updated_at')
    .eq('id', 'community-guidelines')
    .maybeSingle()
  if (error) {
    console.error('Public community guidelines load failed:', error)
    return NextResponse.json(
      { success: false, message: 'Unable to load community guidelines.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  if (!data) {
    return NextResponse.json(
      { success: false, message: 'Community guidelines have not been configured.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  return NextResponse.json(
    { success: true, content: data.value?.content || '', updatedAt: data.updated_at },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
