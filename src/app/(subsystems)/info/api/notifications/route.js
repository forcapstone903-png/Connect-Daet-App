import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'
import { publicErrorMessage } from '@/lib/publicError'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

async function attachActorProfiles(adminSupabase, notifications) {
  const actorIds = [...new Set((notifications || []).map((notification) => notification.actor_id || notification.post_owner_id).filter(Boolean))]
  if (!actorIds.length) return notifications || []

  const { data: actors } = await adminSupabase
    .from('info_users')
    .select('id, full_name, profile_image_url')
    .in('id', actorIds)

  const actorsById = new Map((actors || []).map((actor) => [actor.id, actor]))
  return (notifications || []).map((notification) => ({
    ...notification,
    actor_id: notification.actor_id || notification.post_owner_id || null,
    actor: actorsById.get(notification.actor_id || notification.post_owner_id) || null,
  }))
}

function applyNotificationPreferences(query, preferences = {}) {
  const suppressedTypes = []
  if (preferences.newFollowers === false) suppressedTypes.push('follow')
  if (preferences.forumMentions === false) suppressedTypes.push('comment', 'mention')
  if (preferences.announcementAlerts === false) suppressedTypes.push('announcement')
  return suppressedTypes.length ? query.not('type', 'in', `(${suppressedTypes.join(',')})`) : query
}

export async function GET(request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Notification service is not configured.' }, { status: 500 })
  }

  const userId = getServerSession(request)?.user_id

  if (!userId) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  try {
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('notification_preferences')
      .eq('user_id', userId)
      .maybeSingle()
    if (profileError) throw profileError
    const preferences = profile?.notification_preferences || {}
    const [{ data, error }, { count: unreadCount, error: unreadError }] = await Promise.all([
      applyNotificationPreferences(adminSupabase
        .from('info_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50), preferences),
      applyNotificationPreferences(adminSupabase
        .from('info_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .or('is_read.eq.false,is_read.is.null'), preferences),
    ])

    if (error) throw error
    if (unreadError) throw unreadError

    return NextResponse.json({
      success: true,
      notifications: await attachActorProfiles(adminSupabase, data || []),
      unread_count: unreadCount || 0,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Notifications fetch failed:', error)
    return NextResponse.json(
      { success: false, message: publicErrorMessage(error, 'Unable to load notifications.') },
      { status: 500 }
    )
  }
}

export async function PATCH(request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Notification service is not configured.' }, { status: 500 })
  }

  const userId = getServerSession(request)?.user_id

  if (!userId) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

    if (body.markAllRead) {
      const { error } = await adminSupabase
        .from('info_notifications')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    const notificationId = body.id || body.notificationId
    if (!notificationId) {
      return NextResponse.json({ success: false, message: 'Notification id is required.' }, { status: 400 })
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
      is_read: typeof body.is_read === 'boolean' ? body.is_read : true,
    }

    if (typeof body.link === 'string') {
      updatePayload.link = body.link
    }

    const { error } = await adminSupabase
      .from('info_notifications')
      .update(updatePayload)
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notification update failed:', error)
    return NextResponse.json(
      { success: false, message: publicErrorMessage(error, 'Unable to update notification.') },
      { status: 500 }
    )
  }
}

export async function DELETE(request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Notification service is not configured.' }, { status: 500 })
  }

  const userId = getServerSession(request)?.user_id

  if (!userId) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  try {
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const notificationId = new URL(request.url).searchParams.get('id')
    let deleteQuery = adminSupabase
      .from('info_notifications')
      .delete()
      .eq('user_id', userId)

    if (notificationId) deleteQuery = deleteQuery.eq('id', notificationId)

    const { error } = await deleteQuery

    if (error) throw error
    return NextResponse.json({ success: true, deleted_id: notificationId || null })
  } catch (error) {
    console.error('Notification history deletion failed:', error)
    return NextResponse.json(
      { success: false, message: publicErrorMessage(error, 'Unable to delete notification history.') },
      { status: 500 }
    )
  }
}
