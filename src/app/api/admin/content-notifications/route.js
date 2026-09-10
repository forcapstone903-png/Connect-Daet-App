import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function normalizeType(type) {
  if (!type) return 'info'
  return String(type).toLowerCase()
}

function notificationTitleFor(type) {
  if (type === 'event') return 'New event from Administrator'
  if (type === 'announcement') return 'New announcement from Administrator'
  if (type === 'forum' || type === 'forum_thread') return 'New forum post from Administrator'
  return 'New post from Administrator'
}

export async function POST(request) {
  const session = getServerSession(request)
  const currentUserId = session?.user_id || null
  const currentRole = String(session?.role || '').toLowerCase()

  if (!currentUserId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Notification service is not configured.' }, { status: 500 })
  if (currentRole !== 'admin' && currentRole !== 'administrator') {
    return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const contentType = normalizeType(body.type || body.contentType || 'post')
    const contentId = String(body.contentId || body.id || body.entityId || '').trim()
    const title = String(body.title || body.postTitle || '').trim()
    const message = String(body.message || body.content || body.body || title).trim()
    const link = String(body.link || body.action_url || body.href || '').trim()

    if (!title) {
      return NextResponse.json({ success: false, message: 'Content title is required.' }, { status: 400 })
    }

    const { data: recipients, error: recipientError } = await adminSupabase
      .from('info_users')
      .select('id, user_type, status')
      .eq('status', 'active')
      .neq('user_type', 'admin')

    if (recipientError) throw recipientError

    const notificationRows = []

    for (const recipient of recipients || []) {
      if (!recipient?.id) continue

      // Keep a deterministic duplicate shield by checking the same recipient/link pair.
      const { data: existing, error: existingError } = await adminSupabase
        .from('info_notifications')
        .select('id')
        .eq('user_id', recipient.id)
        .eq('link', link)
        .limit(1)

      if (existingError) {
        console.error('Notification duplicate lookup failed:', existingError)
      }

      if (existing && existing.length > 0) continue

      notificationRows.push({
        user_id: recipient.id,
        title: notificationTitleFor(contentType),
        message,
        type: contentType,
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        link,
        post_id: contentId || null,
        post_owner_id: currentUserId || null,
        actor_id: currentUserId,
      })
    }

    if (!notificationRows.length) {
      return NextResponse.json({ success: true, inserted: 0 })
    }

    const { error } = await adminSupabase.from('info_notifications').insert(notificationRows)
    if (error) throw error

    return NextResponse.json({ success: true, inserted: notificationRows.length })
  } catch (error) {
    console.error('Content notification creation failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to create notifications.' }, { status: 500 })
  }
}
