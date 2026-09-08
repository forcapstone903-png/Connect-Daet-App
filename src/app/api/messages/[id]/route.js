import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

export async function GET(request, { params }) {
  const currentUserId = getServerSession(request)?.user_id || null
  const resolvedParams = await params
  const otherUserId = resolvedParams?.id || null

  if (!currentUserId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })
  if (!otherUserId || otherUserId === currentUserId) return NextResponse.json({ success: false, message: 'A valid conversation participant is required.' }, { status: 400 })

  const [{ data: messages, error: messagesError }, { data: users, error: usersError }] = await Promise.all([
    adminSupabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, body, media_url, media_type, reply_to_message_id, created_at, read_at')
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true }),
    adminSupabase
      .from('info_users')
      .select('id, full_name, profile_image_url, status')
      .in('id', [currentUserId, otherUserId]),
  ])

  if (messagesError) return NextResponse.json({ success: false, message: messagesError.message }, { status: 500 })
  if (usersError) return NextResponse.json({ success: false, message: usersError.message }, { status: 500 })

  const usersById = new Map((users || []).map((user) => [user.id, user]))
  const otherUser = usersById.get(otherUserId)
  if (!otherUser || otherUser.status !== 'active') return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 })

  return NextResponse.json({
    success: true,
    current_user: usersById.get(currentUserId) || { id: currentUserId, full_name: 'You', profile_image_url: null },
    other_user: otherUser,
    messages: (messages || []).map((message) => ({
      ...message,
      sender_user: usersById.get(message.sender_id) || null,
      recipient_user: usersById.get(message.recipient_id) || null,
    })),
  })
}

export async function PATCH(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const resolvedParams = await params
  const otherUserId = resolvedParams?.id || null
  if (!userId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })
  if (!otherUserId || otherUserId === userId) return NextResponse.json({ success: false, message: 'Invalid conversation.' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const isArchived = body.isArchived === true
  const { error } = await adminSupabase
    .from('message_conversation_settings')
    .upsert({ user_id: userId, other_user_id: otherUserId, is_archived: isArchived, updated_at: new Date().toISOString() }, { onConflict: 'user_id,other_user_id' })
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  return NextResponse.json({ success: true, is_archived: isArchived })
}

export async function DELETE(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const resolvedParams = await params
  const otherUserId = resolvedParams?.id || null
  if (!userId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })
  if (!otherUserId || otherUserId === userId) return NextResponse.json({ success: false, message: 'Invalid conversation.' }, { status: 400 })

  const { error } = await adminSupabase
    .from('direct_messages')
    .delete()
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  await adminSupabase.from('message_conversation_settings').delete().eq('user_id', userId).eq('other_user_id', otherUserId)
  return NextResponse.json({ success: true })
}
