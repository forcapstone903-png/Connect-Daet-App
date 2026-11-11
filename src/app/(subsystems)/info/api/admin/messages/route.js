import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

async function fetchActiveUsers(client, columns = 'id, full_name, email, user_type') {
  const users = []
  let total = null
  for (let from = 0; from < 5000; from += 1000) {
    const { data, count, error } = await client
      .from('info_users')
      .select(columns, { count: from === 0 ? 'exact' : undefined })
      .eq('status', 'active')
      .order('full_name')
      .order('id')
      .range(from, Math.min(from + 999, 4999))
    if (error) return { users: null, error, tooMany: false }
    if (from === 0) total = count || 0
    users.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return { users, error: null, tooMany: (total || 0) > 5000 }
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Messaging is not configured.' }, 500)

  const [{ users, error: usersError }, { data: messages, error: messagesError }] = await Promise.all([
    fetchActiveUsers(client),
    client.from('admin_messages')
      .select('id, sender_user_id, recipient_user_id, subject, category, body, scheduled_for, status, delivery_error, sent_at, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
  ])
  if (usersError || messagesError) {
    console.error('Admin messaging load failed:', usersError?.message || messagesError?.message)
    return respond({ success: false, message: 'Unable to load message data.' }, 500)
  }

  const userById = new Map((users || []).map((user) => [user.id, user]))
  const messageRows = (messages || []).map((message) => ({
    ...message,
    recipient: userById.get(message.recipient_user_id) || null,
  }))
  return respond({ success: true, users: users || [], messages: messageRows })
}

export async function POST(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Messaging is not configured.' }, 500)

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A message is required.' }, 400)
  }
  const subject = String(body?.subject || '').trim()
  const messageBody = String(body?.body || '').trim()
  const category = String(body?.category || 'Announcement').trim()
  const scheduleValue = String(body?.scheduleAt || '').trim()
  const replyToId = String(body?.replyToId || '').trim()
  if (!subject || !messageBody || subject.length > 180 || messageBody.length > 10000) {
    return respond({ success: false, message: 'Enter a subject and message within the allowed length.' }, 400)
  }

  let recipientIds = []
  if (replyToId) {
    const { data: original, error } = await client
      .from('admin_messages')
      .select('recipient_user_id')
      .eq('id', replyToId)
      .maybeSingle()
    if (error) return respond({ success: false, message: 'Unable to load the message being replied to.' }, 500)
    if (!original) return respond({ success: false, message: 'The original message was not found.' }, 404)
    recipientIds = [original.recipient_user_id]
  } else if (body?.allRecipients === true) {
    const result = await fetchActiveUsers(client, 'id')
    if (result.error) return respond({ success: false, message: 'Unable to load active recipients.' }, 500)
    if (result.tooMany) return respond({ success: false, message: 'The current recipient count exceeds the safe message limit of 5,000.' }, 413)
    recipientIds = (result.users || []).map((user) => user.id)
  } else if (Array.isArray(body?.recipientIds)) {
    recipientIds = [...new Set(body.recipientIds.map((id) => String(id).trim()).filter(Boolean))]
  }
  recipientIds = recipientIds.filter((id) => id !== authorization.session.user_id)
  if (!recipientIds.length) return respond({ success: false, message: 'Select at least one recipient.' }, 400)
  if (recipientIds.length > 5000) return respond({ success: false, message: 'A message can have at most 5,000 recipients.' }, 400)

  const { data: recipients, error: recipientError } = await client
    .from('info_users')
    .select('id')
    .in('id', recipientIds)
    .eq('status', 'active')
  if (recipientError) return respond({ success: false, message: 'Unable to validate message recipients.' }, 500)
  const validIds = new Set((recipients || []).map((recipient) => recipient.id))
  if (validIds.size !== recipientIds.length) {
    return respond({ success: false, message: 'One or more recipients are unavailable.' }, 400)
  }

  const scheduledFor = scheduleValue ? new Date(scheduleValue) : null
  if (scheduleValue && (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now())) {
    return respond({ success: false, message: 'Choose a future delivery time.' }, 400)
  }
  const scheduled = Boolean(scheduledFor)
  const now = new Date().toISOString()
  const records = recipientIds.map((recipient_user_id) => ({
    sender_user_id: authorization.session.user_id,
    recipient_user_id,
    subject: replyToId && !/^re:/i.test(subject) ? `Re: ${subject}` : subject,
    category,
    body: messageBody,
    scheduled_for: scheduledFor?.toISOString() || null,
    status: scheduled ? 'scheduled' : 'delivered',
    sent_at: scheduled ? null : now,
  }))

  const { data: saved, error: saveError } = await client
    .from('admin_messages')
    .insert(records)
    .select('id, recipient_user_id, subject, category, body, scheduled_for, status, sent_at, created_at')
  if (saveError) {
    console.error('Admin message save failed:', saveError.message)
    return respond({ success: false, message: 'Unable to save the message.' }, 500)
  }

  if (!scheduled) {
    const notifications = saved.map((message) => ({
      user_id: message.recipient_user_id,
      admin_message_id: message.id,
      title: message.subject,
      message: message.body,
      type: category.toLowerCase() === 'alert' ? 'warning' : 'info',
      is_read: false,
    }))
    const { error: notificationError } = await client.from('info_notifications').insert(notifications)
    if (notificationError) {
      console.error('Admin message inbox delivery failed:', notificationError.message)
      const { error: statusError } = await client
        .from('admin_messages')
        .update({
          status: 'failed',
          delivery_error: 'In-app inbox delivery failed.',
          updated_at: new Date().toISOString(),
        })
        .in('id', saved.map((message) => message.id))
      if (statusError) console.error('Admin message failure status update failed:', statusError.message)
      return respond({ success: false, message: 'The message could not be delivered to recipient inboxes.' }, 500)
    }
  }

  return respond({
    success: true,
    scheduled,
    recipientCount: saved.length,
    message: scheduled
      ? `Message scheduled for ${scheduledFor.toLocaleString()}.`
      : `Message delivered to ${saved.length} recipient inbox${saved.length === 1 ? '' : 'es'}.`,
  }, 201)
}
