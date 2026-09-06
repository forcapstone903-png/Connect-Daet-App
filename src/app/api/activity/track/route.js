// app/api/activity/track/route.js
// Records user engagement (comment / like / share / save) into the activity log
// and notifies all admins via the info_notifications table.
//
// Uses the service role key so a normal (non-admin) user's browser can record
// admin-targeted notifications without hitting RLS restrictions.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { buildActivityMeta, buildActivityMessage, buildUserNotificationMessage, buildUserNotificationTitle } from '@/lib/trackActivity'
import { getServerSession } from '@/lib/serverAuth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function missingConfig() {
  return NextResponse.json(
    { success: false, message: 'Server is not configured for activity tracking.' },
    { status: 500 }
  )
}

async function resolveOwnerUserId(entityType, entityId) {
  if (!entityType || !entityId) return null

  try {
    const lookupMap = {
      blog: () => adminSupabase.from('info_blogs').select('created_by, user_id').eq('id', entityId).maybeSingle(),
      post: () => adminSupabase.from('info_user_posts').select('user_id').eq('id', entityId).maybeSingle(),
      article: () => adminSupabase.from('info_blogs').select('created_by, user_id').eq('id', entityId).maybeSingle(),
      announcement: () => adminSupabase.from('info_announcements').select('created_by, user_id').eq('id', entityId).maybeSingle(),
    }

    const queryFn = lookupMap[String(entityType).toLowerCase()]
    if (!queryFn) return null

    const { data } = await queryFn()
    if (!data) return null

    return data.created_by || data.user_id || null
  } catch (error) {
    console.error('Failed to resolve entity owner:', error)
    return null
  }
}

export async function POST(request) {
  if (!adminSupabase) return missingConfig()

  try {
    const body = await request.json()
    const authenticatedUserId = getServerSession(request)?.user_id
    const userId = authenticatedUserId
    const activityType = body.activityType || body.activity_type
    const entityType = body.entityType || body.entity_type || null
    const entityId = body.entityId || body.entity_id || null
    const description = (body.description || '').toString().trim()
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}

    if (!userId || !activityType || (body.userId && body.userId !== userId) || (body.user_id && body.user_id !== userId)) {
      return NextResponse.json(
        { success: false, message: 'userId and activityType are required.' },
        { status: 400 }
      )
    }

    let actorName = 'A user'
    const { data: actor } = await adminSupabase
      .from('info_users')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle()
    if (actor) {
      actorName = actor.full_name || (actor.email || '').split('@')[0] || 'A user'
    }

    const contentTitle = metadata.contentTitle || metadata.title || entityType || 'content'
    const recordDescription = description || buildActivityMessage({ actorName, activityType, contentTitle, entityType })
    const { error: activityError } = await adminSupabase.from('user_activity_log').insert({
      user_id: userId,
      activity_type: activityType,
      entity_type: entityType,
      entity_id: entityId,
      description: recordDescription,
      metadata,
    })

    if (activityError) {
      console.error('Activity insert error:', activityError)
      return NextResponse.json({ success: false, message: activityError.message }, { status: 500 })
    }

    const meta = buildActivityMeta(activityType)
    const message = buildActivityMessage({ actorName, activityType, contentTitle, entityType })

    const { data: admins, error: adminsError } = await adminSupabase
      .from('info_users')
      .select('id')
      .eq('user_type', 'admin')

    if (!adminsError && Array.isArray(admins) && admins.length > 0) {
      const notifications = admins.map((admin) => ({
        user_id: admin.id,
        title: meta.title,
        message,
        type: 'activity',
        is_read: false,
      }))

      const { error: notifError } = await adminSupabase.from('info_notifications').insert(notifications)
      if (notifError) {
        console.error('Admin notification insert error:', notifError)
      }
    }

    const recipientUserIds = new Set()

    if (activityType === 'new_post') {
      const { data: followers, error: followerLookupError } = await adminSupabase
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', userId)

      if (!followerLookupError && Array.isArray(followers)) {
        followers.forEach((follow) => {
          if (follow.follower_id && follow.follower_id !== userId) {
            recipientUserIds.add(follow.follower_id)
          }
        })
      }
    } else {
      const explicitOwnerId = metadata.ownerUserId || metadata.postOwnerId || metadata.recipientUserId || null
      if (explicitOwnerId) recipientUserIds.add(explicitOwnerId)

      const resolvedOwnerId = metadata.ownerUserId || metadata.postOwnerId || metadata.recipientUserId || await resolveOwnerUserId(entityType, entityId)
      if (resolvedOwnerId && resolvedOwnerId !== userId) recipientUserIds.add(resolvedOwnerId)
    }

    if (recipientUserIds.size > 0) {
      const userNotifications = [...recipientUserIds].map((recipientUserId) => ({
        user_id: recipientUserId,
        title: buildUserNotificationTitle(activityType),
        message: buildUserNotificationMessage({ actorName, activityType, contentTitle, entityType }),
        type: 'info',
        is_read: false,
      }))

      const { error: userNotifError } = await adminSupabase.from('info_notifications').insert(userNotifications)
      if (userNotifError) {
        console.error('User notification insert error:', userNotifError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Track activity error:', error)
    return NextResponse.json(
      { success: false, message: error.message || 'Unable to track activity' },
      { status: 500 }
    )
  }
}