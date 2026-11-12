import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { isValidUuid } from '@/lib/uuid'
import { notifyContentAuthorOfDeletion } from '@/lib/contentDeletionNotifications.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PAGE_SIZE = 50
const STAFF_ROLES = new Set(['admin', 'administrator', 'tourism_officer', 'moderator'])

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function writeAudit(client, actorId, action, tableName, recordId, changes) {
  return client.from('info_audit_log').insert({
    user_id: actorId,
    action,
    table_name: tableName,
    record_id: recordId,
    changes,
  })
}

function isValidContentType(value) {
  return value === 'blog' || value === 'forum_thread'
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Discussion moderation is not configured.' }, 500)

  const params = new URL(request.url).searchParams
  const contentType = params.get('contentType')
  const contentId = params.get('contentId') || ''
  const kind = params.get('kind') || 'comments'
  const rawPage = params.get('page') || '0'
  if (!isValidContentType(contentType) || !isValidUuid(contentId)
    || !/^\d+$/.test(rawPage) || Number(rawPage) > 10000
    || !['comments', 'replies'].includes(kind)
    || (contentType === 'blog' && kind === 'replies')) {
    return respond({ success: false, message: 'Choose a valid blog or forum discussion.' }, 400)
  }

  const page = Number(rawPage)
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  try {
    const isForumReply = contentType === 'forum_thread' && kind === 'replies'
    let query = isForumReply
      ? client.from('forum_replies')
        .select('id, thread_id, user_id, parent_reply_id, content, status, created_at, info_users(full_name, email, profile_image_url, user_type)', { count: 'exact' })
        .eq('thread_id', contentId)
      : client.from('content_comments')
        .select('id, content_id, content_type, user_id, body, parent_id, status, created_at, info_users(full_name, email, profile_image_url, user_type)', { count: 'exact' })
        .eq('content_type', contentType)
        .eq('content_id', contentId)

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error

    const userIds = [...new Set((data || []).map((item) => item.user_id).filter(Boolean))]
    let muteRows = []
    if (userIds.length) {
      const { data: mutes, error: muteError } = await client.from('admin_comment_mutes')
        .select('user_id, reason, expires_at')
        .in('user_id', userIds)
        .is('lifted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      if (muteError) throw muteError
      muteRows = mutes || []
    }

    const muteByUser = new Map(muteRows.map((mute) => [mute.user_id, mute]))
    const items = (data || []).map((item) => {
      const mute = muteByUser.get(item.user_id)
      return {
        id: item.id,
        source: isForumReply ? 'forum_replies' : 'content_comments',
        userId: item.user_id,
        author: item.info_users || null,
        content: item.body || item.content || '',
        parentId: item.parent_id || item.parent_reply_id || null,
        status: item.status,
        createdAt: item.created_at,
        muted: Boolean(mute),
        muteReason: mute?.reason || null,
        muteExpiresAt: mute?.expires_at || null,
      }
    })

    return respond({
      success: true,
      items,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total: count || 0,
        hasMore: from + items.length < (count || 0),
      },
    })
  } catch (error) {
    console.error('Moderator discussion load failed:', error)
    return respond({ success: false, message: 'Unable to load discussion comments.' }, 500)
  }
}

export async function DELETE(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Discussion moderation is not configured.' }, 500)

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A comment is required.' }, 400)
  }

  const { contentType, source, contentId, commentId } = body || {}
  if (!isValidContentType(contentType) || !isValidUuid(contentId) || !isValidUuid(commentId)
    || !['content_comments', 'forum_replies'].includes(source)
    || (source === 'forum_replies' && contentType !== 'forum_thread')) {
    return respond({ success: false, message: 'Choose a valid discussion comment.' }, 400)
  }

  try {
    const query = source === 'forum_replies'
      ? client.from('forum_replies').delete().eq('id', commentId).eq('thread_id', contentId)
      : client.from('content_comments').delete().eq('id', commentId).eq('content_type', contentType).eq('content_id', contentId)
    const { data, error } = await query.select('id, user_id').maybeSingle()
    if (error) throw error
    if (!data) return respond({ success: false, message: 'This comment was already removed or no longer belongs to this discussion.' }, 404)

    const notification = await notifyContentAuthorOfDeletion(client, {
      authorId: data.user_id,
      actorId: authorization.session.user_id,
      contentType: source === 'forum_replies' ? 'forum reply' : 'comment',
    })
    const { error: auditError } = await writeAudit(
      client,
      authorization.session.user_id,
      'moderator_deleted_comment',
      source,
      commentId,
      { contentType, contentId, commentAuthorId: data.user_id }
    )
    if (auditError) throw auditError
    return respond({
      success: true,
      commentId,
      notificationSent: notification.sent,
      notificationWarning: notification.warning,
    })
  } catch (error) {
    console.error('Moderator comment deletion failed:', error)
    return respond({ success: false, message: 'Unable to delete this comment and record the moderation action.' }, 500)
  }
}

export async function POST(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Discussion moderation is not configured.' }, 500)

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A comment-mute action is required.' }, 400)
  }

  const action = body?.action
  const userId = String(body?.userId || '')
  if (!['mute', 'unmute'].includes(action) || !isValidUuid(userId) || userId === authorization.session.user_id) {
    return respond({ success: false, message: 'Choose a valid community member and mute action.' }, 400)
  }

  try {
    const { data: target, error: targetError } = await client.from('info_users')
      .select('id, user_type')
      .eq('id', userId)
      .maybeSingle()
    if (targetError) throw targetError
    if (!target) return respond({ success: false, message: 'Community member not found.' }, 404)
    if (STAFF_ROLES.has(String(target.user_type || '').trim().toLowerCase())) {
      return respond({ success: false, message: 'Staff accounts cannot be muted through community moderation.' }, 400)
    }

    const now = new Date().toISOString()
    if (action === 'mute') {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      const durationDays = body.durationDays == null || body.durationDays === '' ? null : Number(body.durationDays)
      if (!reason || reason.length > 1000) {
        return respond({ success: false, message: 'Provide a reason of 1,000 characters or fewer.' }, 400)
      }
      if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
        return respond({ success: false, message: 'A temporary mute must be between 1 and 365 days.' }, 400)
      }

      const { error: clearError } = await client.from('admin_comment_mutes')
        .update({ lifted_by: authorization.session.user_id, lifted_at: now })
        .eq('user_id', userId)
        .is('lifted_at', null)
      if (clearError) throw clearError

      const { data: mute, error: muteError } = await client.from('admin_comment_mutes')
        .insert({
          user_id: userId,
          reason,
          muted_by: authorization.session.user_id,
          muted_at: now,
          expires_at: durationDays ? new Date(Date.now() + durationDays * 86400000).toISOString() : null,
        })
        .select('id, expires_at')
        .single()
      if (muteError) throw muteError

      const { error: auditError } = await writeAudit(
        client,
        authorization.session.user_id,
        'mute_commenting',
        'admin_comment_mutes',
        mute.id,
        { userId, reason, durationDays, expiresAt: mute.expires_at }
      )
      if (auditError) throw auditError

      const untilText = durationDays ? ` for ${durationDays} day${durationDays === 1 ? '' : 's'}` : ' until a moderator restores access'
      const { error: notificationError } = await client.from('info_notifications').insert({
        user_id: userId,
        title: 'Commenting restricted',
        message: `You cannot comment or reply${untilText}. Reason: ${reason}`,
        type: 'warning',
        is_read: false,
        link: '/info/community-guidelines',
      })
      if (notificationError) console.error('Comment mute notification failed:', notificationError)
      return respond({ success: true, mute })
    }

    const { data: mute, error: unmuteError } = await client.from('admin_comment_mutes')
      .update({ lifted_by: authorization.session.user_id, lifted_at: now })
      .eq('user_id', userId)
      .is('lifted_at', null)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .select('id')
      .maybeSingle()
    if (unmuteError) throw unmuteError
    if (!mute) return respond({ success: false, message: 'This user is not currently muted from commenting.' }, 409)

    const { error: auditError } = await writeAudit(
      client,
      authorization.session.user_id,
      'unmute_commenting',
      'admin_comment_mutes',
      mute.id,
      { userId, liftedAt: now }
    )
    if (auditError) throw auditError
    return respond({ success: true })
  } catch (error) {
    console.error('Moderator comment mute action failed:', error)
    return respond({ success: false, message: 'Unable to save the comment-moderation action.' }, 500)
  }
}
