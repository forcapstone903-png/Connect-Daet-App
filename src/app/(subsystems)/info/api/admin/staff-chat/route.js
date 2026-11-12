import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { normalizeStaffRole, isStaffRole } from '@/lib/staffRoles.mjs'
import { publicErrorMessage } from '@/lib/publicError'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STAFF_DATABASE_ROLES = ['admin', 'administrator', 'tourism_officer', 'moderator']

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

async function getActiveStaffProfile(client, session) {
  const sessionRole = normalizeStaffRole(session.role)
  const { data: profile, error } = await client
    .from('info_users')
    .select('id, full_name, user_type, status')
    .eq('id', session.user_id)
    .maybeSingle()

  if (error) return { error }
  if (
    !profile
    || profile.status !== 'active'
    || !isStaffRole(profile.user_type)
    || normalizeStaffRole(profile.user_type) !== sessionRole
  ) {
    return { forbidden: true }
  }

  return { profile }
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Staff chat is not configured.' }, 500)

  const { profile, error: profileError, forbidden } = await getActiveStaffProfile(client, authorization.session)
  if (profileError) return respond({ success: false, message: publicErrorMessage(profileError) }, 500)
  if (forbidden) return respond({ success: false, message: 'An active staff account is required.' }, 403)

  const { data, error } = await client
    .from('staff_chat_messages')
    .select('id, sender_id, body, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return respond({ success: false, message: publicErrorMessage(error) }, 500)

  const messages = (data || []).reverse()
  const senderIds = [...new Set(messages.map((message) => message.sender_id))]
  const { data: senders, error: sendersError } = senderIds.length
    ? await client.from('info_users').select('id, full_name, user_type').in('id', senderIds)
    : { data: [], error: null }
  if (sendersError) return respond({ success: false, message: publicErrorMessage(sendersError) }, 500)

  const sendersById = new Map((senders || []).map((sender) => [sender.id, sender]))
  return respond({
    success: true,
    currentUserId: profile.id,
    messages: messages.map((message) => ({
      ...message,
      sender: sendersById.get(message.sender_id) || { id: message.sender_id, full_name: 'Former staff member' },
    })),
  })
}

export async function POST(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Staff chat is not configured.' }, 500)

  const { profile, error: profileError, forbidden } = await getActiveStaffProfile(client, authorization.session)
  if (profileError) return respond({ success: false, message: publicErrorMessage(profileError) }, 500)
  if (forbidden) return respond({ success: false, message: 'An active staff account is required.' }, 403)

  let payload
  try {
    payload = await request.json()
  } catch {
    return respond({ success: false, message: 'A message is required.' }, 400)
  }

  const body = typeof payload?.body === 'string' ? payload.body.trim() : ''
  if (!body || body.length > 2000) {
    return respond({ success: false, message: 'Enter a message between 1 and 2,000 characters.' }, 400)
  }

  const { data: staff, error: staffError } = await client
    .from('info_users')
    .select('id')
    .in('user_type', STAFF_DATABASE_ROLES)
    .eq('status', 'active')
  if (staffError) return respond({ success: false, message: publicErrorMessage(staffError) }, 500)

  const { data: savedMessage, error: saveError } = await client
    .from('staff_chat_messages')
    .insert({ sender_id: profile.id, body })
    .select('id, sender_id, body, created_at')
    .single()
  if (saveError) return respond({ success: false, message: publicErrorMessage(saveError) }, 500)

  const timestamp = new Date().toISOString()
  const notifications = (staff || [])
    .filter((member) => member.id !== profile.id)
    .map((member) => ({
      user_id: member.id,
      title: 'New staff chat message',
      message: `${profile.full_name || 'A staff member'} sent a message in Staff Chat.`,
      type: 'staff_chat',
      is_read: false,
      link: '/info/admin/staff-chat',
      actor_id: profile.id,
      created_at: timestamp,
      updated_at: timestamp,
    }))

  let notificationWarning = ''
  if (notifications.length) {
    const { error: notificationError } = await client.from('info_notifications').insert(notifications)
    if (notificationError) {
      console.error('Staff chat notification delivery failed:', notificationError)
      notificationWarning = 'Message sent, but staff notifications could not be delivered.'
    }
  }

  return respond({
    success: true,
    message: {
      ...savedMessage,
      sender: { id: profile.id, full_name: profile.full_name, user_type: profile.user_type },
    },
    notificationWarning,
  }, 201)
}
