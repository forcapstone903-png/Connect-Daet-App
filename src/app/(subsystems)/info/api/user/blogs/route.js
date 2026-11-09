import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'
import { sanitizeRichText } from '@/lib/sanitizeRichText'
import { notifyFollowers } from '@/lib/notificationAudience'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
    const content = sanitizeRichText(body.content).trim()
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
      location: String(body.location || '').trim() || null,
    }

    const targetColumns = ['images', 'videos', 'media_layout', 'location']
    const insertBlog = (payload) => adminSupabase
      .from('info_blogs')
      .insert(payload)
      .select('id')
      .single()
    let payload = { ...mediaPayload }
    const omittedColumns = []
    let { data, error } = await insertBlog(payload)

    while (error) {
      const errorText = String(error.message || '').toLowerCase()
      const missingColumn = error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(errorText)
      if (!missingColumn) break

      let columnsToOmit = targetColumns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column) && errorText.includes(column))
      if (!columnsToOmit.length) {
        columnsToOmit = targetColumns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column))
      }
      if (!columnsToOmit.length) break

      columnsToOmit.forEach((column) => {
        delete payload[column]
        omittedColumns.push(column)
      })
      ;({ data, error } = await insertBlog(payload))
    }

    if (error) {
      const typedMessage = error.message || 'Unable to create your blog article.'
      console.error('Blog insert failed:', typedMessage)
      return NextResponse.json({ success: false, message: typedMessage }, { status: 500 })
    }

    if (basePayload.status === 'published') {
      await notifyFollowers(adminSupabase, {
        authorId: userId,
        type: 'post',
        link: `/info/user/blogs/${data.id}`,
        postId: data.id,
        title: 'New post from someone you follow',
        actionText: 'published a new post',
        subject: title,
      })
    }

    const warning = omittedColumns.length
      ? `The story was saved, but these optional fields need a database migration: ${[...new Set(omittedColumns)].join(', ')}.`
      : undefined
    return NextResponse.json({ success: true, blog: data, warning })
  } catch (error) {
    const errorMessage = error?.message || 'Unable to create your blog article.'
    console.error('Blog creation failed:', errorMessage)
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 })
  }
}