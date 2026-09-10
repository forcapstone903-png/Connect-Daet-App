import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function getMissingConfigResponse() {
  return NextResponse.json({ success: false, message: 'Follow service is not configured.' }, { status: 500 })
}

async function getTargetUserId(params) {
  const resolvedParams = await params
  return resolvedParams?.id || null
}

async function getFollowSummary(viewerId, targetUserId) {
  const [{ count: targetFollowerCount, error: followerCountError }, { data: reverseRow, error: reverseError }] = await Promise.all([
    adminSupabase
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', targetUserId),
    adminSupabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', targetUserId)
      .eq('following_id', viewerId)
      .maybeSingle(),
  ])

  if (followerCountError) throw followerCountError
  if (reverseError) throw reverseError

  const { count: targetFollowingCount, error: targetFollowingError } = await adminSupabase
    .from('user_follows')
    .select('id', { count: 'exact', head: true })
    .eq('follower_id', targetUserId)

  if (targetFollowingError) throw targetFollowingError

  return {
    is_following: true,
    is_followed_by: Boolean(reverseRow),
    is_mutual: Boolean(reverseRow),
    followers_count: targetFollowerCount || 0,
    following_count: targetFollowingCount || 0,
  }
}

export async function POST(request, { params }) {
  if (!adminSupabase) return getMissingConfigResponse()

  const viewerId = getServerSession(request)?.user_id || null
  const targetUserId = await getTargetUserId(params)

  if (!viewerId) return NextResponse.json({ success: false, message: 'Please log in to follow this user.' }, { status: 401 })
  if (!targetUserId || viewerId === targetUserId) return NextResponse.json({ success: false, message: 'You cannot follow this user.' }, { status: 400 })

  const { error } = await adminSupabase
    .from('user_follows')
    .insert({ follower_id: viewerId, following_id: targetUserId })

  if (error && error.code !== '23505') {
    console.error('Follow insert failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to follow this user.' }, { status: 500 })
  }

  try {
    const { data: targetUser } = await adminSupabase
      .from('info_users')
      .select('id, full_name, user_type')
      .eq('id', targetUserId)
      .maybeSingle()

    const { data: actor } = await adminSupabase
      .from('info_users')
      .select('id, full_name, user_type')
      .eq('id', viewerId)
      .maybeSingle()

    const actorName = actor?.full_name || 'Someone'
    const targetLink = `/user/profile/${targetUserId}`
    const existing = await adminSupabase
      .from('info_notifications')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('link', targetLink)
      .limit(1)

    if (!existing.error && (!Array.isArray(existing.data) || existing.data.length === 0) && targetUser?.user_type !== 'admin') {
      await adminSupabase.from('info_notifications').insert({
        user_id: targetUserId,
        title: 'New follower',
        message: `${actorName} started following you.`,
        type: 'follow',
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        link: targetLink,
      })
    }

    return NextResponse.json({ success: true, ...(await getFollowSummary(viewerId, targetUserId)) })
  } catch (summaryError) {
    console.error('Follow summary failed:', summaryError)
    return NextResponse.json({ success: false, message: 'Follow saved, but its status could not be refreshed.' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  if (!adminSupabase) return getMissingConfigResponse()

  const viewerId = getServerSession(request)?.user_id || null
  const targetUserId = await getTargetUserId(params)

  if (!viewerId) return NextResponse.json({ success: false, message: 'Please log in to unfollow this user.' }, { status: 401 })
  if (!targetUserId || viewerId === targetUserId) return NextResponse.json({ success: false, message: 'Invalid follow relationship.' }, { status: 400 })

  const { error } = await adminSupabase
    .from('user_follows')
    .delete()
    .eq('follower_id', viewerId)
    .eq('following_id', targetUserId)

  if (error) {
    console.error('Follow delete failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to unfollow this user.' }, { status: 500 })
  }

  try {
    const summary = await getFollowSummary(viewerId, targetUserId)
    return NextResponse.json({ success: true, ...summary, is_following: false, is_mutual: false })
  } catch (summaryError) {
    console.error('Unfollow summary failed:', summaryError)
    return NextResponse.json({ success: false, message: 'Unfollow saved, but its status could not be refreshed.' }, { status: 500 })
  }
}
