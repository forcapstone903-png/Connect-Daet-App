import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })

  const archived = new URL(request.url).searchParams.get('archived') === 'true'
  const { data, error } = await adminSupabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, body, media_url, media_type, reply_to_message_id, created_at, read_at')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  const { data: settings, error: settingsError } = await adminSupabase
    .from('message_conversation_settings')
    .select('other_user_id, is_archived')
    .eq('user_id', userId)
  if (settingsError) return NextResponse.json({ success: false, message: settingsError.message }, { status: 500 })
  const archivedByUser = new Map((settings || []).map((setting) => [setting.other_user_id, setting.is_archived]))

  const rows = data || []
  const participantIds = [...new Set(rows.flatMap((message) => [message.sender_id, message.recipient_id]).filter((id) => id !== userId))]
  const allUserIds = [...new Set([userId, ...participantIds])]
  const { data: users } = allUserIds.length
    ? await adminSupabase.from('info_users').select('id, full_name, email, profile_image_url').in('id', allUserIds)
    : { data: [] }

  const usersById = new Map((users || []).map((user) => [user.id, user]))
  const latestByConversation = new Map()

  for (const message of rows) {
    const otherUserId = message.sender_id === userId ? message.recipient_id : message.sender_id
    if (!otherUserId) continue
    if (Boolean(archivedByUser.get(otherUserId)) !== archived) continue

    const existing = latestByConversation.get(otherUserId)
    if (!existing || new Date(message.created_at) > new Date(existing.created_at)) {
      latestByConversation.set(otherUserId, message)
    }
  }

  const conversationRows = [...latestByConversation.entries()]
    .map(([otherUserId, latestMessage]) => {
      const unreadCount = rows.filter((candidate) => {
        const candidateOtherUserId = candidate.sender_id === userId ? candidate.recipient_id : candidate.sender_id
        return candidateOtherUserId === otherUserId
          && candidate.sender_id === otherUserId
          && candidate.recipient_id === userId
          && !candidate.read_at
      }).length

      const previewText = latestMessage.body?.trim()
        || (latestMessage.media_type === 'gif' ? 'GIF'
        : latestMessage.media_type === 'sticker' ? 'Sticker'
        : latestMessage.media_type === 'video' ? 'Video'
        : latestMessage.media_type === 'image' ? 'Photo'
        : 'New message')

      return {
        id: otherUserId,
        other_user: usersById.get(otherUserId) || null,
        body: previewText,
        created_at: latestMessage.created_at,
        sender_id: latestMessage.sender_id,
        recipient_id: latestMessage.recipient_id,
        unread_count: unreadCount,
      }
    })
    .sort((a, b) => {
      if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count
      return new Date(b.created_at) - new Date(a.created_at)
    })

  return NextResponse.json({
    success: true,
    conversations: conversationRows,
    messages: rows.map((message) => ({
      ...message,
      other_user: usersById.get(message.sender_id === userId ? message.recipient_id : message.sender_id) || null,
      sender_user: usersById.get(message.sender_id) || null,
      recipient_user: usersById.get(message.recipient_id) || null,
    })),
    current_user: usersById.get(userId) || { id: userId, full_name: 'You', profile_image_url: null },
    unread_messages: rows.filter((message) => message.sender_id !== userId && message.recipient_id === userId && !message.read_at).length,
  })
}

export async function POST(request) {
  const senderId = getServerSession(request)?.user_id
  if (!senderId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })

  const body = await request.json()
  const recipientId = String(body.recipientId || '').trim()
  const messageBody = String(body.body || '').trim()
  const mediaUrl = String(body.mediaUrl || '').trim() || null
  const mediaType = ['image', 'video', 'gif', 'sticker'].includes(body.mediaType) ? body.mediaType : null
  const messageType = ['text', 'image', 'video', 'gif', 'sticker'].includes(body.messageType)
    ? body.messageType
    : mediaType || 'text'
  const replyToMessageId = String(body.replyToMessageId || '').trim() || null
  if (!recipientId || (!messageBody && !mediaUrl) || messageBody.length > 2000 || recipientId === senderId) {
    return NextResponse.json({ success: false, message: 'A valid recipient and message are required.' }, { status: 400 })
  }

  const { data: recipient } = await adminSupabase.from('info_users').select('id').eq('id', recipientId).eq('status', 'active').maybeSingle()
  if (!recipient) return NextResponse.json({ success: false, message: 'Recipient not found.' }, { status: 404 })

  if (replyToMessageId) {
    const { data: originalMessage } = await adminSupabase
      .from('direct_messages')
      .select('id')
      .eq('id', replyToMessageId)
      .or(`and(sender_id.eq.${senderId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${senderId})`)
      .maybeSingle()
    if (!originalMessage) return NextResponse.json({ success: false, message: 'The message you are replying to was not found.' }, { status: 400 })
  }

  const insertPayload = {
    sender_id: senderId,
    recipient_id: recipientId,
    body: messageBody || null,
    media_url: mediaUrl,
    media_type: mediaType,
    reply_to_message_id: replyToMessageId,
  }

  let messageRecord
  let insertError
  try {
    const insertResult = await adminSupabase
      .from('direct_messages')
      .insert({ ...insertPayload, message_type: messageType })
      .select('id, sender_id, recipient_id, body, media_url, media_type, reply_to_message_id, created_at, read_at')
      .single()
    messageRecord = insertResult.data
    insertError = insertResult.error
  } catch (error) {
    insertError = error
  }

  if (insertError && insertError.message?.toLowerCase().includes('column') && insertError.message.toLowerCase().includes('message_type')) {
    const fallbackResult = await adminSupabase
      .from('direct_messages')
      .insert({ ...insertPayload })
      .select('id, sender_id, recipient_id, body, media_url, media_type, reply_to_message_id, created_at, read_at')
      .single()
    messageRecord = fallbackResult.data
    insertError = fallbackResult.error
  }

  if (insertError) return NextResponse.json({ success: false, message: insertError.message }, { status: 500 })

  const { data } = { data: messageRecord }

  const { data: sender } = await adminSupabase
    .from('info_users')
    .select('id, full_name, profile_image_url')
    .eq('id', senderId)
    .maybeSingle()

  const displayLink = `/user/messaging/${recipientId}`
  const { data: existing } = await adminSupabase
    .from('info_notifications')
    .select('id')
    .eq('user_id', recipientId)
    .eq('link', displayLink)
    .limit(1)

  if (!existing || existing.length === 0) {
    await adminSupabase.from('info_notifications').insert({
      user_id: recipientId,
      title: 'New message',
      message: `${sender?.full_name || 'Someone'} sent you a message.`,
      type: 'message',
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      link: displayLink,
    })
  }

  return NextResponse.json({
    success: true,
    message: { ...data, sender_user: sender || null, recipient_user: recipient },
  })
}
