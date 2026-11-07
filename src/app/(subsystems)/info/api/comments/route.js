import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { normalizeMentionName, parseMentionCandidates } from '@/lib/mentions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function dedupeAndInsertNotifications(adminSupabase, rows) {
  return Promise.all(rows.map(async (row) => {
    const { data: existing } = await adminSupabase
      .from('info_notifications')
      .select('id, title, message, comment_id, reply_id, post_id, updated_at')
      .eq('user_id', row.user_id)
      .eq('link', row.link)
      .eq('type', row.type)
      .eq('actor_id', row.actor_id)
      .limit(1)

    if (existing && existing.length > 0) {
      const current = existing[0]
      const hasChanged = current.title !== row.title || current.message !== row.message || current.comment_id !== row.comment_id || current.reply_id !== row.reply_id || current.post_id !== row.post_id

      if (!hasChanged) return null

      // A newer activity from the same actor replaces the older one, moves it back to
      // the top of the inbox, and marks it unread again so it is not missed.
      return adminSupabase
        .from('info_notifications')
        .update({
          title: row.title,
          message: row.message,
          comment_id: row.comment_id,
          reply_id: row.reply_id,
          post_id: row.post_id,
          link: row.link,
          is_read: false,
          updated_at: new Date().toISOString(),
          created_at: row.created_at,
        })
        .eq('id', current.id)
    }

    return adminSupabase.from('info_notifications').insert(row)
  }))
}

async function resolveOwnerId(adminSupabase, contentType, contentId) {
  const tableMap = {
    blog: ['info_blogs', 'created_by'],
    event: ['info_events', 'created_by'],
    announcement: ['info_announcements', 'created_by'],
    user_post: ['info_user_posts', 'user_id'],
    post: ['info_user_posts', 'user_id'],
    forum_thread: ['forum_threads', 'created_by'],
    forum: ['forum_threads', 'created_by'],
  }

  const map = tableMap[String(contentType || '').toLowerCase()]
  if (!map) return null

  const [table, fk] = map
  const { data } = await adminSupabase.from(table).select(`id, ${fk}`).eq('id', contentId).maybeSingle()
  return data?.[fk] || null
}

async function resolveMentions(adminSupabase, text, actorId, commentId, mentionRefs = []) {
  const candidates = parseMentionCandidates(text)
  const resolved = []
  const normalizedText = String(text || '').toLocaleLowerCase()

  const refsByName = new Map(
    (Array.isArray(mentionRefs) ? mentionRefs : [])
      .filter((ref) => ref?.id && ref?.displayName)
      .map((ref) => [normalizeMentionName(ref.displayName), ref])
  )

  const resolvedNames = new Set()

  for (const candidate of candidates) {
    const selectedRef = mentionRefs.find((ref) => String(ref.displayName || '').trim().toLocaleLowerCase() === candidate.normalizedName)
    let user = null
    if (selectedRef?.id) {
      const result = await adminSupabase.from('info_users').select('id, full_name').eq('id', selectedRef.id).maybeSingle()
      user = result.data
    } else {
      const exactResult = await adminSupabase
        .from('info_users')
        .select('id, full_name')
        .ilike('full_name', candidate.displayName)
        .limit(2)
      const exactMatches = exactResult.data || []
      if (exactMatches.length === 1) {
        user = exactMatches[0]
      } else {
        const prefixResult = await adminSupabase
          .from('info_users')
          .select('id, full_name')
          .ilike('full_name', `${candidate.displayName}%`)
          .limit(2)
        const prefixMatches = prefixResult.data || []
        user = prefixMatches.length === 1 ? prefixMatches[0] : null
      }
    }

    if (!user?.id || user.id === actorId || resolved.some((mention) => mention.mentioned_user_id === user.id)) continue

    resolved.push({
      mentioned_user_id: user.id,
      display_name: user.full_name || candidate.displayName,
      mention_text: candidate.displayName,
      content_type: 'comment',
      content_id: commentId,
      mentioned_by_user_id: actorId,
    })
    resolvedNames.add(normalizeMentionName(user.full_name || candidate.displayName))
  }

  for (const [normalizedName, ref] of refsByName.entries()) {
    if (resolvedNames.has(normalizedName) || !normalizedText.includes(normalizedName)) continue

    const { data: user } = await adminSupabase
      .from('info_users')
      .select('id, full_name')
      .eq('id', ref.id)
      .maybeSingle()

    if (!user?.id || user.id === actorId || resolved.some((mention) => mention.mentioned_user_id === user.id)) continue

    resolved.push({
      mentioned_user_id: user.id,
      display_name: user.full_name || ref.displayName,
      mention_text: ref.displayName,
      content_type: 'comment',
      content_id: commentId,
      mentioned_by_user_id: actorId,
    })
    resolvedNames.add(normalizedName)
  }

  const audienceTokens = [...String(text || '').matchAll(/@(?:followers|highlights)\b/gi)].map((match) => match[0].slice(1).toLowerCase())
  audienceTokens.forEach((token) => {
    if (!resolved.some((mention) => mention.mentioned_user_id === `mention-${token}`)) {
      resolved.push({
        mentioned_user_id: `mention-${token}`,
        display_name: token,
        mention_text: `@${token}`,
        content_type: 'comment',
        content_id: commentId,
        mentioned_by_user_id: actorId,
        isAudienceMention: true,
      })
    }
  })

  const userMentions = resolved.filter((mention) => !mention.isAudienceMention)
  if (userMentions.length) {
    await adminSupabase.from('mentions').upsert(userMentions, {
      onConflict: 'mentioned_user_id,content_type,content_id,mentioned_by_user_id',
      ignoreDuplicates: true,
    })
  }

  return resolved
}

async function mentionNotificationTargets(adminSupabase, mentions, actorId, actorName, contentType, contentId, commentId, ownerId, isReply = false) {
  if (!mentions.length) return []

  const audienceMentioned = mentions.some((mention) => mention.isAudienceMention)
  const { data: followerRows } = audienceMentioned
    ? await adminSupabase.from('user_follows').select('follower_id').eq('following_id', actorId).neq('follower_id', actorId)
    : { data: [] }
  const audienceTargets = [...new Set((followerRows || []).map((row) => row.follower_id).filter(Boolean))].map((userId) => ({
    mentioned_user_id: userId,
    display_name: 'followers',
  }))

  return [...mentions.filter((mention) => !mention.isAudienceMention), ...audienceTargets].map((mention) => {
    const link = routeForEntity(contentType, contentId)
    return {
      user_id: mention.mentioned_user_id,
      title: 'You were mentioned',
      message: `${actorName} mentioned you in ${isReply ? 'a reply' : 'a comment'}.`,
      type: 'mention',
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      link: `${link}#comment-${commentId}`,
      post_id: contentId,
      comment_id: commentId,
      post_owner_id: ownerId,
      actor_id: actorId,
    }
  })
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
    post: `/user/posts/${entityId}`,
    user_post: `/user/posts/${entityId}`,
    announcement: `/user/announcements/${entityId}`,
  }
  return map[normalized] || null
}

const ALLOWED_CONTENT_TYPES = new Set([
  'blog',
  'event',
  'amenity',
  'forum_thread',
  'forum_reply',
  'announcement',
  'user_post',
  'rating',
  'poll',
])

export async function DELETE(request) {
  const session = getServerSession(request)
  if (!session?.user_id) {
    return NextResponse.json({ success: false, message: 'Please sign in to delete your comment.' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Comment service is not configured.' }, { status: 500 })
  }

  const commentId = new URL(request.url).searchParams.get('commentId')?.trim()
  if (!commentId) {
    return NextResponse.json({ success: false, message: 'Comment id is required.' }, { status: 400 })
  }

  try {
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: comment, error: lookupError } = await adminSupabase
      .from('content_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!comment) return NextResponse.json({ success: false, message: 'Comment not found.' }, { status: 404 })
    if (comment.user_id !== session.user_id) {
      return NextResponse.json({ success: false, message: 'You can only delete your own comments.' }, { status: 403 })
    }

    const { error: deleteError } = await adminSupabase
      .from('content_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', session.user_id)

    if (deleteError) throw deleteError
    return NextResponse.json({ success: true, commentId })
  } catch (error) {
    console.error('Comment delete route error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to delete the comment.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const session = getServerSession(request)
    if (!session?.user_id) {
      return NextResponse.json({ success: false, message: 'Please sign in to post a comment.' }, { status: 401 })
    }

    const body = await request.json()
    const contentType = String(body.contentType || '').trim()
    const contentId = String(body.contentId || '').trim()
    const commentBody = String(body.body || '').trim()

    if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId || !commentBody) {
      return NextResponse.json({ success: false, message: 'Invalid comment payload.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: 'Comment service is not configured.' }, { status: 500 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const replyTo = body.replyTo ? String(body.replyTo) : null
    const gifUrl = typeof body.gifUrl === 'string' && body.gifUrl.trim().length > 0 ? body.gifUrl.trim() : null
    const stickerUrl = typeof body.stickerUrl === 'string' && body.stickerUrl.trim().length > 0 ? body.stickerUrl.trim() : null
    const mentionRefs = Array.isArray(body.mentionRefs) ? body.mentionRefs : []

    const { data, error } = await adminSupabase
      .from('content_comments')
      .insert({
        content_type: contentType,
        content_id: contentId,
        user_id: session.user_id,
        parent_id: replyTo,
        body: commentBody,
        gif_url: gifUrl,
        sticker_url: stickerUrl,
        relevance_score: 0,
        status: 'active',
      })
      .select('id, content_type, content_id, user_id, parent_id, body, gif_url, sticker_url, relevance_score, status, created_at')
      .single()

    if (error) {
      console.error('Comment insert error:', error)
      return NextResponse.json({ success: false, message: error.message || 'Unable to post comment.' }, { status: 400 })
    }

    const actor = await adminSupabase.from('info_users').select('full_name').eq('id', session.user_id).maybeSingle()
    const actorName = actor?.data?.full_name || 'Someone'
    const ownerId = await resolveOwnerId(adminSupabase, contentType, contentId)
    const ownerLink = routeForEntity(contentType, contentId)
    const { data: parentComment } = replyTo
      ? await adminSupabase.from('content_comments').select('user_id').eq('id', replyTo).maybeSingle()
      : { data: null }

    const safeCommentExcerpt = commentBody.replace(/\s+/g, ' ').trim()
    const truncatedCommentExcerpt = safeCommentExcerpt.length > 120 ? `${safeCommentExcerpt.slice(0, 120).trim()}…` : safeCommentExcerpt
    const quotedCommentExcerpt = `"${truncatedCommentExcerpt}"`

    const rows = []
    const recipients = new Set([ownerId, parentComment?.user_id].filter((recipientId) => recipientId && recipientId !== session.user_id))
    for (const recipientId of recipients) {
      const isReplyRecipient = Boolean(replyTo && recipientId === parentComment?.user_id)
      rows.push({
        user_id: recipientId,
        title: isReplyRecipient ? 'New reply to your comment' : 'New comment',
        message: isReplyRecipient
          ? `${actorName} replied to your comment: ${quotedCommentExcerpt}`
          : `${actorName} commented on your ${contentType}: ${quotedCommentExcerpt}`,
        type: 'comment',
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        link: `${ownerLink}#comment-${data.id}`,
        post_id: contentId,
        comment_id: data.id,
        reply_id: replyTo ? data.id : null,
        post_owner_id: ownerId,
        actor_id: session.user_id,
      })
    }

    const mentions = await resolveMentions(adminSupabase, commentBody, session.user_id, data.id, mentionRefs)
    const mentionData = mentions.map((mention) => ({ mentioned_user_id: mention.mentioned_user_id, display_name: mention.display_name }))
    if (mentionData.length) {
      await adminSupabase.from('content_comments').update({ mention_data: mentionData }).eq('id', data.id)
      data.mention_data = mentionData
    }
    const mentionRows = await mentionNotificationTargets(adminSupabase, mentions, session.user_id, actorName, contentType, contentId, data.id, ownerId, Boolean(replyTo))
    rows.push(...mentionRows)
    const mentionedUserIds = new Set(mentionRows.map((mention) => mention.user_id))
    const notificationRows = rows.filter((row) => !(row.type === 'comment' && mentionedUserIds.has(row.user_id)))

    if (notificationRows.length > 0) {
      await dedupeAndInsertNotifications(adminSupabase, notificationRows)
    }

    return NextResponse.json({ success: true, comment: data })
  } catch (error) {
    console.error('Comment submit route error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to post comment.' }, { status: 500 })
  }
}
