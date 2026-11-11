import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { sanitizeRichText } from '@/lib/sanitizeRichText'
import { getActivePublishingRestriction } from '@/lib/contentRestrictions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key ? createClient(url, key) : null
}

export async function GET(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const blogId = (await params)?.id
  if (!userId || !blogId) return NextResponse.json({ success: false, message: 'A blog and user session are required.' }, { status: 400 })

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Blog service is not configured.' }, { status: 500 })

  const { data, error } = await adminSupabase
    .from('info_blogs')
    .select('id, created_by, title, slug, excerpt, content, category, tags, status, approval_status, submitted_at, reviewed_at, rejection_reason, featured_image, images, videos, media_layout, location, updated_at')
    .eq('id', blogId)
    .eq('created_by', userId)
    .maybeSingle()

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ success: false, message: 'Blog not found or not owned by you.' }, { status: 404 })
  return NextResponse.json({ success: true, blog: data }, {
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

export async function PATCH(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const blogId = (await params)?.id
  if (!userId || !blogId) return NextResponse.json({ success: false, message: 'A blog and user session are required.' }, { status: 400 })

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Blog service is not configured.' }, { status: 500 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'A valid blog update is required.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: 'A valid blog update is required.' }, { status: 400 })
  }
  const updatePayload = { updated_at: new Date().toISOString() }
  const mediaPayload = {}
  if (Object.prototype.hasOwnProperty.call(body, 'title')) updatePayload.title = String(body.title || '').trim()
  if (Object.prototype.hasOwnProperty.call(body, 'content')) updatePayload.content = sanitizeRichText(body.content).trim()
  if (Object.prototype.hasOwnProperty.call(body, 'excerpt')) updatePayload.excerpt = String(body.excerpt || '').trim() || null
  if (Object.prototype.hasOwnProperty.call(body, 'category')) updatePayload.category = String(body.category || '').trim()
  if (Array.isArray(body.tags)) updatePayload.tags = body.tags
  if (Object.prototype.hasOwnProperty.call(body, 'slug')) updatePayload.slug = String(body.slug || '').trim()
  if (Object.prototype.hasOwnProperty.call(body, 'featured_image')) mediaPayload.featured_image = String(body.featured_image || '').trim() || null
  if (Array.isArray(body.images)) mediaPayload.images = body.images.filter(Boolean)
  if (Array.isArray(body.videos)) mediaPayload.videos = body.videos.filter(Boolean)
  if (Object.prototype.hasOwnProperty.call(body, 'media_layout')) mediaPayload.media_layout = body.media_layout === 'grid' ? 'grid' : 'swipe'
  if (Object.prototype.hasOwnProperty.call(body, 'location')) mediaPayload.location = String(body.location || '').trim() || null
  const isSubmission = body.status === 'published'
  if (body.status === 'draft') {
    updatePayload.status = 'draft'
    updatePayload.approval_status = 'draft'
    updatePayload.submitted_at = null
    updatePayload.reviewed_at = null
    updatePayload.reviewed_by = null
    updatePayload.rejection_reason = null
    updatePayload.published_at = null
  }
  if (body.status === 'archived') {
    updatePayload.status = 'archived'
    updatePayload.published_at = null
  }

  if ((updatePayload.title !== undefined && !updatePayload.title) || (updatePayload.content !== undefined && !updatePayload.content)) {
    return NextResponse.json({ success: false, message: 'Title and content cannot be empty.' }, { status: 400 })
  }
  if (Object.keys(updatePayload).length === 1 && Object.keys(mediaPayload).length === 0) return NextResponse.json({ success: false, message: 'Invalid blog update.' }, { status: 400 })

  const { data: existingBlog, error: existingBlogError } = await adminSupabase
    .from('info_blogs')
    .select('id, status, approval_status')
    .eq('id', blogId)
    .eq('created_by', userId)
    .maybeSingle()
  if (existingBlogError) return NextResponse.json({ success: false, message: existingBlogError.message }, { status: 400 })
  if (!existingBlog) return NextResponse.json({ success: false, message: 'Blog not found or not owned by you.' }, { status: 404 })

  const contentWasEdited = ['title', 'content', 'excerpt', 'category', 'tags', 'slug'].some((key) => (
    Object.prototype.hasOwnProperty.call(updatePayload, key)
  )) || Object.keys(mediaPayload).length > 0
  const editingApproved = existingBlog.approval_status === 'approved' && contentWasEdited

  if (isSubmission || (editingApproved && body.status !== 'archived')) {
    updatePayload.status = 'draft'
    updatePayload.approval_status = 'pending'
    updatePayload.submitted_at = new Date().toISOString()
    updatePayload.reviewed_at = null
    updatePayload.reviewed_by = null
    updatePayload.rejection_reason = null
    updatePayload.published_at = null
  }
  if (isSubmission || editingApproved) {
    let restriction
    try {
      restriction = await getActivePublishingRestriction(adminSupabase, userId)
    } catch (error) {
      console.error('Blog restriction lookup failed:', error.message)
      return NextResponse.json({ success: false, message: 'Unable to verify your posting permissions.' }, { status: 500 })
    }
    if (restriction) return NextResponse.json({ success: false, message: 'Your account is currently restricted from submitting posts.' }, { status: 403 })
  }

  const selectColumns = 'id, created_by, title, excerpt, content, category, status, approval_status, submitted_at, reviewed_at, rejection_reason, published_at, updated_at'

  const applyUpdate = (payload) => adminSupabase
    .from('info_blogs')
    .update(payload)
    .eq('id', blogId)
    .eq('created_by', userId)
    .select(selectColumns)
    .maybeSingle()

  const savedMediaPayload = { ...mediaPayload }
  const omittedColumns = []
  let { data, error } = await applyUpdate({ ...updatePayload, ...savedMediaPayload })
  while (error && Object.keys(savedMediaPayload).length > 0) {
    const errorText = String(error.message || '').toLowerCase()
    const missingColumn = error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(errorText)
    if (!missingColumn) break

    let columnsToOmit = Object.keys(savedMediaPayload).filter((column) => errorText.includes(column))
    if (!columnsToOmit.length) columnsToOmit = Object.keys(savedMediaPayload)
    columnsToOmit.forEach((column) => {
      delete savedMediaPayload[column]
      omittedColumns.push(column)
    })
    ;({ data, error } = await applyUpdate({ ...updatePayload, ...savedMediaPayload }))
  }

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ success: false, message: 'Blog not found or not owned by you.' }, { status: 404 })
  const warning = omittedColumns.length
    ? `The story was updated, but these optional fields need a database migration: ${[...new Set(omittedColumns)].join(', ')}.`
    : undefined
  return NextResponse.json({ success: true, blog: data, warning })
}

export async function DELETE(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const blogId = (await params)?.id
  if (!userId || !blogId) return NextResponse.json({ success: false, message: 'A blog and user session are required.' }, { status: 400 })

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Blog service is not configured.' }, { status: 500 })

  const { data: blog, error: lookupError } = await adminSupabase
    .from('info_blogs')
    .select('id')
    .eq('id', blogId)
    .eq('created_by', userId)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ success: false, message: lookupError.message }, { status: 400 })
  if (!blog) return NextResponse.json({ success: false, message: 'Blog not found or not owned by you.' }, { status: 404 })

  const { error } = await adminSupabase.from('info_blogs').delete().eq('id', blogId).eq('created_by', userId)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  return NextResponse.json({ success: true, blog_id: blogId })
}
