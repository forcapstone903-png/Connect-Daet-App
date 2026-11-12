import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { publicErrorMessage } from '@/lib/publicError'

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

async function getFollowSummary(viewerId, targetUserId, isFollowing = true, followRequestPending = false) {
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

  const [{ data: targetFollowingRows, error: targetFollowingRowsError }, { data: targetFollowerRows, error: targetFollowerRowsError }] = await Promise.all([
    adminSupabase.from('user_follows').select('following_id').eq('follower_id', targetUserId),
    adminSupabase.from('user_follows').select('follower_id').eq('following_id', targetUserId),
  ])
  if (targetFollowingRowsError) throw targetFollowingRowsError
  if (targetFollowerRowsError) throw targetFollowerRowsError
  const targetFollowerIds = new Set((targetFollowerRows || []).map((row) => row.follower_id))
  const friendsCount = (targetFollowingRows || []).filter((row) => targetFollowerIds.has(row.following_id)).length

  return {
    is_following: isFollowing,
    is_followed_by: Boolean(reverseRow),
    is_mutual: Boolean(reverseRow),
    follow_request_pending: followRequestPending,
    followers_count: targetFollowerCount || 0,
    following_count: targetFollowingCount || 0,
    friends_count: friendsCount,
  }
}

async function notifyFollowEvent({ recipientId, actorId, actorName, message, link, type = 'follow' }) {
  if (!adminSupabase || !recipientId || !actorId) {
    throw new Error('Follow notification service is not configured.')
  }

  const { error } = await adminSupabase.from('info_notifications').insert({
    user_id: recipientId,
    title: type === 'follow_request' ? 'Follow request' : message.includes('followed you back') ? 'Followed you back' : 'New follower',
    message,
    type,
    is_read: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    link,
    actor_id: actorId,
  })

  if (error) throw error
}

export async function POST(request, { params }) {
  if (!adminSupabase) return getMissingConfigResponse()

  const viewerId = getServerSession(request)?.user_id || null
  const targetUserId = await getTargetUserId(params)

  if (!viewerId) return NextResponse.json({ success: false, message: 'Please log in to follow this user.' }, { status: 401 })
  if (!targetUserId || viewerId === targetUserId) return NextResponse.json({ success: false, message: 'You cannot follow this user.' }, { status: 400 })

  try {
    const [viewerBlockResult, targetBlockResult] = await Promise.all([
      adminSupabase
        .from('user_blocks')
        .select('blocker_id')
        .eq('blocker_id', viewerId)
        .eq('blocked_id', targetUserId)
        .limit(1),
      adminSupabase
        .from('user_blocks')
        .select('blocker_id')
        .eq('blocker_id', targetUserId)
        .eq('blocked_id', viewerId)
        .limit(1),
    ])
    if (viewerBlockResult.error) throw viewerBlockResult.error
    if (targetBlockResult.error) throw targetBlockResult.error
    if (viewerBlockResult.data?.length || targetBlockResult.data?.length) {
      return NextResponse.json({ success: false, message: 'You cannot follow an account involved in a block.' }, { status: 403 })
    }

    const [{ data: existingRow, error: existingError }, { data: targetProfile, error: targetProfileError }] = await Promise.all([
      adminSupabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', viewerId)
      .eq('following_id', targetUserId)
      .maybeSingle(),
      adminSupabase
        .from('profiles')
        .select('privacy_level, is_public, privacy_preferences')
        .eq('user_id', targetUserId)
        .maybeSingle(),
    ])
    if (existingError) throw existingError
    if (targetProfileError) throw targetProfileError

    if (existingRow?.id) {
      return NextResponse.json({ success: true, ...(await getFollowSummary(viewerId, targetUserId)) })
    }

    const { data: pendingRequest, error: pendingRequestError } = await adminSupabase
      .from('follow_requests')
      .select('id')
      .eq('follower_id', viewerId)
      .eq('following_id', targetUserId)
      .eq('status', 'pending')
      .maybeSingle()
    if (pendingRequestError) throw pendingRequestError

    const targetPrivacy = targetProfile?.is_public === false
      ? (['followers', 'private'].includes(targetProfile.privacy_level) ? targetProfile.privacy_level : 'followers')
      : targetProfile?.privacy_level || 'public'
    const autoApprove = targetProfile?.privacy_preferences?.autoApproveFollowRequests === true
    if (targetPrivacy === 'private' && !autoApprove) {
      if (!pendingRequest) {
        const { error: requestError } = await adminSupabase
          .from('follow_requests')
          .upsert({
            follower_id: viewerId,
            following_id: targetUserId,
            status: 'pending',
            created_at: new Date().toISOString(),
            responded_at: null,
          }, { onConflict: 'follower_id,following_id' })
        if (requestError) throw requestError

        const { data: actor } = await adminSupabase
          .from('info_users')
          .select('id, full_name')
          .eq('id', viewerId)
          .maybeSingle()
        try {
          await notifyFollowEvent({
            recipientId: targetUserId,
            actorId: viewerId,
            message: `${actor?.full_name || 'Someone'} requested to follow you.`,
            link: `/info/user/profile/${viewerId}`,
            type: 'follow_request',
          })
        } catch (notificationError) {
          console.error('Follow request notification insert failed:', notificationError)
        }
      }

      return NextResponse.json({
        success: true,
        ...(await getFollowSummary(viewerId, targetUserId, false, true)),
      })
    }

    const { data: originalFollowRow, error: originalFollowError } = await adminSupabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', targetUserId)
      .eq('following_id', viewerId)
      .maybeSingle()
    if (originalFollowError) throw originalFollowError

    const { error: insertError } = await adminSupabase
      .from('user_follows')
      .insert({ follower_id: viewerId, following_id: targetUserId })

    if (insertError && insertError.code !== '23505') {
      console.error('Follow insert failed:', insertError)
      return NextResponse.json({ success: false, message: publicErrorMessage(insertError, 'Unable to follow this user.') }, { status: 500 })
    }
    const { error: clearRequestError } = await adminSupabase
      .from('follow_requests')
      .update({ status: 'approved', responded_at: new Date().toISOString() })
      .eq('follower_id', viewerId)
      .eq('following_id', targetUserId)
      .eq('status', 'pending')
    if (clearRequestError) throw clearRequestError

    const createdNewFollow = !insertError
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
    const actorProfileLink = `/info/user/profile/${viewerId}`

    if (createdNewFollow && (!targetUser?.user_type || targetUser.user_type !== 'admin')) {
      try {
        await notifyFollowEvent({
          recipientId: targetUserId,
          actorId: viewerId,
          actorName,
          message: originalFollowRow?.id
            ? `${actorName} followed you back.`
            : `${actorName} started following you.`,
          link: actorProfileLink,
          type: 'follow',
        })
      } catch (notificationError) {
        console.error('Follow notification insert failed:', notificationError)
      }
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
    return NextResponse.json({ success: false, message: publicErrorMessage(error, 'Unable to unfollow this user.') }, { status: 500 })
  }
  const { error: requestError } = await adminSupabase
    .from('follow_requests')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('follower_id', viewerId)
    .eq('following_id', targetUserId)
    .eq('status', 'pending')
  if (requestError) {
    console.error('Follow request cancellation failed:', requestError)
    return NextResponse.json({ success: false, message: 'Follow status changed, but the pending request could not be cancelled.' }, { status: 500 })
  }

  try {
    const summary = await getFollowSummary(viewerId, targetUserId)
    return NextResponse.json({ success: true, ...summary, is_following: false, is_mutual: false })
  } catch (summaryError) {
    console.error('Unfollow summary failed:', summaryError)
    return NextResponse.json({ success: false, message: 'Unfollow saved, but its status could not be refreshed.' }, { status: 500 })
  }
}
