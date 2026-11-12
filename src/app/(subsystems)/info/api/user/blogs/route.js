import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'
import { sanitizeRichText } from '@/lib/sanitizeRichText'
import { getActivePublishingRestriction } from '@/lib/contentRestrictions'
import { notifyAdministrators, notifyModerators } from '@/lib/adminNotifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  const adminSupabase = getAdminClient()
  if (!adminSupabase) {
    return NextResponse.json({ success: false, message: 'Blog service is not configured.' }, { status: 500 })
  }

  const { data, error } = await adminSupabase
    .from('info_blogs')
    .select('id, title, excerpt, category, featured_image, status, approval_status, submitted_at, reviewed_at, rejection_reason, published_at, created_at, updated_at')
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('User blog list failed:', error.message)
    return NextResponse.json({ success: false, message: 'Unable to load your blog posts.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, blogs: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id

  if (!userId) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  const adminSupabase = getAdminClient()
  if (!adminSupabase) {
    return NextResponse.json({ success: false, message: 'Blog service is not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: 'A valid blog post is required.' }, { status: 400 })
    }
    const title = String(body.title || '').trim()
    const content = sanitizeRichText(body.content).trim()
    const category = String(body.category || '').trim()
    const images = Array.isArray(body.images) ? body.images.filter(Boolean) : []
    const videos = Array.isArray(body.videos) ? body.videos.filter(Boolean) : []

    if (!title || !content || !category) {
      return NextResponse.json({ success: false, message: 'Please add a title, category, and article content.' }, { status: 400 })
    }
    if (body.status === 'published') {
      const restriction = await getActivePublishingRestriction(adminSupabase, userId)
      if (restriction) return NextResponse.json({ success: false, message: 'Your account is currently restricted from submitting posts.' }, { status: 403 })
    }

    const basePayload = {
      title,
      slug: body.slug,
      excerpt: body.excerpt || content.slice(0, 180),
      content,
      featured_image: body.featured_image || null,
      category,
      tags: Array.isArray(body.tags) ? body.tags : [],
      status: 'draft',
      approval_status: body.status === 'published' ? 'pending' : 'draft',
      submitted_at: body.status === 'published' ? new Date().toISOString() : null,
      reviewed_at: null,
      reviewed_by: null,
      rejection_reason: null,
      created_by: userId,
      published_at: null,
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

    if (body.status === 'published') {
      const notification = {
        actorId: userId,
        title: 'Blog awaiting approval',
        message: `A new blog submission needs review: ${title}`,
        type: 'warning',
        link: '/info/admin/blogs?status=pending',
      }
      await Promise.all([
        notifyAdministrators(adminSupabase, notification),
        notifyModerators(adminSupabase, notification),
      ])
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