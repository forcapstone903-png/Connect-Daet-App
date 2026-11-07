import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key ? createClient(url, key) : null
}

export async function PATCH(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const blogId = (await params)?.id
  if (!userId || !blogId) return NextResponse.json({ success: false, message: 'A blog and user session are required.' }, { status: 400 })

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Blog service is not configured.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const updatePayload = { updated_at: new Date().toISOString() }
  const mediaPayload = {}
  if (Object.prototype.hasOwnProperty.call(body, 'title')) updatePayload.title = String(body.title || '').trim()
  if (Object.prototype.hasOwnProperty.call(body, 'content')) updatePayload.content = String(body.content || '').trim()
  if (Object.prototype.hasOwnProperty.call(body, 'excerpt')) updatePayload.excerpt = String(body.excerpt || '').trim() || null
  if (Object.prototype.hasOwnProperty.call(body, 'category')) updatePayload.category = String(body.category || '').trim()
  if (Object.prototype.hasOwnProperty.call(body, 'featured_image')) mediaPayload.featured_image = String(body.featured_image || '').trim() || null
  if (Array.isArray(body.images)) mediaPayload.images = body.images.filter(Boolean)
  if (Array.isArray(body.videos)) mediaPayload.videos = body.videos.filter(Boolean)
  if (Object.prototype.hasOwnProperty.call(body, 'media_layout')) mediaPayload.media_layout = body.media_layout === 'grid' ? 'grid' : 'swipe'
  if (body.status === 'published' || body.status === 'draft' || body.status === 'archived') updatePayload.status = body.status
  if (updatePayload.status === 'published') updatePayload.published_at = new Date().toISOString()

  if ((updatePayload.title !== undefined && !updatePayload.title) || (updatePayload.content !== undefined && !updatePayload.content)) {
    return NextResponse.json({ success: false, message: 'Title and content cannot be empty.' }, { status: 400 })
  }
  if (Object.keys(updatePayload).length === 1 && Object.keys(mediaPayload).length === 0) return NextResponse.json({ success: false, message: 'Invalid blog update.' }, { status: 400 })

  const selectColumns = 'id, created_by, title, excerpt, content, category, status, published_at, updated_at'

  const applyUpdate = (payload) => adminSupabase
    .from('info_blogs')
    .update(payload)
    .eq('id', blogId)
    .eq('created_by', userId)
    .select(selectColumns)
    .maybeSingle()

  let { data, error } = await applyUpdate({ ...updatePayload, ...mediaPayload })

  // Older installations may not have the media columns yet, so retry without them.
  if (error && Object.keys(mediaPayload).length > 0) {
    const errorText = String(error?.message || '').toLowerCase()
    const mediaColumnMissing = error?.code === '42703'
      || Object.keys(mediaPayload).some((column) => errorText.includes(column))
    if (mediaColumnMissing) {
      const retry = await applyUpdate(updatePayload)
      data = retry.data
      error = retry.error
    }
  }

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ success: false, message: 'Blog not found or not owned by you.' }, { status: 404 })
  return NextResponse.json({ success: true, blog: data })
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
