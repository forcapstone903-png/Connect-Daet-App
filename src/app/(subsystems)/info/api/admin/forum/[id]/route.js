import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { publicErrorMessage } from '@/lib/publicError'
import { notifyContentAuthorOfDeletion } from '@/lib/contentDeletionNotifications.mjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function missingConfig() {
  return NextResponse.json(
    { success: false, message: 'Server is not configured for forum administration.' },
    { status: 500 }
  )
}

export async function GET(request, { params }) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()
  const { id: threadId } = await params

  try {
    const { data, error } = await adminSupabase
      .from('forum_threads')
      .select('id, title, content, created_by, category_id, forum_categories(id, name), pinned, created_at, updated_at, last_activity_at, reply_count, status')
      .eq('id', threadId)
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: publicErrorMessage(error) }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      thread: { ...data, category: data.forum_categories?.name || 'General' },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Forum thread detail error:', error)
    return NextResponse.json({ success: false, message: publicErrorMessage(error, 'Unable to load thread details') }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()
  const { id: threadId } = await params

  try {
    const body = await request.json()
    const update = { updated_at: new Date().toISOString() }
    if (Object.prototype.hasOwnProperty.call(body, 'title')) update.title = String(body.title || '').trim()
    if (Object.prototype.hasOwnProperty.call(body, 'content')) update.content = String(body.content || '').trim()
    if (Object.prototype.hasOwnProperty.call(body, 'status')) update.status = body.status
    if (Object.prototype.hasOwnProperty.call(body, 'pinned')) update.pinned = Boolean(body.pinned)
    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
      const { data: category, error: categoryError } = await adminSupabase
        .from('forum_categories')
        .select('id')
        .eq('name', String(body.category || '').trim())
        .maybeSingle()
      if (categoryError) return NextResponse.json({ success: false, message: publicErrorMessage(categoryError) }, { status: 500 })
      if (!category) return NextResponse.json({ success: false, message: 'Choose an existing forum category.' }, { status: 400 })
      update.category_id = category.id
    }

    if (update.title === '' || update.content === '' || (update.title && update.title.length > 200) || (update.content && update.content.length > 50000)) {
      return NextResponse.json({ success: false, message: 'Title and content must be non-empty, with a 200-character title and 50,000-character content limit.' }, { status: 400 })
    }
    if (update.status && !['draft', 'pending', 'published', 'closed', 'archived', 'rejected'].includes(update.status)) {
      return NextResponse.json({ success: false, message: 'Choose a valid forum thread status.' }, { status: 400 })
    }
    if (Object.keys(update).length === 1) {
      return NextResponse.json({ success: false, message: 'No thread changes were provided.' }, { status: 400 })
    }
    if (update.title || update.content) update.last_activity_at = update.updated_at

    const { data, error } = await adminSupabase
      .from('forum_threads')
      .update(update)
      .eq('id', threadId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: publicErrorMessage(error) }, { status: 500 })
    }

    return NextResponse.json({ success: true, thread: data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Forum thread update error:', error)
    return NextResponse.json({ success: false, message: publicErrorMessage(error, 'Unable to update thread') }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  if (!adminSupabase) return missingConfig()
  const { id: threadId } = await params

  try {
    const { data: deleted, error } = await adminSupabase
      .from('forum_threads')
      .delete()
      .eq('id', threadId)
      .select('id, created_by, title')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, message: publicErrorMessage(error) }, { status: 500 })
    }
    if (!deleted) {
      return NextResponse.json({ success: false, message: 'Forum thread not found.' }, { status: 404 })
    }

    const notification = await notifyContentAuthorOfDeletion(adminSupabase, {
      authorId: deleted.created_by,
      actorId: authorization.session.user_id,
      contentType: 'forum topic',
      contentTitle: deleted.title,
    })

    return NextResponse.json({
      success: true,
      message: 'Thread deleted successfully',
      notificationSent: notification.sent,
      notificationWarning: notification.warning,
    })
  } catch (error) {
    console.error('Forum thread delete error:', error)
    return NextResponse.json({ success: false, message: publicErrorMessage(error, 'Unable to delete thread') }, { status: 500 })
  }
}
