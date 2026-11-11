import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_CONTENT_TYPES = new Set([
  'blog',
  'event',
  'forum_thread',
  'announcement',
  'user_post',
  'tourist_spot',
])

function normalizeContentType(value) {
  const type = String(value || '').trim().toLowerCase()
  if (type === 'forum') return 'forum_thread'
  if (type === 'post') return 'user_post'
  if (type === 'spot') return 'tourist_spot'
  return type
}

const ORIGINAL_TABLES = {
  blog: { table: 'info_blogs', authorColumn: 'created_by', select: 'id, created_by, title, excerpt, content, featured_image, images, videos, media_layout, published_at, created_at, status' },
  event: { table: 'info_events', authorColumn: 'created_by', select: 'id, created_by, title, description, featured_image, images, start_date, created_at, status, approval_status' },
  forum_thread: { table: 'forum_threads', authorColumn: 'created_by', select: 'id, created_by, title, content, created_at, status' },
  announcement: { table: 'info_announcements', authorColumn: 'created_by', select: 'id, created_by, title, content, image_url, video_url, published_at, created_at, status' },
  user_post: { table: 'info_user_posts', authorColumn: 'user_id', select: 'id, user_id, title, content, created_at, updated_at, status' },
  tourist_spot: { table: 'info_tourist_spots', authorColumn: 'created_by', select: 'id, created_by, name, description, category, location, rating, entry_fee, opening_hours, best_visit_time, featured, featured_image, images, videos, created_at, status' },
}

const ORIGINAL_ROUTES = {
  blog: 'blogs',
  event: 'events',
  forum_thread: 'forums',
  announcement: 'announcements',
  user_post: 'posts',
  tourist_spot: 'visitor/tourist-spots',
}

function isMissingRepostStatusColumnError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes("'status' column of 'reposts'") ||
    message.includes('reposts.status') ||
    (message.includes('status') && message.includes('reposts') && message.includes('schema cache'))
  )
}

async function selectRepostsForContent(adminSupabase, userId, contentType, contentId) {
  const baseQuery = adminSupabase
    .from('reposts')
    .select('id, user_id, original_content_type, original_content_id, quote_text, created_at, status, visibility')
    .eq('user_id', userId)
    .eq('original_content_type', contentType)
    .eq('original_content_id', contentId)

  const { data, error } = await baseQuery.maybeSingle()
  if (!error || !isMissingRepostStatusColumnError(error)) return { data, error }

  const fallback = await adminSupabase
    .from('reposts')
    .select('id, user_id, original_content_type, original_content_id, quote_text, created_at')
    .eq('user_id', userId)
    .eq('original_content_type', contentType)
    .eq('original_content_id', contentId)
    .maybeSingle()

  return { data: fallback.data, error: fallback.error }
}

async function insertRepost(adminSupabase, payload) {
  const insertPayload = { ...payload }
  const { data, error } = await adminSupabase
    .from('reposts')
    .insert(insertPayload)
    .select('id, user_id, original_content_type, original_content_id, quote_text, created_at, status, visibility')
    .single()

  if (!error || !isMissingRepostStatusColumnError(error)) return { data, error }

  const fallback = await adminSupabase
    .from('reposts')
    .insert({
      user_id: payload.user_id,
      original_content_type: payload.original_content_type,
      original_content_id: payload.original_content_id,
      quote_text: payload.quote_text,
      visibility: payload.visibility,
    })
    .select('id, user_id, original_content_type, original_content_id, quote_text, created_at')
    .single()

  return { data: fallback.data, error: fallback.error }
}

async function getOriginalContent(adminSupabase, contentType, contentId) {
  const definition = ORIGINAL_TABLES[contentType]
  if (!definition) return { data: null, error: new Error('Unsupported repost content.') }

  let query = adminSupabase.from(definition.table).select(definition.select).eq('id', contentId)
  if (contentType === 'user_post' || contentType === 'forum_thread') query = query.in('status', ['active', 'published'])
  else if (contentType === 'event') query = query.in('status', ['published', 'cancelled', 'completed']).eq('approval_status', 'approved')
  else if (contentType === 'blog' || contentType === 'announcement') query = query.eq('status', 'published')
  else if (contentType === 'tourist_spot') query = query.eq('status', 'active')

  const { data, error } = await query.maybeSingle()
  const authorId = data?.[definition.authorColumn] || null
  const originalData = contentType === 'tourist_spot' && data
    ? { ...data, title: data.name, content: data.description, excerpt: data.description }
    : data
  if (!authorId) return { data: originalData, error, authorId }

  const { data: author, error: authorError } = await adminSupabase
    .from('info_users')
    .select('id, full_name, profile_image_url, user_type')
    .eq('id', authorId)
    .maybeSingle()

  return { data: originalData ? { ...originalData, author: author || null } : originalData, error: error || authorError, authorId }
}

// The reposter is the acting user, never the original author. Clients use this
// to attribute the new repost card to the person who reposted it.
async function getReposterAuthor(adminSupabase, userId) {
  const { data } = await adminSupabase
    .from('info_users')
    .select('id, full_name, profile_image_url, user_type')
    .eq('id', userId)
    .maybeSingle()

  return data || { id: userId, full_name: null, profile_image_url: null, user_type: null }
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id || null
  if (!userId) return NextResponse.json({ success: false, message: 'Please log in to repost.' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Repost service is not configured.' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const contentType = normalizeContentType(body.contentType)
  const contentId = String(body.contentId || '').trim()
  const quoteText = String(body.quoteText || '').trim() || null
  const visibility = String(body.visibility || 'public').trim()

  if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId || !['public', 'followers', 'private'].includes(visibility)) {
    return NextResponse.json({ success: false, message: 'Invalid repost content.' }, { status: 400 })
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
  const reposterAuthor = await getReposterAuthor(adminSupabase, userId)
  const originalResult = await getOriginalContent(adminSupabase, contentType, contentId)
  if (originalResult.error) {
    return NextResponse.json({ success: false, message: originalResult.error.message || 'Unable to load the original content.' }, { status: 400 })
  }
  if (!originalResult.data || (!originalResult.authorId && contentType !== 'tourist_spot')) {
    return NextResponse.json({ success: false, message: 'The original content is unavailable.' }, { status: 404 })
  }

  const { data: existingRepost, error: existingRepostError } = await selectRepostsForContent(adminSupabase, userId, contentType, contentId)

  if (existingRepostError) {
    return NextResponse.json({ success: false, message: existingRepostError.message || 'Unable to check repost.' }, { status: 400 })
  }

  if (existingRepost) {
    if (existingRepost.status === 'archived') {
      const restoreResult = await adminSupabase
        .from('reposts')
        .update({ status: 'active' })
        .eq('id', existingRepost.id)
        .eq('user_id', userId)
        .select('id, user_id, original_content_type, original_content_id, quote_text, created_at, status, visibility')
        .single()

      if (restoreResult.error && isMissingRepostStatusColumnError(restoreResult.error)) {
        return NextResponse.json({ success: true, repost: existingRepost, reposter: reposterAuthor, original: originalResult.data, restored: true })
      }
      if (restoreResult.error) return NextResponse.json({ success: false, message: restoreResult.error.message || 'Unable to restore this repost.' }, { status: 400 })
      return NextResponse.json({ success: true, repost: restoreResult.data, reposter: reposterAuthor, original: originalResult.data, restored: true })
    }
    return NextResponse.json({ success: true, repost: existingRepost, reposter: reposterAuthor, original: originalResult.data, alreadyReposted: true })
  }

  const { data, error } = await insertRepost(adminSupabase, {
    user_id: userId,
    original_content_type: contentType,
    original_content_id: contentId,
    quote_text: quoteText,
    visibility,
    status: 'active',
  })

  if (error) {
    if (error.code === '23505') {
      const { data: duplicate } = await adminSupabase
        .from('reposts')
        .select('id, user_id, original_content_type, original_content_id, quote_text, created_at, status, visibility')
        .eq('user_id', userId)
        .eq('original_content_type', contentType)
        .eq('original_content_id', contentId)
        .single()
      return NextResponse.json({ success: true, repost: duplicate, original: originalResult.data, alreadyReposted: true })
    }
    console.error('Repost insert failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to repost.' }, { status: 400 })
  }

  if (originalResult.authorId !== userId) {
    const notification = {
      user_id: originalResult.authorId,
      title: 'New repost',
      message: `${reposterAuthor?.full_name || 'Someone'} reposted your post.`,
      type: 'repost',
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      link: contentType === 'tourist_spot'
        ? `/info/visitor/tourist-spots/${contentId}`
        : `/info/user/${ORIGINAL_ROUTES[contentType]}/${contentId}`,
      post_id: contentId,
      post_owner_id: originalResult.authorId,
      actor_id: userId,
    }
    const { data: existingNotification, error: notificationLookupError } = await adminSupabase
      .from('info_notifications')
      .select('id')
      .eq('user_id', notification.user_id)
      .eq('link', notification.link)
      .eq('type', notification.type)
      .eq('actor_id', notification.actor_id)
      .maybeSingle()
    if (notificationLookupError) {
      console.error('Repost notification lookup failed:', notificationLookupError)
    } else if (!existingNotification) {
      const { error: notificationError } = await adminSupabase
        .from('info_notifications')
        .insert(notification)
      if (notificationError) console.error('Repost notification failed:', notificationError)
    }
  }

  return NextResponse.json({ success: true, repost: data, reposter: reposterAuthor, original: originalResult.data })
}

export async function DELETE(request) {
  const userId = getServerSession(request)?.user_id || null
  if (!userId) return NextResponse.json({ success: false, message: 'Please log in to undo a repost.' }, { status: 401 })

  const contentType = normalizeContentType(new URL(request.url).searchParams.get('contentType'))
  const contentId = String(new URL(request.url).searchParams.get('contentId') || '').trim()
  if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId) {
    return NextResponse.json({ success: false, message: 'Invalid repost content.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ success: false, message: 'Repost service is not configured.' }, { status: 500 })

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
  const { error } = await adminSupabase
    .from('reposts')
    .delete()
    .eq('user_id', userId)
    .eq('original_content_type', contentType)
    .eq('original_content_id', contentId)
    .eq('status', 'active')
  if (error) return NextResponse.json({ success: false, message: error.message || 'Unable to undo repost.' }, { status: 400 })
  return NextResponse.json({ success: true })
}
