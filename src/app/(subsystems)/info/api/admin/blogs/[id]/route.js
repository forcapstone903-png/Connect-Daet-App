import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { notifyFollowers } from '@/lib/notificationAudience'
import { notifyContentAuthorOfDeletion } from '@/lib/contentDeletionNotifications.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ACTIONS = new Set(['approve', 'reject', 'request_changes', 'return_to_pending'])

export async function POST(request, { params }) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json({ success: false, message: 'Blog moderation is not configured.' }, { status: 500 })
  }

  const blogId = (await params)?.id
  if (!blogId) {
    return NextResponse.json({ success: false, message: 'A blog post is required.' }, { status: 400 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'A moderation decision is required.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: 'A moderation decision is required.' }, { status: 400 })
  }

  const action = typeof body.decision === 'string' && ACTIONS.has(body.decision)
    ? body.decision
    : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!action || (['reject', 'request_changes'].includes(action) && !reason)) {
    return NextResponse.json({ success: false, message: 'Choose a valid decision and provide feedback for rejection or requested changes.' }, { status: 400 })
  }
  if (reason.length > 1000) {
    return NextResponse.json({ success: false, message: 'Moderation feedback must be 1,000 characters or fewer.' }, { status: 400 })
  }

  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const transitionFunction = action === 'request_changes'
    ? 'request_info_blog_changes'
    : 'admin_transition_info_blog'
  const { data, error } = await client.rpc(transitionFunction, {
    p_blog_id: blogId,
    p_reviewer_id: authorization.session.user_id,
    p_action: action,
    p_reason: reason || null,
  })

  if (error) {
    console.error('Blog moderation failed:', error.message)
    const status = /cannot be|only for pending|not found/i.test(error.message || '') ? 409 : 500
    return NextResponse.json({
      success: false,
      message: status === 409
        ? 'This post has changed and can no longer receive that action. Refresh the list and try again.'
        : 'Unable to save the moderation decision.',
    }, { status })
  }

  if (action === 'approve' && data?.created_by) {
    await notifyFollowers(client, {
      authorId: data.created_by,
      type: 'post',
      link: `/info/user/blogs/${data.id}`,
      postId: data.id,
      title: 'New post from someone you follow',
      actionText: 'published a new post',
      subject: data.title,
    })
  }

  return NextResponse.json({ success: true, blog: data }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function PATCH(request, { params }) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json({ success: false, message: 'Blog management is not configured.' }, { status: 500 })
  }

  const blogId = (await params)?.id
  if (!blogId) {
    return NextResponse.json({ success: false, message: 'A blog post is required.' }, { status: 400 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Valid blog fields are required.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: 'Valid blog fields are required.' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const content = typeof body.content === 'string' ? body.content : ''
  const excerpt = typeof body.excerpt === 'string' ? body.excerpt.trim() : ''
  const category = typeof body.category === 'string' ? body.category.trim() : ''
  const featuredImage = typeof body.featured_image === 'string' ? body.featured_image.trim() : ''
  if (!title || title.length > 200 || !content.trim() || content.length > 50000
    || !category || category.length > 80 || excerpt.length > 5000 || featuredImage.length > 2048) {
    return NextResponse.json({ success: false, message: 'Check the title, content, category, excerpt, and image URL lengths.' }, { status: 400 })
  }

  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await client.rpc('admin_edit_info_blog', {
    p_blog_id: blogId,
    p_reviewer_id: authorization.session.user_id,
    p_title: title,
    p_content: content,
    p_excerpt: excerpt || null,
    p_category: category,
    p_featured_image: featuredImage || null,
  })
  if (error) {
    console.error('Admin blog edit failed:', error.message)
    const status = /not found/i.test(error.message || '')
      ? 404
      : /only edit their own/i.test(error.message || '')
        ? 403
        : 500
    const message = status === 404
      ? 'Blog post not found.'
      : status === 403
        ? 'You can only edit blog posts you authored.'
        : 'Unable to save the blog post.'
    return NextResponse.json({ success: false, message }, { status })
  }

  return NextResponse.json({ success: true, blog: data }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function DELETE(request, { params }) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json({ success: false, message: 'Blog management is not configured.' }, { status: 500 })
  }

  const blogId = (await params)?.id
  if (!blogId) {
    return NextResponse.json({ success: false, message: 'A blog post is required.' }, { status: 400 })
  }

  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: blog, error: lookupError } = await client
    .from('info_blogs')
    .select('created_by, title')
    .eq('id', blogId)
    .maybeSingle()
  if (lookupError) {
    console.error('Admin blog deletion lookup failed:', lookupError.message)
    return NextResponse.json({ success: false, message: 'Unable to verify the blog author.' }, { status: 500 })
  }
  if (!blog) return NextResponse.json({ success: false, message: 'Blog post not found.' }, { status: 404 })

  const { data, error } = await client.rpc('admin_delete_info_blog', {
    p_blog_id: blogId,
    p_reviewer_id: authorization.session.user_id,
  })
  if (error) {
    console.error('Admin blog deletion failed:', error.message)
    const status = /not found/i.test(error.message || '') ? 404 : 500
    return NextResponse.json({ success: false, message: status === 404 ? 'Blog post not found.' : 'Unable to delete the blog post.' }, { status })
  }

  const notification = await notifyContentAuthorOfDeletion(client, {
    authorId: blog.created_by,
    actorId: authorization.session.user_id,
    contentType: 'blog post',
    contentTitle: blog.title,
  })

  return NextResponse.json({
    success: true,
    blog: data,
    notificationSent: notification.sent,
    notificationWarning: notification.warning,
  }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
