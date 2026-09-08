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

  const participantIds = [...new Set((data || []).flatMap((message) => [message.sender_id, message.recipient_id]).filter((id) => id !== userId))]
  const allUserIds = [...new Set([userId, ...participantIds])]
  const { data: users } = allUserIds.length
    ? await adminSupabase.from('info_users').select('id, full_name, email, profile_image_url').in('id', allUserIds)
    : { data: [] }
  const usersById = new Map((users || []).map((user) => [user.id, user]))
  const conversations = []
  const conversationIds = new Set()

  for (const message of data || []) {
    const otherUserId = message.sender_id === userId ? message.recipient_id : message.sender_id
    if (Boolean(archivedByUser.get(otherUserId)) !== archived) continue
    if (!otherUserId || conversationIds.has(otherUserId)) continue
    conversationIds.add(otherUserId)
    conversations.push({
      id: message.id,
      other_user: usersById.get(otherUserId) || null,
      body: message.body || (message.media_type === 'video' ? 'Video' : 'Photo'),
      created_at: message.created_at,
      sender_id: message.sender_id,
      recipient_id: message.recipient_id,
    })
  }

  return NextResponse.json({
    success: true,
    conversations,
    messages: (data || []).map((message) => ({
      ...message,
      other_user: usersById.get(message.sender_id === userId ? message.recipient_id : message.sender_id) || null,
      sender_user: usersById.get(message.sender_id) || null,
      recipient_user: usersById.get(message.recipient_id) || null,
    })),
    current_user: usersById.get(userId) || { id: userId, full_name: 'You', profile_image_url: null },
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
  const mediaType = ['image', 'video'].includes(body.mediaType) ? body.mediaType : null
  const messageType = ['text', 'image', 'video'].includes(body.messageType)
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

  return NextResponse.json({
    success: true,
    message: { ...data, sender_user: sender || null, recipient_user: recipient },
  })
}
