import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { getPrivateProfileMessagingAccess } from '@/lib/serverPrivacy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
const ALLOWED_REACTIONS = new Set(['👍', '❤️', '😂', '😮', '😢', '😡'])

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })

  const ids = new URL(request.url).searchParams.get('messageIds')?.split(',').map((id) => id.trim()).filter(Boolean) || []
  if (!ids.length) return NextResponse.json({ success: true, reactions: [] })
  const { data: messages, error: messagesError } = await adminSupabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id')
    .in('id', ids)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
  if (messagesError) return NextResponse.json({ success: false, message: messagesError.message }, { status: 500 })

  const accessibleMessageIds = []
  for (const message of messages || []) {
    const otherUserId = message.sender_id === userId ? message.recipient_id : message.sender_id
    const access = await getPrivateProfileMessagingAccess(adminSupabase, userId, otherUserId)
    if (access.error) return NextResponse.json({ success: false, message: access.error.message }, { status: 500 })
    if (access.allowed) accessibleMessageIds.push(message.id)
  }
  if (!accessibleMessageIds.length) return NextResponse.json({ success: true, reactions: [] })

  const { data, error } = await adminSupabase
    .from('direct_message_reactions')
    .select('message_id, user_id, reaction')
    .in('message_id', accessibleMessageIds)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, reactions: data || [] })
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const messageId = String(body.messageId || '').trim()
  const reaction = String(body.reaction || '').trim()
  if (!messageId || !ALLOWED_REACTIONS.has(reaction)) return NextResponse.json({ success: false, message: 'A valid message and reaction are required.' }, { status: 400 })

  const { data: message } = await adminSupabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id')
    .eq('id', messageId)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .maybeSingle()
  if (!message) return NextResponse.json({ success: false, message: 'Message not found.' }, { status: 404 })
  const otherUserId = message.sender_id === userId ? message.recipient_id : message.sender_id
  const access = await getPrivateProfileMessagingAccess(adminSupabase, userId, otherUserId)
  if (access.error) return NextResponse.json({ success: false, message: access.error.message }, { status: 500 })
  if (!access.allowed) {
    return NextResponse.json({ success: false, message: 'You must be an approved follower to access this conversation.' }, { status: 403 })
  }

  const { data, error } = await adminSupabase
    .from('direct_message_reactions')
    .upsert({ message_id: messageId, user_id: userId, reaction }, { onConflict: 'message_id,user_id' })
    .select('message_id, user_id, reaction')
    .single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  return NextResponse.json({ success: true, reaction: data })
}
