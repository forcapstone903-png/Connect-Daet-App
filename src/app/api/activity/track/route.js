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

function activityNotificationType(activityType) {
  return {
    comment: 'comment',
    react_content: 'reaction',
    share_content: 'share',
    save_content: 'save',
    new_post: 'post',
    follow: 'follow',
    mention: 'mention',
    message: 'message',
    event: 'event',
  }[activityType] || 'info'
}

function routeForEntity(entityType, entityId) {
  if (!entityType || !entityId) return null
  const normalized = String(entityType).toLowerCase()
  const map = {
    blog: `/user/blogs/${entityId}`,
    article: `/user/blogs/${entityId}`,
    event: `/user/events/${entityId}`,
    forum: `/user/forums/${entityId}`,
    forum_thread: `/user/forums/${entityId}`,
    user_post: `/user/posts/${entityId}`,
    post: `/user/posts/${entityId}`,
    announcement: `/user/announcements/${entityId}`,
    comment: `/user/comments/${entityId}`,
  }
  return map[normalized] || null
}

async function shouldSkipNotification(userId, link) {
  if (!userId || !link) return false
  const { data, error } = await adminSupabase
    .from('info_notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('link', link)
    .limit(1)

  if (error) return false
  return Array.isArray(data) && data.length > 0
}

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
      user_post: () => adminSupabase.from('info_user_posts').select('user_id').eq('id', entityId).maybeSingle(),
      event: () => adminSupabase.from('info_events').select('created_by').eq('id', entityId).maybeSingle(),
      forum: () => adminSupabase.from('forum_threads').select('created_by').eq('id', entityId).maybeSingle(),
      forum_thread: () => adminSupabase.from('forum_threads').select('created_by').eq('id', entityId).maybeSingle(),
      comment: async () => {
        const { data: comment } = await adminSupabase
          .from('content_comments')
          .select('user_id, content_type, content_id')
          .eq('id', entityId)
          .maybeSingle()

        if (!comment) return { data: null }

        if (comment.content_type && comment.content_id) {
          const contentOwner = await resolveOwnerUserId(comment.content_type, comment.content_id)
          if (contentOwner) return { data: { created_by: contentOwner } }
        }

        return comment.user_id ? { data: { created_by: comment.user_id } } : { data: null }
      },
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

function buildAdminLink(entityType, entityId, metadata = {}) {
  if (String(entityType || '').toLowerCase() === 'comment') {
    return buildAdminLink(metadata.contentType, metadata.contentId)
  }
  if (!entityId) return '/admin/dashboard'
  const links = {
    blog: `/admin/blog?open=${encodeURIComponent(entityId)}`,
    event: `/admin/events?open=${encodeURIComponent(entityId)}`,
    forum: `/admin/forum?open=${encodeURIComponent(entityId)}`,
    forum_thread: `/admin/forum?open=${encodeURIComponent(entityId)}`,
    announcement: `/admin/announcement?open=${encodeURIComponent(entityId)}`,
    user_post: `/admin/users?open=${encodeURIComponent(entityId)}`,
    post: `/admin/users?open=${encodeURIComponent(entityId)}`,
  }
  return links[String(entityType || '').toLowerCase()] || '/admin/engagement'
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

    const explicitOwnerId = metadata.ownerUserId || metadata.postOwnerId || metadata.recipientUserId || metadata.contentOwnerId || null
    const explicitOwnerIds = [metadata.ownerUserId, metadata.postOwnerId, metadata.recipientUserId, metadata.contentOwnerId]
      .filter((value) => value && String(value).trim() !== '')
      .map((value) => String(value))
    const resolvedOwnerId = explicitOwnerIds[0] || await resolveOwnerUserId(entityType, entityId)
    const notificationPostId = metadata.postId || metadata.contentId || entityId || null
    const notificationPostOwnerId = resolvedOwnerId || metadata.ownerUserId || metadata.postOwnerId || metadata.contentOwnerId || userId || null
    let ownerIsAdmin = false

    let targetLink = metadata.link || metadata.href || metadata.action_url || routeForEntity(entityType, entityId)
    if (!targetLink && entityType === 'comment' && metadata.contentType && metadata.contentId) {
      targetLink = routeForEntity(metadata.contentType, metadata.contentId)
    }

    if (resolvedOwnerId) {
      const { data: owner } = await adminSupabase
        .from('info_users')
        .select('id, user_type')
        .eq('id', resolvedOwnerId)
        .maybeSingle()
      ownerIsAdmin = owner?.user_type === 'admin'
    }

    if (ownerIsAdmin && resolvedOwnerId !== userId) {
      const adminNotificationPostId = metadata.postId || metadata.contentId || entityId || null
      const { error: notifError } = await adminSupabase.from('info_notifications').insert({
        user_id: resolvedOwnerId,
        title: meta.title,
        message,
        type: 'activity',
        is_read: false,
        link: buildAdminLink(entityType, entityId, metadata),
        post_id: adminNotificationPostId,
        actor_id: userId,
      })
      if (notifError) console.error('Admin notification insert error:', notifError)
    }

    const recipientUserIds = new Set()

    if (activityType === 'new_post') {
      const { data: followers, error: followerLookupError } = await adminSupabase
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', userId)

      if (!followerLookupError && Array.isArray(followers)) {
        const followerIds = followers.map((follow) => follow.follower_id).filter((id) => id && id !== userId)
        if (followerIds.length) {
          const { data: followerUsers } = await adminSupabase
            .from('info_users')
            .select('id')
            .in('id', followerIds)

          ;(followerUsers || []).forEach((follower) => {
            recipientUserIds.add(follower.id)
          })
        }
      }
    } else {
      for (const ownerCandidate of explicitOwnerIds) {
        if (ownerCandidate && ownerCandidate !== userId && !ownerIsAdmin) recipientUserIds.add(ownerCandidate)
      }

      if (resolvedOwnerId && resolvedOwnerId !== userId && !ownerIsAdmin) recipientUserIds.add(resolvedOwnerId)
    }

    if (metadata?.mentionedUserIds?.length) {
      for (const mentionedId of metadata.mentionedUserIds) {
        if (mentionedId && mentionedId !== userId) recipientUserIds.add(mentionedId)
      }
    }

    if (recipientUserIds.size > 0) {
      const userNotifications = []
      const baseNotificationRow = {
        title: buildUserNotificationTitle(activityType),
        message: buildUserNotificationMessage({ actorName, activityType, contentTitle, entityType }),
        type: activityNotificationType(activityType),
        is_read: false,
      }

      for (const recipientUserId of recipientUserIds) {
        const targetLink = metadata.link || metadata.href || metadata.action_url || routeForEntity(entityType, entityId)
        if (!targetLink) continue

        if (await shouldSkipNotification(recipientUserId, targetLink)) continue

        userNotifications.push({
          user_id: recipientUserId,
          title: baseNotificationRow.title,
          message: baseNotificationRow.message,
          type: baseNotificationRow.type,
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          link: targetLink,
          post_id: notificationPostId,
          post_owner_id: notificationPostOwnerId,
          actor_id: userId,
        })
      }

      if (userNotifications.length > 0) {
        const { error: userNotifError } = await adminSupabase.from('info_notifications').insert(userNotifications)
        if (userNotifError) {
          console.error('User notification insert error:', userNotifError)
        }
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