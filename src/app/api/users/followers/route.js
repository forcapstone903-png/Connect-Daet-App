import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

export async function GET(request) {
  const viewerId = getServerSession(request)?.user_id || null
  if (!viewerId) return NextResponse.json({ success: false, message: 'Please log in to mention users.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Follower service is not configured.' }, { status: 500 })

  const url = new URL(request.url)
  const query = String(url.searchParams.get('q') || '').trim()
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get('limit') || 8)))

  let followQuery = adminSupabase
    .from('user_follows')
    .select('follower_id')
    .eq('following_id', viewerId)
    .neq('follower_id', viewerId)
    .limit(500)

  const { data: followRows, error: followError } = await followQuery
  if (followError) return NextResponse.json({ success: false, message: followError.message || 'Unable to load followers.' }, { status: 500 })

  const followerIds = [...new Set((followRows || []).map((row) => row.follower_id).filter(Boolean))]
  if (!followerIds.length) return NextResponse.json({ success: true, users: [] })

  let usersQuery = adminSupabase
    .from('info_users')
    .select('id, full_name, email, profile_image_url, status')
    .in('id', followerIds)
    .eq('status', 'active')
    .order('full_name', { ascending: true })
    .limit(limit)

  if (query) usersQuery = usersQuery.ilike('full_name', `%${query}%`)

  const { data: users, error: usersError } = await usersQuery
  if (usersError) return NextResponse.json({ success: false, message: usersError.message || 'Unable to search followers.' }, { status: 500 })

  return NextResponse.json({ success: true, users: users || [] })
}
