// app/(subsystems)/info/api/activity/track/route.js
// Records user engagement (comment / like / share / save) into the activity log
// and notifies all admins via the info_notifications table.
//
// Uses the service role key so a normal (non-admin) user's browser can record
// admin-targeted notifications without hitting RLS restrictions.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { buildActivityMeta, buildActivityMessage, buildUserNotificationMessage, buildUserNotificationTitle } from '@/lib/trackActivity'
import { getServerSession } from '@/lib/serverAuth'
import { publicErrorMessage } from '@/lib/publicError'

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
    blog: `/info/user/blogs/${entityId}`,
    article: `/info/user/blogs/${entityId}`,
    event: `/info/user/events/${entityId}`,
    forum: `/info/user/forums/${entityId}`,
    forum_thread: `/info/user/forums/${entityId}`,
    user_post: `/info/user/posts/${entityId}`,
    post: `/info/user/posts/${entityId}`,
    announcement: `/info/user/announcements/${entityId}`,
    comment: `/info/user/comments/${entityId}`,
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

export async function GET(request) {
  if (!adminSupabase) return missingConfig()

  const session = getServerSession(request)
  if (!session?.user_id) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  const scope = new URL(request.url).searchParams.get('scope') || 'sessions'
  const isAdmin = ['admin', 'administrator'].includes(String(session.role || '').toLowerCase())
  if (scope === 'recent' && !isAdmin) {
    return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 })
  }
  const searchParams = new URL(request.url).searchParams
  const isPaginated = scope === 'recent' && searchParams.has('page')
  const requestedLimit = Number.parseInt(searchParams.get('limit') || '', 10)
  const recentLimit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 8
  const requestedPage = Number.parseInt(searchParams.get('page') || '', 10)
  const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1
  const activityType = String(searchParams.get('activityType') || '').trim().slice(0, 60)
  const search = String(searchParams.get('search') || '').trim().replace(/[^a-zA-Z0-9\s@.-]/g, '').slice(0, 100)
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const before = searchParams.get('before') || ''
  const isDate = (value) => {
    if (!value) return true
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }

  if (isPaginated && (!isDate(from) || !isDate(to))) {
    return NextResponse.json({ success: false, message: 'Date filters must use YYYY-MM-DD format.' }, { status: 400 })
  }
  if (isPaginated && before && (before.length > 40 || Number.isNaN(Date.parse(before)))) {
    return NextResponse.json({ success: false, message: 'The export snapshot timestamp is invalid.' }, { status: 400 })
  }
  if (isPaginated && from && to && from > to) {
    return NextResponse.json({ success: false, message: 'The start date must be on or before the end date.' }, { status: 400 })
  }

  try {
    let query = adminSupabase
      .from('user_activity_log')
      .select('id, user_id, activity_type, entity_type, entity_id, description, metadata, created_at, info_users!user_activity_log_user_id_fkey(full_name, email)', isPaginated ? { count: 'exact' } : undefined)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(scope === 'recent' ? recentLimit : 20)

    if (isPaginated) {
      if (activityType) query = query.eq('activity_type', activityType)
      if (search) query = query.or(`description.ilike.%${search}%,activity_type.ilike.%${search}%,entity_type.ilike.%${search}%`)
      if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`)
      if (to) {
        const toExclusive = new Date(`${to}T00:00:00.000Z`)
        toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)
        query = query.lt('created_at', toExclusive.toISOString())
      }
      if (before) query = query.lte('created_at', before)
      const start = (page - 1) * recentLimit
      query = query.range(start, start + recentLimit - 1)
    } else if (scope !== 'recent') {
      query = query
        .eq('user_id', session.user_id)
        .in('activity_type', ['login', 'logout', 'sign_in', 'sign_out', 'session', 'auth'])
    }

    const { data, error, count } = await query
    if (error) throw error
    return NextResponse.json({
      success: true,
      activities: data || [],
      ...(isPaginated ? { total: count || 0, page, limit: recentLimit } : {}),
    }, {
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Activity read error:', error)
    return NextResponse.json({ success: false, message: publicErrorMessage(error, 'Unable to load activity.') }, { status: 500 })
  }
}

// Notification links must stay on this site (no external or protocol-relative URLs).
function safeInternalLink(value) {
  const link = typeof value === 'string' ? value.trim() : ''
  if (!link.startsWith('/info/') || link.startsWith('//') || link.includes('\\') || link.length > 300) return null
  return link
}

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OWNER_LOOKUP_TYPES = new Set(['blog', 'post', 'user_post', 'event', 'forum', 'forum_thread', 'comment', 'article', 'announcement'])

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
  if (!entityId) return '/info/admin/dashboard'
  const links = {
    blog: `/info/admin/blog?open=${encodeURIComponent(entityId)}`,
    event: `/info/admin/events?open=${encodeURIComponent(entityId)}`,
    forum: `/info/admin/forum?open=${encodeURIComponent(entityId)}`,
    forum_thread: `/info/admin/forum?open=${encodeURIComponent(entityId)}`,
    announcement: `/info/admin/announcement?open=${encodeURIComponent(entityId)}`,
    user_post: `/info/admin/users?open=${encodeURIComponent(entityId)}`,
    post: `/info/admin/users?open=${encodeURIComponent(entityId)}`,
  }
  return links[String(entityType || '').toLowerCase()] || '/info/admin/engagement'
}

export async function POST(request) {
  if (!adminSupabase) return missingConfig()

  let rawBody
  try {
    rawBody = await request.text()
  } catch (error) {
    console.error('Activity request body read failed:', error)
    return NextResponse.json(
      { success: false, message: 'Unable to read the activity request body.' },
      { status: 400 }
    )
  }

  if (!rawBody.trim()) {
    return NextResponse.json(
      { success: false, message: 'Activity request body must not be empty.' },
      { status: 400 }
    )
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json(
      { success: false, message: 'Activity request body must contain valid JSON.' },
      { status: 400 }
    )
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, message: 'Activity request body must be a JSON object.' },
      { status: 400 }
    )
  }

  try {
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

    const contentTitle = String(metadata.contentTitle || metadata.title || entityType || 'content').slice(0, 120)
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
      return NextResponse.json({ success: false, message: publicErrorMessage(activityError) }, { status: 500 })
    }

    if (activityType === 'content_impression') {
      return NextResponse.json({ success: true })
    }

    const meta = buildActivityMeta(activityType)
    const message = buildActivityMessage({ actorName, activityType, contentTitle, entityType })

    // The recipient is looked up from the content itself whenever the type is
    // known; a client-supplied owner is only used (one id, verified to exist)
    // for content types the server cannot resolve.
    const canResolveOwner = OWNER_LOOKUP_TYPES.has(String(entityType || '').toLowerCase())
    const clientOwnerId = [metadata.ownerUserId, metadata.postOwnerId, metadata.recipientUserId, metadata.contentOwnerId]
      .map((value) => String(value || '').trim())
      .find((value) => UUID_TEXT.test(value)) || null
    const resolvedOwnerId = canResolveOwner ? await resolveOwnerUserId(entityType, entityId) : clientOwnerId
    const explicitOwnerIds = resolvedOwnerId ? [resolvedOwnerId] : []
    const notificationPostId = metadata.postId || metadata.contentId || entityId || null
    const notificationPostOwnerId = resolvedOwnerId || userId || null
    let ownerIsAdmin = false

    let targetLink = safeInternalLink(metadata.link || metadata.href || metadata.action_url) || routeForEntity(entityType, entityId)
    if (!targetLink && entityType === 'comment' && metadata.contentType && metadata.contentId) {
      targetLink = routeForEntity(metadata.contentType, metadata.contentId)
    }

    if (resolvedOwnerId) {
      const { data: owner } = await adminSupabase
        .from('info_users')
        .select('id, user_type')
        .eq('id', resolvedOwnerId)
        .maybeSingle()
      if (!owner) explicitOwnerIds.length = 0
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

    }

    // Mentions: at most 10 distinct, existing accounts.
    const mentionIds = Array.isArray(metadata?.mentionedUserIds)
      ? [...new Set(metadata.mentionedUserIds.map(String).filter((id) => UUID_TEXT.test(id) && id !== userId))].slice(0, 10)
      : []
    if (mentionIds.length) {
      const { data: mentionedUsers } = await adminSupabase.from('info_users').select('id').in('id', mentionIds)
      for (const mentioned of mentionedUsers || []) recipientUserIds.add(mentioned.id)
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
      { success: false, message: publicErrorMessage(error, 'Unable to track activity') },
      { status: 500 }
    )
  }
}