import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function isAuthorized(request) {
  const expected = process.env.CRON_SECRET?.trim() || ''
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (Buffer.byteLength(expected) < 32 || Buffer.byteLength(provided) !== Buffer.byteLength(expected)) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function GET(request) {
  if (!isAuthorized(request)) return respond({ success: false, message: 'Unauthorized.' }, 401)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return respond({ success: false, message: 'Scheduled messaging is not configured.' }, 500)
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: dueMessages, error: claimError } = await client.rpc('claim_due_admin_messages', { p_limit: 100 })
  if (claimError) {
    console.error('Scheduled admin messages claim failed:', claimError.message)
    return respond({ success: false, message: 'Unable to claim scheduled messages.' }, 500)
  }

  let delivered = 0
  let failed = 0
  for (const message of dueMessages || []) {
    const { error: notificationError } = await client.from('info_notifications').insert({
      user_id: message.recipient_user_id,
      admin_message_id: message.id,
      title: message.subject,
      message: message.body,
      type: String(message.category).toLowerCase() === 'alert' ? 'warning' : 'info',
      is_read: false,
    })

    const status = notificationError ? 'failed' : 'delivered'
    const { error: updateError } = await client
      .from('admin_messages')
      .update({
        status,
        sent_at: notificationError ? null : new Date().toISOString(),
        delivery_error: notificationError ? 'In-app inbox delivery failed.' : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', message.id)
      .eq('status', 'sending')
    if (updateError) {
      failed += 1
      console.error('Scheduled admin message status update failed:', {
        messageId: message.id,
        error: updateError.message,
      })
      continue
    }

    if (notificationError) {
      failed += 1
      console.error('Scheduled admin message inbox delivery failed:', {
        messageId: message.id,
        error: notificationError.message,
      })
    } else {
      delivered += 1
    }
  }

  return respond({ success: failed === 0, claimed: dueMessages?.length || 0, delivered, failed })
}
