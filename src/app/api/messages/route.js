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

  const { data, error } = await adminSupabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, body, created_at, read_at')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  const participantIds = [...new Set((data || []).flatMap((message) => [message.sender_id, message.recipient_id]).filter((id) => id !== userId))]
  const { data: users } = participantIds.length
    ? await adminSupabase.from('info_users').select('id, full_name, profile_image_url').in('id', participantIds)
    : { data: [] }
  const usersById = new Map((users || []).map((user) => [user.id, user]))

  return NextResponse.json({
    success: true,
    messages: (data || []).map((message) => ({
      ...message,
      other_user: usersById.get(message.sender_id === userId ? message.recipient_id : message.sender_id) || null,
    })),
  })
}

export async function POST(request) {
  const senderId = getServerSession(request)?.user_id
  if (!senderId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Messaging service is not configured.' }, { status: 500 })

  const body = await request.json()
  const recipientId = String(body.recipientId || '').trim()
  const messageBody = String(body.body || '').trim()
  if (!recipientId || !messageBody || messageBody.length > 2000 || recipientId === senderId) {
    return NextResponse.json({ success: false, message: 'A valid recipient and message are required.' }, { status: 400 })
  }

  const { data: recipient } = await adminSupabase.from('info_users').select('id').eq('id', recipientId).eq('status', 'active').maybeSingle()
  if (!recipient) return NextResponse.json({ success: false, message: 'Recipient not found.' }, { status: 404 })

  const { data, error } = await adminSupabase
    .from('direct_messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, body: messageBody })
    .select('id, sender_id, recipient_id, body, created_at, read_at')
    .single()
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })

  return NextResponse.json({ success: true, message: data })
}
