import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

function parseSessionCookie(request) {
  const rawCookie = request.cookies.get('daet_auth_session')?.value
  if (!rawCookie) return null

  try {
    return JSON.parse(decodeURIComponent(rawCookie))
  } catch (error) {
    console.error('Invalid daet_auth_session cookie:', error)
    return null
  }
}

export async function GET(request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Notification service is not configured.' }, { status: 500 })
  }

  const session = parseSessionCookie(request)
  const userId = session?.user_id || session?.id || session?.sub || session?.userId

  if (!userId) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  try {
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const { data, error } = await adminSupabase
      .from('info_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ success: true, notifications: data || [] })
  } catch (error) {
    console.error('Notifications fetch failed:', error)
    return NextResponse.json(
      { success: false, message: error.message || 'Unable to load notifications.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Notification service is not configured.' }, { status: 500 })
  }

  const session = parseSessionCookie(request)
  const userId = session?.user_id || session?.id || session?.sub || session?.userId

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

    const notificationId = body.id
    if (!notificationId) {
      return NextResponse.json({ success: false, message: 'Notification id is required.' }, { status: 400 })
    }

    const { error } = await adminSupabase
      .from('info_notifications')
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notification update failed:', error)
    return NextResponse.json(
      { success: false, message: error.message || 'Unable to update notification.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Notification service is not configured.' }, { status: 500 })
  }

  const session = parseSessionCookie(request)
  const userId = session?.user_id || session?.id || session?.sub || session?.userId

  if (!userId) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  try {
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const { error } = await adminSupabase
      .from('info_notifications')
      .delete()
      .eq('user_id', userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notification history deletion failed:', error)
    return NextResponse.json(
      { success: false, message: error.message || 'Unable to delete notification history.' },
      { status: 500 }
    )
  }
}
