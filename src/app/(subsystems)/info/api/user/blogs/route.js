import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function notifyFollowersOfPublishedBlog(adminSupabase, { authorId, blogId, title }) {
  const link = `/user/blogs/${blogId}`
  const { data: follows, error: followsError } = await adminSupabase
    .from('user_follows')
    .select('follower_id')
    .eq('following_id', authorId)
    .neq('follower_id', authorId)

  if (followsError) {
    console.error('Follower lookup failed:', followsError.message || followsError)
    return
  }
  if (!follows?.length) return

  const followerIds = [...new Set(follows.map((follow) => follow.follower_id).filter(Boolean))]
  const { data: author } = await adminSupabase
    .from('info_users')
    .select('full_name')
    .eq('id', authorId)
    .maybeSingle()
  const authorName = author?.full_name || 'Someone you follow'
  const { data: existing } = await adminSupabase
    .from('info_notifications')
    .select('user_id')
    .eq('link', link)
    .in('user_id', followerIds)

  const existingIds = new Set((existing || []).map((notification) => notification.user_id))
  const rows = followerIds
    .filter((followerId) => !existingIds.has(followerId))
    .map((followerId) => ({
      user_id: followerId,
      title: 'New post from someone you follow',
      message: `${authorName} published a new post: ${title}`,
      type: 'post',
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      link,
      post_id: blogId,
      post_owner_id: authorId,
      actor_id: authorId,
    }))

  if (rows.length) {
    let { error } = await adminSupabase.from('info_notifications').insert(rows)
    const optionalColumnError = error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message || ''))
    if (optionalColumnError) {
      const baseNotificationRows = rows.map(({ post_id, post_owner_id, ...baseRow }) => baseRow)
      const fallbackResult = await adminSupabase.from('info_notifications').insert(baseNotificationRows)
      error = fallbackResult.error
      if (error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message || ''))) {
        const legacyNotificationRows = baseNotificationRows.map(({ actor_id, ...baseRow }) => baseRow)
        const legacyResult = await adminSupabase.from('info_notifications').insert(legacyNotificationRows)
        error = legacyResult.error
      }
    }
    if (error && error.code !== '23505') console.error('Follower blog notification insert failed:', error.message || error)
  }
}

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const userId = getServerSession(request)?.user_id

  if (!userId) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Blog service is not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const title = String(body.title || '').trim()
    const content = String(body.content || '').trim()
    const category = String(body.category || '').trim()
    const images = Array.isArray(body.images) ? body.images.filter(Boolean) : []
    const videos = Array.isArray(body.videos) ? body.videos.filter(Boolean) : []

    if (!title || !content || !category) {
      return NextResponse.json({ success: false, message: 'Please add a title, category, and article content.' }, { status: 400 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const basePayload = {
      title,
      slug: body.slug,
      excerpt: body.excerpt || content.slice(0, 180),
      content,
      featured_image: body.featured_image || null,
      category,
      tags: Array.isArray(body.tags) ? body.tags : [],
      status: body.status === 'published' ? 'published' : 'draft',
      created_by: userId,
      published_at: body.status === 'published' ? new Date().toISOString() : null,
      views: 0,
      likes: 0,
      comments_count: 0,
    }

    const mediaPayload = {
      ...basePayload,
      images,
      videos,
      media_layout: body.media_layout === 'grid' ? 'grid' : 'swipe',
    }

    const targetColumns = ['images', 'videos', 'media_layout']
    const { data, error } = await adminSupabase
      .from('info_blogs')
      .insert(mediaPayload)
      .select('id')
      .single()

    if (error) {
      const errorText = String(error?.message || '')
      const missingColumn = error?.code === '42703' || errorText.toLowerCase().includes('column')
      const missingRelation = errorText.toLowerCase().includes('relation')
      const shouldFallback = missingColumn || missingRelation || targetColumns.some((column) => errorText.toLowerCase().includes(column))

      if (shouldFallback) {
        const fallback = { ...basePayload }
        const fallbackResult = await adminSupabase
          .from('info_blogs')
          .insert(fallback)
          .select('id')
          .single()

        if (fallbackResult.error) {
          const fallbackMessage = fallbackResult.error?.message || 'Unable to create your blog article.'
          console.error('Blog fallback insert failed:', fallbackMessage)
          return NextResponse.json({ success: false, message: fallbackMessage }, { status: 500 })
        }
        if (basePayload.status === 'published') {
          await notifyFollowersOfPublishedBlog(adminSupabase, { authorId: userId, blogId: fallbackResult.data.id, title })
        }
        return NextResponse.json({ success: true, blog: fallbackResult.data })
      }

      const typedMessage = error?.message || 'Unable to create your blog article.'
      return NextResponse.json({ success: false, message: typedMessage }, { status: 500 })
    }

    if (basePayload.status === 'published') {
      await notifyFollowersOfPublishedBlog(adminSupabase, { authorId: userId, blogId: data.id, title })
    }

    return NextResponse.json({ success: true, blog: data })
  } catch (error) {
    const errorMessage = error?.message || 'Unable to create your blog article.'
    console.error('Blog creation failed:', errorMessage)
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 })
  }
}