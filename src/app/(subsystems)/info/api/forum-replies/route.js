import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

// Written through this route so a signed-in user never needs a live Supabase
// browser session (RLS `auth.uid()` checks) to comment in a forum thread. The
// signed `daet_secure_session` cookie is the app's source of truth, exactly like
// /api/comments already does for feed comments.
const REPLY_SELECT = 'id, thread_id, user_id, parent_reply_id, content, image_url, video_url, gif_url, sticker_url, mention_data, status, created_at, updated_at, info_users(full_name, email, profile_image_url)'
const LEGACY_REPLY_SELECT = 'id, thread_id, user_id, content, status, created_at, updated_at, info_users(full_name, email, profile_image_url)'
const OPTIONAL_COLUMNS = ['parent_reply_id', 'image_url', 'video_url', 'gif_url', 'sticker_url', 'mention_data']

const LOCKED_THREAD_STATUSES = new Set(['locked', 'archived'])
const MAX_CONTENT_LENGTH = 5000
const MAX_MEDIA_URL_LENGTH = 2048
const MAX_STICKER_LENGTH = 24
const MAX_MENTIONS = 25

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function unauthorized() {
  return NextResponse.json({ success: false, message: 'Please log in to reply to this discussion.' }, { status: 401 })
}

function isMissingForumReplyColumnError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return ['42703', 'PGRST204'].includes(code)
    || (message.includes('column') && message.includes('forum_replies'))
}

function canManageReply(session, ownerId) {
  const role = String(session?.role || '').trim().toLowerCase()
  return session?.user_id === ownerId || role === 'admin' || role === 'administrator'
}

// Returns the trimmed URL, null when empty, or undefined when the value cannot be
// stored (caller turns that into a 400).
function normalizeMediaUrl(value) {
  if (value == null) return null
  const url = String(value).trim()
  if (!url) return null
  if (url.length > MAX_MEDIA_URL_LENGTH) return undefined
  if (!/^(https?:\/\/|\/)/i.test(url)) return undefined
  return url
}

function normalizeSticker(value) {
  if (value == null) return null
  const sticker = String(value).trim()
  if (!sticker) return null
  return sticker.slice(0, MAX_STICKER_LENGTH)
}

function normalizeMentionData(value) {
  if (!Array.isArray(value)) return []

  const seen = new Set()
  const mentions = []

  for (const item of value) {
    const mentionedUserId = String(item?.mentioned_user_id || item?.id || '').trim()
    if (!isValidUuid(mentionedUserId) || seen.has(mentionedUserId)) continue
    seen.add(mentionedUserId)
    mentions.push({
      mentioned_user_id: mentionedUserId,
      display_name: String(item?.display_name || item?.displayName || '').trim().slice(0, 120) || null,
    })
    if (mentions.length >= MAX_MENTIONS) break
  }

  return mentions
}

function stripOptionalColumns(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !OPTIONAL_COLUMNS.includes(key)))
}

export async function POST(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return unauthorized()

  const adminSupabase = getAdminClient()
  if (!adminSupabase) {
    return NextResponse.json({ success: false, message: 'Reply service is not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const threadId = String(body.threadId || body.thread_id || '').trim()
    const content = String(body.content || body.body || '').trim()
    const parentReplyId = String(body.parentReplyId || body.parent_reply_id || '').trim()

    if (!isValidUuid(threadId)) {
      return NextResponse.json({ success: false, message: 'A valid discussion id is required.' }, { status: 400 })
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ success: false, message: 'Your reply is too long.' }, { status: 400 })
    }

    const imageUrl = normalizeMediaUrl(body.imageUrl ?? body.image_url)
    const videoUrl = normalizeMediaUrl(body.videoUrl ?? body.video_url)
    const gifUrl = normalizeMediaUrl(body.gifUrl ?? body.gif_url)
    const stickerUrl = normalizeSticker(body.stickerUrl ?? body.sticker_url)

    if (imageUrl === undefined || videoUrl === undefined || gifUrl === undefined) {
      return NextResponse.json({ success: false, message: 'One of the attached media links is not a valid URL.' }, { status: 400 })
    }
    if (!content && !imageUrl && !videoUrl && !gifUrl && !stickerUrl) {
      return NextResponse.json({ success: false, message: 'Add a message, photo, video, GIF or sticker before posting.' }, { status: 400 })
    }

    const { data: thread, error: threadError } = await adminSupabase
      .from('forum_threads')
      .select('id, status')
      .eq('id', threadId)
      .maybeSingle()

    if (threadError) throw threadError
    if (!thread) return NextResponse.json({ success: false, message: 'Discussion not found.' }, { status: 404 })
    if (LOCKED_THREAD_STATUSES.has(String(thread.status || '').toLowerCase())) {
      return NextResponse.json({ success: false, message: 'This discussion is locked.' }, { status: 403 })
    }

    const resolvedParentId = isValidUuid(parentReplyId) ? parentReplyId : null
    if (resolvedParentId) {
      const { data: parentReply, error: parentError } = await adminSupabase
        .from('forum_replies')
        .select('id, thread_id')
        .eq('id', resolvedParentId)
        .maybeSingle()

      if (parentError) throw parentError
      if (!parentReply || parentReply.thread_id !== threadId) {
        return NextResponse.json({ success: false, message: 'The comment you are replying to is no longer available.' }, { status: 400 })
      }
    }

    const payload = {
      thread_id: threadId,
      user_id: session.user_id,
      content,
      status: 'active',
      parent_reply_id: resolvedParentId,
      image_url: imageUrl,
      video_url: videoUrl,
      gif_url: gifUrl,
      sticker_url: stickerUrl,
      mention_data: normalizeMentionData(body.mentionData ?? body.mention_data),
    }

    let { data: reply, error } = await adminSupabase
      .from('forum_replies')
      .insert(payload)
      .select(REPLY_SELECT)
      .single()

    if (error && isMissingForumReplyColumnError(error)) {
      // Older databases may not have the media/mention columns yet (045/046).
      ;({ data: reply, error } = await adminSupabase
        .from('forum_replies')
        .insert(stripOptionalColumns(payload))
        .select(LEGACY_REPLY_SELECT)
        .single())
    }

    if (error) {
      console.error('Forum reply insert error:', error)
      return NextResponse.json({ success: false, message: error.message || 'Unable to post the reply.' }, { status: 400 })
    }

    return NextResponse.json({ success: true, reply })
  } catch (error) {
    console.error('Forum reply route error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to post the reply.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return unauthorized()

  const adminSupabase = getAdminClient()
  if (!adminSupabase) {
    return NextResponse.json({ success: false, message: 'Reply service is not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const replyId = String(body.replyId || body.reply_id || body.id || '').trim()
    const content = String(body.content || body.body || '').trim()

    if (!isValidUuid(replyId)) {
      return NextResponse.json({ success: false, message: 'A valid comment id is required.' }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ success: false, message: 'The comment text is required.' }, { status: 400 })
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ success: false, message: 'Your comment is too long.' }, { status: 400 })
    }

    const { data: existing, error: lookupError } = await adminSupabase
      .from('forum_replies')
      .select('id, user_id')
      .eq('id', replyId)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!existing) return NextResponse.json({ success: false, message: 'Comment not found.' }, { status: 404 })
    if (!canManageReply(session, existing.user_id)) {
      return NextResponse.json({ success: false, message: 'You can only edit your own comments.' }, { status: 403 })
    }

    // `updated_at` is refreshed by the tr_forum_replies_updated_at trigger.
    let { data: reply, error } = await adminSupabase
      .from('forum_replies')
      .update({ content })
      .eq('id', replyId)
      .select(REPLY_SELECT)
      .single()

    if (error && isMissingForumReplyColumnError(error)) {
      ;({ data: reply, error } = await adminSupabase
        .from('forum_replies')
        .update({ content })
        .eq('id', replyId)
        .select(LEGACY_REPLY_SELECT)
        .single())
    }

    if (error) {
      console.error('Forum reply update error:', error)
      return NextResponse.json({ success: false, message: error.message || 'Unable to update the comment.' }, { status: 400 })
    }

    return NextResponse.json({ success: true, reply })
  } catch (error) {
    console.error('Forum reply update route error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to update the comment.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return unauthorized()

  const adminSupabase = getAdminClient()
  if (!adminSupabase) {
    return NextResponse.json({ success: false, message: 'Reply service is not configured.' }, { status: 500 })
  }

  try {
    const replyId = String(new URL(request.url).searchParams.get('replyId') || '').trim()

    if (!isValidUuid(replyId)) {
      return NextResponse.json({ success: false, message: 'A valid comment id is required.' }, { status: 400 })
    }

    const { data: existing, error: lookupError } = await adminSupabase
      .from('forum_replies')
      .select('id, user_id')
      .eq('id', replyId)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!existing) return NextResponse.json({ success: false, message: 'Comment not found.' }, { status: 404 })
    if (!canManageReply(session, existing.user_id)) {
      return NextResponse.json({ success: false, message: 'You can only delete your own comments.' }, { status: 403 })
    }

    const { error } = await adminSupabase.from('forum_replies').delete().eq('id', replyId)
    if (error) {
      console.error('Forum reply delete error:', error)
      return NextResponse.json({ success: false, message: error.message || 'Unable to delete the comment.' }, { status: 400 })
    }

    return NextResponse.json({ success: true, replyId })
  } catch (error) {
    console.error('Forum reply delete route error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to delete the comment.' }, { status: 500 })
  }
}
