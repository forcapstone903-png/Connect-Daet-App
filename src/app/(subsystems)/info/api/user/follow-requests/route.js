import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
}

function errorResponse(message, status = 500) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

export async function GET(request) {
  const viewerId = getServerSession(request)?.user_id
  if (!viewerId) return errorResponse('Please log in to view follow requests.', 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return errorResponse('Follow requests are not configured.')

  try {
    const { data: requests, error } = await adminSupabase
      .from('follow_requests')
      .select('id, follower_id, created_at')
      .eq('following_id', viewerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error

    const requesterIds = [...new Set((requests || []).map((item) => item.follower_id))]
    const { data: users, error: usersError } = requesterIds.length
      ? await adminSupabase
        .from('info_users')
        .select('id, full_name, profile_image_url')
        .in('id', requesterIds)
      : { data: [], error: null }
    if (usersError) throw usersError
    const usersById = new Map((users || []).map((user) => [user.id, user]))

    return NextResponse.json({
      success: true,
      requests: (requests || []).map((item) => ({
        ...item,
        requester: usersById.get(item.follower_id) || { id: item.follower_id, full_name: 'Community member' },
      })),
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Follow requests fetch failed:', error)
    return errorResponse('Unable to load follow requests right now.')
  }
}

export async function PATCH(request) {
  const viewerId = getServerSession(request)?.user_id
  if (!viewerId) return errorResponse('Please log in to manage follow requests.', 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return errorResponse('Follow requests are not configured.')

  let body
  try {
    body = await request.json()
  } catch {
    return errorResponse('A valid follow request action is required.', 400)
  }

  const requesterId = String(body?.requesterId || '').trim()
  const notificationId = String(body?.notificationId || '').trim()
  const action = body?.action
  if (!requesterId || !['approve', 'reject'].includes(action) || requesterId === viewerId) {
    return errorResponse('A valid follow request action is required.', 400)
  }

  try {
    const { data: followRequest, error: requestError } = await adminSupabase
      .from('follow_requests')
      .select('id')
      .eq('follower_id', requesterId)
      .eq('following_id', viewerId)
      .eq('status', 'pending')
      .maybeSingle()
    if (requestError) throw requestError
    if (!followRequest) return errorResponse('This follow request is no longer pending.', 409)

    if (action === 'approve') {
      const [viewerBlockResult, requesterBlockResult] = await Promise.all([
        adminSupabase
          .from('user_blocks')
          .select('blocker_id')
          .eq('blocker_id', viewerId)
          .eq('blocked_id', requesterId)
          .limit(1),
        adminSupabase
          .from('user_blocks')
          .select('blocker_id')
          .eq('blocker_id', requesterId)
          .eq('blocked_id', viewerId)
          .limit(1),
      ])
      if (viewerBlockResult.error) throw viewerBlockResult.error
      if (requesterBlockResult.error) throw requesterBlockResult.error
      if (viewerBlockResult.data?.length || requesterBlockResult.data?.length) {
        return errorResponse('This follow request cannot be approved while either account has blocked the other.', 403)
      }

      const { error: followError } = await adminSupabase
        .from('user_follows')
        .upsert({ follower_id: requesterId, following_id: viewerId }, { onConflict: 'follower_id,following_id' })
      if (followError) throw followError
    }

    const { error: updateError } = await adminSupabase
      .from('follow_requests')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        responded_at: new Date().toISOString(),
      })
      .eq('id', followRequest.id)
      .eq('status', 'pending')
    if (updateError) throw updateError

    let notificationUpdated = true
    if (action === 'approve' && notificationId) {
      const { error: notificationError } = await adminSupabase
        .from('info_notifications')
        .update({
          title: 'New follower',
          message: 'is now following you.',
          type: 'follow',
          is_read: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', notificationId)
        .eq('user_id', viewerId)
        .eq('actor_id', requesterId)
        .eq('type', 'follow_request')
      if (notificationError) {
        notificationUpdated = false
        console.error('Approved follow request notification update failed:', notificationError)
      }
    }

    return NextResponse.json({ success: true, action, requesterId, notificationUpdated }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Follow request update failed:', error)
    return errorResponse('Unable to update this follow request right now.')
  }
}
