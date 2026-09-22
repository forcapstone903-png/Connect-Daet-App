import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

const getConversationId = (firstUserId, secondUserId) => [String(firstUserId), String(secondUserId)].sort().join(':')

async function getContext(request, params) {
  const userId = getServerSession(request)?.user_id || null
  const resolvedParams = await params
  const otherUserId = resolvedParams?.id || null
  if (!userId) return { error: NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 }) }
  if (!adminSupabase) return { error: NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 }) }
  if (!otherUserId || otherUserId === userId) return { error: NextResponse.json({ success: false, message: 'Invalid conversation.' }, { status: 400 }) }
  return { userId, otherUserId, conversationId: getConversationId(userId, otherUserId) }
}

export async function GET(request, { params }) {
  const context = await getContext(request, params)
  if (context.error) return context.error

  const { data: pins, error: pinsError } = await adminSupabase
    .from('pinned_messages')
    .select('id, message_id, pinned_by, pinned_at')
    .eq('conversation_id', context.conversationId)
    .order('pinned_at', { ascending: false })
  if (pinsError) return NextResponse.json({ success: false, message: pinsError.message }, { status: 500 })

  const messageIds = (pins || []).map((pin) => pin.message_id)
  if (!messageIds.length) return NextResponse.json({ success: true, pinned_messages: [] })

  const { data: messages, error: messagesError } = await adminSupabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, body, media_url, media_type, created_at, deleted_for, metadata')
    .in('id', messageIds)
  if (messagesError) return NextResponse.json({ success: false, message: messagesError.message }, { status: 500 })

  const userIds = [...new Set((messages || []).flatMap((message) => [message.sender_id, message.recipient_id]))]
  const { data: users } = await adminSupabase.from('info_users').select('id, full_name, profile_image_url').in('id', userIds)
  const usersById = new Map((users || []).map((user) => [user.id, user]))
  const messagesById = new Map((messages || []).map((message) => [message.id, message]))

  return NextResponse.json({
    success: true,
    pinned_messages: (pins || []).map((pin) => ({
      ...pin,
      message: messagesById.get(pin.message_id) || null,
      sender: usersById.get(messagesById.get(pin.message_id)?.sender_id) || null,
      unavailable: !messagesById.has(pin.message_id) || messagesById.get(pin.message_id)?.deleted_for?.includes(context.userId),
    })),
  })
}

export async function POST(request, { params }) {
  const context = await getContext(request, params)
  if (context.error) return context.error
  const body = await request.json().catch(() => ({}))
  const messageId = String(body.messageId || '').trim()
  if (!messageId) return NextResponse.json({ success: false, message: 'A message ID is required.' }, { status: 400 })

  const { data: message, error: messageError } = await adminSupabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id')
    .eq('id', messageId)
    .or(`and(sender_id.eq.${context.userId},recipient_id.eq.${context.otherUserId}),and(sender_id.eq.${context.otherUserId},recipient_id.eq.${context.userId})`)
    .maybeSingle()
  if (messageError || !message) return NextResponse.json({ success: false, message: messageError?.message || 'Message not found.' }, { status: messageError ? 500 : 404 })

  const { data, error } = await adminSupabase
    .from('pinned_messages')
    .upsert({ conversation_id: context.conversationId, message_id: message.id, pinned_by: context.userId }, { onConflict: 'conversation_id,message_id' })
    .select('id, message_id, pinned_by, pinned_at')
    .single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, pinned_message: data })
}

export async function DELETE(request, { params }) {
  const context = await getContext(request, params)
  if (context.error) return context.error
  const messageId = new URL(request.url).searchParams.get('messageId')
  if (!messageId) return NextResponse.json({ success: false, message: 'A message ID is required.' }, { status: 400 })

  const { error } = await adminSupabase
    .from('pinned_messages')
    .delete()
    .eq('conversation_id', context.conversationId)
    .eq('message_id', messageId)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, message_id: messageId })
}
