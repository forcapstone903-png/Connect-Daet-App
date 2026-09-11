import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_CONTENT_TYPES = new Set([
  'blog',
  'event',
  'amenity',
  'forum_thread',
  'forum_reply',
  'comment',
  'announcement',
  'user_post',
  'rating',
  'poll',
])

const ALLOWED_REACTION_TYPES = new Set(['like', 'love', 'laugh', 'wow', 'sad', 'angry'])

const POST_OWNER_TABLES = {
  blog: ['info_blogs', 'created_by'],
  event: ['info_events', 'created_by'],
  forum_thread: ['forum_threads', 'created_by'],
  announcement: ['info_announcements', 'created_by'],
  user_post: ['info_user_posts', 'user_id'],
  post: ['info_user_posts', 'user_id'],
}

function routeForEntity(entityType, entityId) {
  const normalized = String(entityType || '').toLowerCase()
  const routes = {
    blog: `/user/blogs/${entityId}`,
    event: `/user/events/${entityId}`,
    forum: `/user/forums/${entityId}`,
    forum_thread: `/user/forums/${entityId}`,
    post: `/user/posts/${entityId}`,
    user_post: `/user/posts/${entityId}`,
    announcement: `/user/announcements/${entityId}`,
  }
  return routes[normalized] || null
}

async function resolvePostOwner(adminSupabase, contentType, contentId) {
  const mapping = POST_OWNER_TABLES[String(contentType || '').toLowerCase()]
  if (!mapping) return null

  const [table, ownerColumn] = mapping
  const { data, error } = await adminSupabase
    .from(table)
    .select(`id, ${ownerColumn}`)
    .eq('id', contentId)
    .maybeSingle()

  if (error) throw error
  return data?.[ownerColumn] || null
}

async function createReactionNotification(adminSupabase, { contentType, contentId, actorId, reactionType }) {
  let postId = contentId
  let postType = contentType
  let commentId = null
  let commentAuthorId = null

  if (contentType === 'comment') {
    const { data: comment, error } = await adminSupabase
      .from('content_comments')
      .select('id, user_id, content_type, content_id')
      .eq('id', contentId)
      .maybeSingle()

    if (error) throw error
    if (!comment) return

    commentId = comment.id
    commentAuthorId = comment.user_id
    postId = comment.content_id
    postType = comment.content_type
  }

  const postOwnerId = await resolvePostOwner(adminSupabase, postType, postId)
  if (!postOwnerId || postOwnerId === actorId || commentAuthorId === actorId) return

  const parentLink = routeForEntity(postType, postId)
  if (!parentLink) return

  const { data: actor } = await adminSupabase
    .from('info_users')
    .select('full_name')
    .eq('id', actorId)
    .maybeSingle()

  const actorName = actor?.full_name || 'Someone'
  const link = commentId ? `${parentLink}#comment-${commentId}` : parentLink
  const notification = {
    user_id: postOwnerId,
    title: commentId ? 'New comment reaction' : 'New post reaction',
    message: commentId
      ? `${actorName} reacted to a comment on your post (${reactionType}).`
      : `${actorName} reacted to your post (${reactionType}).`,
    type: 'reaction',
    is_read: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    link,
    post_id: postId,
    comment_id: commentId,
    post_owner_id: postOwnerId,
    actor_id: actorId,
  }

  let { error } = await adminSupabase
    .from('info_notifications')
    .insert(notification)

  // Optional notification columns can lag behind the database during a
  // PostgREST schema-cache refresh. Keep the persisted notification reliable
  // while the cache catches up.
  if (error && /column .* does not exist|could not find the .* column/i.test(error.message || '')) {
    const fallbackNotification = { ...notification }
    delete fallbackNotification.post_owner_id
    delete fallbackNotification.comment_id
    delete fallbackNotification.reply_id
    const fallbackResult = await adminSupabase
      .from('info_notifications')
      .insert(fallbackNotification)
    error = fallbackResult.error
  }

  if (error && error.code !== '23505') throw error
}

async function writeReaction(request, method) {
  try {
    const session = getServerSession(request)
    const userId = session?.user_id
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Please sign in to react to this content.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const contentType = String(body.contentType || '').trim()
    const contentId = String(body.contentId || '').trim()
    const reactionType = String(body.reactionType || '').trim()

    if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId || !ALLOWED_REACTION_TYPES.has(reactionType)) {
      return NextResponse.json({ success: false, message: 'Invalid reaction payload.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: 'Reaction service is not configured.' }, { status: 500 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

    if (method === 'DELETE') {
      const { error } = await adminSupabase
        .from('content_reactions')
        .delete()
        .eq('user_id', userId)
        .eq('content_type', contentType)
        .eq('content_id', contentId)

      if (error) {
        console.error('Reaction delete failed:', error)
        return NextResponse.json({ success: false, message: error.message || 'Unable to remove reaction.' }, { status: 400 })
      }

      return NextResponse.json({ success: true })
    }

    const { error } = await adminSupabase
      .from('content_reactions')
      .upsert(
        {
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          reaction_type: reactionType,
        },
        { onConflict: 'user_id,content_type,content_id' }
      )

    if (error) {
      console.error('Reaction upsert failed:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      })
      return NextResponse.json({ success: false, message: error.message || 'Unable to react to content.' }, { status: 400 })
    }

    await createReactionNotification(adminSupabase, { contentType, contentId, actorId: userId, reactionType })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reaction route error:', error)
    return NextResponse.json({ success: false, message: error?.message || 'Unable to react to content.' }, { status: 500 })
  }
}

export async function POST(request) {
  return writeReaction(request, 'POST')
}

export async function DELETE(request) {
  return writeReaction(request, 'DELETE')
}
