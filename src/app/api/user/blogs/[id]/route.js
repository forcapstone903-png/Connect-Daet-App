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
  if (Object.prototype.hasOwnProperty.call(body, 'title')) updatePayload.title = String(body.title || '').trim()
  if (Object.prototype.hasOwnProperty.call(body, 'content')) updatePayload.content = String(body.content || '').trim()
  if (Object.prototype.hasOwnProperty.call(body, 'excerpt')) updatePayload.excerpt = String(body.excerpt || '').trim() || null
  if (Object.prototype.hasOwnProperty.call(body, 'category')) updatePayload.category = String(body.category || '').trim()
  if (body.status === 'published' || body.status === 'draft' || body.status === 'archived') updatePayload.status = body.status
  if (updatePayload.status === 'published') updatePayload.published_at = new Date().toISOString()

  if ((updatePayload.title !== undefined && !updatePayload.title) || (updatePayload.content !== undefined && !updatePayload.content)) {
    return NextResponse.json({ success: false, message: 'Title and content cannot be empty.' }, { status: 400 })
  }
  if (Object.keys(updatePayload).length === 1) return NextResponse.json({ success: false, message: 'Invalid blog update.' }, { status: 400 })

  const { data, error } = await adminSupabase
    .from('info_blogs')
    .update(updatePayload)
    .eq('id', blogId)
    .eq('created_by', userId)
    .select('id, created_by, title, excerpt, content, category, status, published_at, updated_at')
    .maybeSingle()

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
