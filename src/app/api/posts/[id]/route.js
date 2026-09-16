import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isMissingPostStatusColumnError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes("'status' column of 'info_user_posts'") ||
    message.includes('info_user_posts.status') ||
    (message.includes('status') && message.includes('info_user_posts') && message.includes('schema cache'))
  )
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key ? createClient(url, key) : null
}

export async function PATCH(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const postId = (await params)?.id
  if (!userId || !postId) return NextResponse.json({ success: false, message: 'A post and user session are required.' }, { status: 400 })

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Post service is not configured.' }, { status: 500 })
  const body = await request.json().catch(() => ({}))
  const status = body.status === 'archived' ? 'archived' : body.status === 'published' ? 'published' : null
  const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title')
  const hasContent = Object.prototype.hasOwnProperty.call(body, 'content')
  const title = hasTitle ? String(body.title || '').trim() : null
  const content = hasContent ? String(body.content || '').trim() : null
  if (!status && !hasTitle && !hasContent) return NextResponse.json({ success: false, message: 'Invalid post update.' }, { status: 400 })
  if ((hasTitle && !title) || (hasContent && !content)) return NextResponse.json({ success: false, message: 'Title and content cannot be empty.' }, { status: 400 })

  const updatePayload = { updated_at: new Date().toISOString() }
  if (status) updatePayload.status = status
  if (hasTitle) updatePayload.title = title
  if (hasContent) updatePayload.content = content

  const { data, error } = await adminSupabase
    .from('info_user_posts')
    .update(updatePayload)
    .eq('id', postId)
    .eq('user_id', userId)
    .select('id, user_id, title, content, status, created_at, updated_at')
    .maybeSingle()

  if (error && isMissingPostStatusColumnError(error)) {
    return NextResponse.json({
      success: false,
      message: 'Archive support is not available yet on this database. Run the post archive migration for info_user_posts before archiving a post.',
    }, { status: 400 })
  }

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ success: false, message: 'Post not found or not owned by you.' }, { status: 404 })
  return NextResponse.json({ success: true, post: data })
}

export async function DELETE(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const postId = (await params)?.id
  if (!userId || !postId) return NextResponse.json({ success: false, message: 'A post and user session are required.' }, { status: 400 })

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Post service is not configured.' }, { status: 500 })

  const { data: post, error: lookupError } = await adminSupabase
    .from('info_user_posts')
    .select('id')
    .eq('id', postId)
    .eq('user_id', userId)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ success: false, message: lookupError.message }, { status: 400 })
  if (!post) return NextResponse.json({ success: false, message: 'Post not found or not owned by you.' }, { status: 404 })

  const { error: repostError } = await adminSupabase
    .from('reposts')
    .delete()
    .eq('original_content_type', 'user_post')
    .eq('original_content_id', postId)
  if (repostError) return NextResponse.json({ success: false, message: repostError.message }, { status: 400 })

  const { error } = await adminSupabase.from('info_user_posts').delete().eq('id', postId).eq('user_id', userId)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  return NextResponse.json({ success: true, post_id: postId })
}
