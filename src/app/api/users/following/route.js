import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

export async function GET(request) {
  if (!adminSupabase) {
    return NextResponse.json({ success: false, message: 'Follow service is not configured.' }, { status: 500 })
  }

  const viewerId = getServerSession(request)?.user_id || null
  if (!viewerId) {
    return NextResponse.json({ success: false, message: 'Please log in to view followed users.' }, { status: 401 })
  }

  const { data, error } = await adminSupabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', viewerId)

  if (error) {
    console.error('Followed users lookup failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to load followed users.' }, { status: 500 })
  }

  const followingIds = [...new Set((data || []).map((row) => row.following_id).filter(Boolean))]
  const { data: users, error: usersError } = followingIds.length
    ? await adminSupabase.from('info_users').select('id, full_name, email, profile_image_url').in('id', followingIds)
    : { data: [], error: null }

  if (usersError) {
    console.error('Followed user profiles lookup failed:', usersError)
  }

  return NextResponse.json({
    success: true,
    following_ids: followingIds,
    following_users: users || [],
  })
}
