import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { getPrivateProfileMessagingAccess } from '@/lib/serverPrivacy'
import { publicErrorMessage } from '@/lib/publicError'

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
  let { data, error } = await adminSupabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, body, media_url, media_type, message_type, reply_to_message_id, created_at, read_at, deleted_for')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error?.message?.toLowerCase().includes('column') && error.message.toLowerCase().includes('message_type')) {
    ({ data, error } = await adminSupabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, body, media_url, media_type, reply_to_message_id, created_at, read_at, deleted_for')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(1000))
  }
  if (error) return NextResponse.json({ success: false, message: publicErrorMessage(error) }, { status: 500 })

  const { data: settings, error: settingsError } = await adminSupabase
    .from('message_conversation_settings')
    .select('other_user_id, is_archived, is_muted, is_deleted')
    .eq('user_id', userId)
  if (settingsError) return NextResponse.json({ success: false, message: publicErrorMessage(settingsError) }, { status: 500 })
  const settingsByUser = new Map((settings || []).map((setting) => [setting.other_user_id, setting]))

  let rows = (data || []).filter((message) => !message.deleted_for?.includes(userId))
  const participantIds = [...new Set(rows.flatMap((message) => [message.sender_id, message.recipient_id]).filter((id) => id !== userId))]
  const allUserIds = [...new Set([userId, ...participantIds])]
  const [{ data: users, error: usersError }, { data: profiles, error: profilesError }, { data: followRows, error: followsError }, { data: blockRows, error: blocksError }] = await Promise.all([
    allUserIds.length
      ? adminSupabase.from('info_users').select('id, full_name, email, profile_image_url').in('id', allUserIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? adminSupabase.from('profiles').select('user_id, privacy_level, is_public').in('user_id', participantIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? adminSupabase.from('user_follows').select('following_id').eq('follower_id', userId).in('following_id', participantIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? adminSupabase.from('user_blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (usersError) return NextResponse.json({ success: false, message: publicErrorMessage(usersError) }, { status: 500 })
  if (profilesError) return NextResponse.json({ success: false, message: publicErrorMessage(profilesError) }, { status: 500 })
  if (followsError) return NextResponse.json({ success: false, message: publicErrorMessage(followsError) }, { status: 500 })
  if (blocksError) return NextResponse.json({ success: false, message: publicErrorMessage(blocksError) }, { status: 500 })

  const followedIds = new Set((followRows || []).map((row) => row.following_id))
  const blockedIds = new Set((blockRows || []).map((row) => row.blocker_id === userId ? row.blocked_id : row.blocker_id))
  const restrictedIds = new Set((profiles || [])
    .filter((profile) => {
      const privacyLevel = profile.is_public === false
        ? (['followers', 'private'].includes(profile.privacy_level) ? profile.privacy_level : 'followers')
        : profile.privacy_level || 'public'
      return privacyLevel !== 'public'
    })
    .map((profile) => profile.user_id)
    .filter((id) => !followedIds.has(id)))
  rows = rows.filter((message) => {
    const otherUserId = message.sender_id === userId ? message.recipient_id : message.sender_id
    return !restrictedIds.has(otherUserId) && !blockedIds.has(otherUserId)
  })

  const usersById = new Map((users || []).map((user) => [user.id, user]))
  const latestByConversation = new Map()

  for (const message of rows) {
    const otherUserId = message.sender_id === userId ? message.recipient_id : message.sender_id
    if (!otherUserId) continue
    const conversationSettings = settingsByUser.get(otherUserId) || {}
    if (conversationSettings.is_deleted || Boolean(conversationSettings.is_archived) !== archived) continue

    const existing = latestByConversation.get(otherUserId)
    if (!existing || new Date(message.created_at) > new Date(existing.created_at)) {
      latestByConversation.set(otherUserId, message)
    }
  }

  const conversationRows = [...latestByConversation.entries()]
    .map(([otherUserId, latestMessage]) => {
      const conversationSettings = settingsByUser.get(otherUserId) || {}
      const unreadCount = rows.filter((candidate) => {
        const candidateOtherUserId = candidate.sender_id === userId ? candidate.recipient_id : candidate.sender_id
        return candidateOtherUserId === otherUserId
          && candidate.sender_id === otherUserId
          && candidate.recipient_id === userId
          && !candidate.read_at
      }).length

      const typeHint = latestMessage.message_type || latestMessage.media_type
      const previewText = latestMessage.body?.trim()
        || (typeHint === 'gif' ? 'GIF'
        : typeHint === 'sticker' ? 'Sticker'
        : typeHint === 'video' ? 'Video'
        : typeHint === 'image' ? 'Photo'
        : 'New message')

      return {
        id: otherUserId,
        other_user: usersById.get(otherUserId) || null,
        body: previewText,
        created_at: latestMessage.created_at,
        sender_id: latestMessage.sender_id,
        recipient_id: latestMessage.recipient_id,
        unread_count: unreadCount,
        is_muted: Boolean(conversationSettings.is_muted),
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
  }, { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } })
}

export async function POST(request) {
  const senderId = getServerSession(request)?.user_id
  if (!senderId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })

  const body = await request.json()
  const recipientId = String(body.recipientId || '').trim()
  const messageBody = String(body.body || '').trim()
  const mediaUrl = typeof body.mediaUrl === 'string' && body.mediaUrl.trim().length > 0 ? body.mediaUrl.trim() : null
  const requestedMediaType = ['image', 'video', 'gif', 'sticker'].includes(body.mediaType) ? body.mediaType : null
  const requestedMessageType = ['text', 'image', 'video', 'gif', 'sticker'].includes(body.messageType)
    ? body.messageType
    : requestedMediaType || 'text'

  // Keep the compatibility constraint of older direct_messages tables happy.
  // GIF and sticker posts are stored as image media payloads, while the
  // message_type column preserves the semantic type (`gif` / `sticker`).
  const mediaType = requestedMediaType === 'gif' || requestedMediaType === 'sticker'
    ? 'image'
    : requestedMediaType
  const messageType = requestedMessageType
  const replyToMessageId = String(body.replyToMessageId || '').trim() || null
  if (!recipientId || (!messageBody && !mediaUrl) || messageBody.length > 2000 || recipientId === senderId) {
    return NextResponse.json({ success: false, message: 'A valid recipient and message are required.' }, { status: 400 })
  }

  const { data: recipient, error: recipientError } = await adminSupabase
    .from('info_users')
    .select('id')
    .eq('id', recipientId)
    .eq('status', 'active')
    .maybeSingle()
  if (recipientError) return NextResponse.json({ success: false, message: publicErrorMessage(recipientError) }, { status: 500 })
  if (!recipient) return NextResponse.json({ success: false, message: 'Recipient not found.' }, { status: 404 })

  const { data: blockRows, error: blocksError } = await adminSupabase
    .from('user_blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${senderId},blocked_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_id.eq.${senderId})`)
    .limit(1)
  if (blocksError) return NextResponse.json({ success: false, message: publicErrorMessage(blocksError) }, { status: 500 })
  if (blockRows?.length) {
    return NextResponse.json({ success: false, message: 'Messaging is unavailable because one of these accounts has blocked the other.' }, { status: 403 })
  }

  const { data: recipientProfile, error: recipientProfileError } = await adminSupabase
    .from('profiles')
    .select('privacy_level, is_public, privacy_preferences')
    .eq('user_id', recipientId)
    .maybeSingle()
  if (recipientProfileError) return NextResponse.json({ success: false, message: publicErrorMessage(recipientProfileError) }, { status: 500 })

  const messagingAccess = await getPrivateProfileMessagingAccess(adminSupabase, senderId, recipientId)
  if (messagingAccess.error) {
    return NextResponse.json({ success: false, message: messagingAccess.error.message }, { status: 500 })
  }
  if (!messagingAccess.allowed) {
    return NextResponse.json({ success: false, message: 'You must be an approved follower to message this user.' }, { status: 403 })
  }

  if (recipientProfile?.privacy_preferences?.allowMessagesFrom === 'connections') {
    const [{ data: existingMessage, error: existingMessageError }, { data: senderFollowsRecipient, error: senderFollowError }, { data: recipientFollowsSender, error: recipientFollowError }] = await Promise.all([
      adminSupabase
        .from('direct_messages')
        .select('id')
        .or(`and(sender_id.eq.${senderId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${senderId})`)
        .limit(1)
        .maybeSingle(),
      adminSupabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', senderId)
        .eq('following_id', recipientId)
        .maybeSingle(),
      adminSupabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', recipientId)
        .eq('following_id', senderId)
        .maybeSingle(),
    ])

    const relationshipError = existingMessageError || senderFollowError || recipientFollowError
    if (relationshipError) return NextResponse.json({ success: false, message: publicErrorMessage(relationshipError) }, { status: 500 })
    if (!existingMessage && (!senderFollowsRecipient || !recipientFollowsSender)) {
      return NextResponse.json({ success: false, message: 'This user only accepts messages from connections.' }, { status: 403 })
    }
  }

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
      .select('id, sender_id, recipient_id, body, media_url, media_type, message_type, reply_to_message_id, created_at, read_at')
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

  if (insertError) return NextResponse.json({ success: false, message: publicErrorMessage(insertError) }, { status: 500 })

  const { data } = { data: messageRecord }

  const { data: sender } = await adminSupabase
    .from('info_users')
    .select('id, full_name, profile_image_url')
    .eq('id', senderId)
    .maybeSingle()

  const displayLink = `/info/user/messaging/${senderId}`
  const { error: notificationError } = await adminSupabase.from('info_notifications').insert({
    user_id: recipientId,
    title: 'New message',
    message: `${sender?.full_name || 'Someone'} sent you a message.`,
    type: 'message',
    is_read: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    link: displayLink,
    actor_id: senderId,
  })

  if (notificationError) {
    console.error('Message notification creation failed:', notificationError)
  }

  return NextResponse.json({
    success: true,
    message: { ...data, sender_user: sender || null, recipient_user: recipient },
  })
}
