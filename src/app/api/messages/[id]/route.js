import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
const getConversationId = (firstUserId, secondUserId) => [String(firstUserId), String(secondUserId)].sort().join(':')

export async function GET(request, { params }) {
  const currentUserId = getServerSession(request)?.user_id || null
  const resolvedParams = await params
  const otherUserId = resolvedParams?.id || null

  if (!currentUserId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })
  if (!otherUserId || otherUserId === currentUserId) return NextResponse.json({ success: false, message: 'A valid conversation participant is required.' }, { status: 400 })

  const [{ data: messages, error: messagesError }, { data: users, error: usersError }, { data: pins, error: pinsError }, { data: pinActivities, error: pinActivitiesError }] = await Promise.all([
    adminSupabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, body, media_url, media_type, reply_to_message_id, created_at, read_at, deleted_for, metadata')
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true }),
    adminSupabase
      .from('info_users')
      .select('id, full_name, profile_image_url, status')
      .in('id', [currentUserId, otherUserId]),
    adminSupabase
      .from('pinned_messages')
      .select('message_id')
      .eq('conversation_id', getConversationId(currentUserId, otherUserId)),
    adminSupabase
      .from('pinned_message_activity')
      .select('id, message_id, actor_user_id, action_type, created_at')
      .eq('conversation_id', getConversationId(currentUserId, otherUserId))
      .order('created_at', { ascending: true }),
  ])

  if (usersError) return NextResponse.json({ success: false, message: usersError.message }, { status: 500 })
  const usersById = new Map((users || []).map((user) => [user.id, user]))
  if (pinsError || pinActivitiesError) return NextResponse.json({ success: false, message: pinsError?.message || pinActivitiesError?.message }, { status: 500 })
  const pinnedMessageIds = new Set((pins || []).map((pin) => pin.message_id))
  const pinActivitiesWithActors = (pinActivities || []).map((activity) => ({ ...activity, actor: usersById.get(activity.actor_user_id) || null }))
  const otherUser = usersById.get(otherUserId)
  if (!otherUser || otherUser.status !== 'active') return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 })

  if (messagesError && messagesError.message?.toLowerCase().includes('column') && messagesError.message.toLowerCase().includes('message_type')) {
    const { data: messagesFallback, error: messagesFallbackError } = await adminSupabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, body, media_url, media_type, reply_to_message_id, created_at, read_at, deleted_for, metadata')
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true })

    if (messagesFallbackError) return NextResponse.json({ success: false, message: messagesFallbackError.message }, { status: 500 })
    return NextResponse.json({
      success: true,
      current_user: usersById.get(currentUserId) || { id: currentUserId, full_name: 'You', profile_image_url: null },
      other_user: otherUser,
      pin_activities: pinActivitiesWithActors,
      messages: (messagesFallback || []).filter((message) => !message.deleted_for?.includes(currentUserId)).map((message) => ({
        ...message,
        metadata: { ...(message.metadata || {}), pinned: pinnedMessageIds.has(message.id) },
        sender_user: usersById.get(message.sender_id) || null,
        recipient_user: usersById.get(message.recipient_id) || null,
      })),
    })
  }

  if (messagesError) return NextResponse.json({ success: false, message: messagesError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    current_user: usersById.get(currentUserId) || { id: currentUserId, full_name: 'You', profile_image_url: null },
    other_user: otherUser,
    pin_activities: pinActivitiesWithActors,
    messages: (messages || []).filter((message) => !message.deleted_for?.includes(currentUserId)).map((message) => ({
      ...message,
      metadata: { ...(message.metadata || {}), pinned: pinnedMessageIds.has(message.id) },
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
  if (body.messageId && ['pin', 'unpin', 'edit'].includes(body.action)) {
    const { data: message, error: messageError } = await adminSupabase
      .from('direct_messages')
    .select('id, sender_id, recipient_id, body, media_url, media_type, metadata, created_at')
      .eq('id', body.messageId)
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`)
      .maybeSingle()
    if (messageError || !message) return NextResponse.json({ success: false, message: messageError?.message || 'Message not found.' }, { status: messageError ? 500 : 404 })

    const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {}
    if (body.action === 'edit') {
      const nextBody = String(body.body || '').trim()
      if (message.sender_id !== userId) return NextResponse.json({ success: false, message: 'Only your own messages can be edited.' }, { status: 403 })
      if (!nextBody || nextBody.length > 2000 || message.media_url || message.media_type) return NextResponse.json({ success: false, message: 'Only text messages can be edited.' }, { status: 400 })
      const { data: reply, error: replyError } = await adminSupabase
        .from('direct_messages')
        .select('id')
        .eq('sender_id', otherUserId)
        .eq('recipient_id', userId)
        .gt('created_at', message.created_at)
        .limit(1)
        .maybeSingle()
      if (replyError) return NextResponse.json({ success: false, message: replyError.message }, { status: 500 })
      if (reply) return NextResponse.json({ success: false, message: 'This message can no longer be edited because the recipient has already replied.' }, { status: 403 })
      const nextMetadata = { ...metadata, edited: true }
      const result = await adminSupabase.from('direct_messages').update({ body: nextBody, metadata: nextMetadata }).eq('id', message.id)
      if (result.error) return NextResponse.json({ success: false, message: result.error.message }, { status: 500 })
      return NextResponse.json({ success: true, message_id: message.id, body: nextBody, metadata: nextMetadata })
    }

    const nextMetadata = { ...metadata }
    const conversationId = getConversationId(userId, otherUserId)
    if (body.action === 'pin') {
      nextMetadata.pinned = true
      const pinResult = await adminSupabase
        .from('pinned_messages')
        .upsert({ conversation_id: conversationId, message_id: message.id, pinned_by: userId, actor_user_id: userId }, { onConflict: 'conversation_id,message_id' })
      if (pinResult.error) return NextResponse.json({ success: false, message: pinResult.error.message }, { status: 500 })
    } else {
      delete nextMetadata.pinned
      const unpinResult = await adminSupabase
        .from('pinned_messages')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('message_id', message.id)
      if (unpinResult.error) return NextResponse.json({ success: false, message: unpinResult.error.message }, { status: 500 })
    }
    const activityResult = await adminSupabase.from('pinned_message_activity').insert({
      conversation_id: conversationId,
      message_id: message.id,
      actor_user_id: userId,
      action_type: body.action === 'pin' ? 'pinned' : 'unpinned',
    }).select('id, message_id, actor_user_id, action_type, created_at').single()
    if (activityResult.error) return NextResponse.json({ success: false, message: activityResult.error.message }, { status: 500 })
    const result = await adminSupabase.from('direct_messages').update({ metadata: nextMetadata }).eq('id', message.id)
    if (result.error) return NextResponse.json({ success: false, message: result.error.message }, { status: 500 })
    return NextResponse.json({ success: true, message_id: message.id, metadata: nextMetadata, pin_activity: activityResult.data })
  }

  if (body.markRead === true) {
    const { error } = await adminSupabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', otherUserId)
      .eq('recipient_id', userId)
      .is('read_at', null)
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    return NextResponse.json({ success: true, marked_read: true })
  }

  const updatePayload = { updated_at: new Date().toISOString() }
  if (typeof body.isArchived === 'boolean') updatePayload.is_archived = body.isArchived
  if (typeof body.isMuted === 'boolean') updatePayload.is_muted = body.isMuted
  if (body.deleteConversation === true) updatePayload.is_deleted = true

  if (Object.keys(updatePayload).length === 1) {
    return NextResponse.json({ success: false, message: 'A conversation action is required.' }, { status: 400 })
  }

  const { error } = await adminSupabase
    .from('message_conversation_settings')
    .upsert({ user_id: userId, other_user_id: otherUserId, ...updatePayload }, { onConflict: 'user_id,other_user_id' })
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  return NextResponse.json({ success: true, ...updatePayload })
}

export async function DELETE(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const resolvedParams = await params
  const otherUserId = resolvedParams?.id || null
  if (!userId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })
  if (!otherUserId || otherUserId === userId) return NextResponse.json({ success: false, message: 'Invalid conversation.' }, { status: 400 })

  const messageId = new URL(request.url).searchParams.get('messageId')
  const deleteFor = new URL(request.url).searchParams.get('deleteFor') || 'you'
  if (!messageId) return NextResponse.json({ success: false, message: 'A message ID is required.' }, { status: 400 })

  const participantFilter = `and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`
  let error

  if (deleteFor === 'all') {
    const result = await adminSupabase
      .from('direct_messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', userId)
      .eq('recipient_id', otherUserId)
    error = result.error
  } else if (deleteFor === 'you') {
    const { data: message, error: selectError } = await adminSupabase
      .from('direct_messages')
      .select('id, deleted_for')
      .eq('id', messageId)
      .or(participantFilter)
      .maybeSingle()
    error = selectError
    if (!error && !message) error = new Error('Message not found.')
    if (!error) {
      const deletedFor = Array.from(new Set([...(message.deleted_for || []), userId]))
      const result = await adminSupabase
        .from('direct_messages')
        .update({ deleted_for: deletedFor })
        .eq('id', messageId)
      error = result.error
    }
  } else {
    return NextResponse.json({ success: false, message: 'Invalid deletion option.' }, { status: 400 })
  }

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  return NextResponse.json({ success: true, message_id: messageId })
}
