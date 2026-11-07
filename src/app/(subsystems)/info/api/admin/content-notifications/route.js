import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function normalizeType(type) {
  if (!type) return 'info'
  return String(type).toLowerCase()
}

function notificationTitleFor(type) {
  if (type === 'event') return 'New event from Administrator'
  if (type === 'announcement') return 'New announcement from Administrator'
  if (type === 'forum' || type === 'forum_thread') return 'New forum post from Administrator'
  return 'New post from Administrator'
}

// `info_announcements.audience` decides who should receive a site announcement.
const ANNOUNCEMENT_AUDIENCE_USER_TYPES = {
  tourists: 'tourist',
  businesses: 'business',
  admins: 'admin',
}

const RECIPIENT_CHUNK_SIZE = 500
const DEDUPE_LOOKUP_CHUNK_SIZE = 200
// Guard rail so a broadcast cannot run unbounded in a single request.
const MAX_BROADCAST_RECIPIENTS = 2000

function isMissingOptionalColumn(error) {
  return Boolean(error) && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message || ''))
}

function chunkValues(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function resolveAnnouncementAudience(adminSupabase, contentId) {
  if (!contentId) return null

  const { data, error } = await adminSupabase
    .from('info_announcements')
    .select('audience')
    .eq('id', contentId)
    .maybeSingle()

  if (error) {
    console.error('Announcement audience lookup failed:', error)
    return null
  }

  return data?.audience || null
}

// Broadcast recipients come from the announcement target group for announcements and
// from the active member base for community content. The publisher is always excluded.
async function resolveAudienceRecipientIds(adminSupabase, { contentType, contentId, audience, actorId }) {
  let resolvedAudience = audience ? String(audience).toLowerCase() : null
  if (contentType === 'announcement' && !resolvedAudience) {
    resolvedAudience = String((await resolveAnnouncementAudience(adminSupabase, contentId)) || 'all').toLowerCase()
  }

  let query = adminSupabase.from('info_users').select('id').eq('status', 'active')

  if (contentType === 'announcement') {
    const audienceUserType = ANNOUNCEMENT_AUDIENCE_USER_TYPES[resolvedAudience || 'all']
    if (audienceUserType) query = query.eq('user_type', audienceUserType)
  } else {
    // Community content (events, blogs, forums) is published to regular members.
    query = query.neq('user_type', 'admin')
  }

  const { data: users, error } = await query.limit(MAX_BROADCAST_RECIPIENTS)
  if (error) {
    console.error('Audience recipient lookup failed:', error)
    return []
  }

  return [...new Set((users || []).map((user) => user.id).filter((id) => id && id !== actorId))]
}

async function findAlreadyNotifiedUserIds(adminSupabase, { recipientIds, link, type, title, message }) {
  const notifiedIds = new Set()

  for (const chunk of chunkValues(recipientIds, DEDUPE_LOOKUP_CHUNK_SIZE)) {
    let lookup = adminSupabase.from('info_notifications').select('user_id').in('user_id', chunk)
    lookup = link
      ? lookup.eq('link', link).eq('type', type)
      : lookup.eq('type', type).eq('title', title).eq('message', message)

    const { data, error } = await lookup
    if (error) {
      console.error('Notification duplicate lookup failed:', error)
      continue
    }

    for (const notification of data || []) {
      if (notification?.user_id) notifiedIds.add(notification.user_id)
    }
  }

  return notifiedIds
}

async function insertNotificationRows(adminSupabase, rows) {
  let inserted = 0

  for (const chunk of chunkValues(rows, RECIPIENT_CHUNK_SIZE)) {
    let { error } = await adminSupabase.from('info_notifications').insert(chunk)

    // Optional columns can lag behind the database during a PostgREST schema-cache
    // refresh. Retry with the legacy shapes so delivery still succeeds.
    if (isMissingOptionalColumn(error)) {
      const baseRows = chunk.map(({ post_id, post_owner_id, ...row }) => row)
      ;({ error } = await adminSupabase.from('info_notifications').insert(baseRows))
      if (isMissingOptionalColumn(error)) {
        const legacyRows = baseRows.map(({ actor_id, ...row }) => row)
        ;({ error } = await adminSupabase.from('info_notifications').insert(legacyRows))
      }
    }

    if (error && error.code !== '23505') throw error
    inserted += chunk.length
  }

  return inserted
}

export async function POST(request) {
  const session = getServerSession(request)
  const currentUserId = session?.user_id || null
  const currentRole = String(session?.role || '').toLowerCase()

  if (!currentUserId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Notification service is not configured.' }, { status: 500 })
  if (currentRole !== 'admin' && currentRole !== 'administrator') {
    return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const contentType = normalizeType(body.type || body.contentType || 'post')
    const contentId = String(body.contentId || body.id || body.entityId || '').trim()
    const title = String(body.title || body.postTitle || '').trim()
    const message = String(body.message || body.content || body.body || title).trim()
    const link = String(body.link || body.action_url || body.href || '').trim()
    const audience = body.audience ? String(body.audience).trim().toLowerCase() : null

    if (!title) {
      return NextResponse.json({ success: false, message: 'Content title is required.' }, { status: 400 })
    }

    const [{ data: follows, error: followsError }, audienceRecipientIds] = await Promise.all([
      adminSupabase
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', currentUserId)
        .neq('follower_id', currentUserId),
      resolveAudienceRecipientIds(adminSupabase, { contentType, contentId, audience, actorId: currentUserId }),
    ])

    if (followsError) throw followsError

    const followerIds = (follows || []).map((follow) => follow.follower_id).filter(Boolean)
    const recipientIds = [...new Set([...audienceRecipientIds, ...followerIds].filter((id) => id && id !== currentUserId))]

    if (!recipientIds.length) {
      return NextResponse.json({ success: true, inserted: 0, recipients: 0 })
    }

    const { data: actor } = await adminSupabase
      .from('info_users')
      .select('full_name')
      .eq('id', currentUserId)
      .maybeSingle()
    const actorName = actor?.full_name || 'Administrator'
    const notificationTitle = notificationTitleFor(contentType)
    const notificationMessage = `${actorName} published a new post: ${message}`

    // Keep a deterministic duplicate shield so re-publishing the same link does not
    // deliver the same notification twice.
    const alreadyNotifiedIds = await findAlreadyNotifiedUserIds(adminSupabase, {
      recipientIds,
      link,
      type: contentType,
      title: notificationTitle,
      message: notificationMessage,
    })

    const timestamp = new Date().toISOString()
    const notificationRows = recipientIds
      .filter((recipientId) => !alreadyNotifiedIds.has(recipientId))
      .map((recipientId) => ({
        user_id: recipientId,
        title: notificationTitle,
        message: notificationMessage,
        type: contentType,
        is_read: false,
        created_at: timestamp,
        updated_at: timestamp,
        link,
        post_id: contentId || null,
        post_owner_id: currentUserId,
        actor_id: currentUserId,
      }))

    if (!notificationRows.length) {
      return NextResponse.json({ success: true, inserted: 0, recipients: recipientIds.length })
    }

    const inserted = await insertNotificationRows(adminSupabase, notificationRows)

    return NextResponse.json({ success: true, inserted, recipients: recipientIds.length })
  } catch (error) {
    console.error('Content notification creation failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to create notifications.' }, { status: 500 })
  }
}
