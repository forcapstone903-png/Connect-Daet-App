import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  sendAccountWarningEmail,
  sendAccountReviewPendingEmail,
  sendAppealMoreInformationEmail,
  sendModerationAppealDecisionEmail,
  sendPermanentBanEmail,
  sendRestrictionLiftedEmail,
  sendSuspensionDurationChangedEmail,
  sendSuspensionEmail,
  sendSuspensionExpirationNoticeEmail,
} from '@/lib/moderatorReviewEmail'

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

async function deliverModerationEmail(email, eventType, payload) {
  switch (eventType) {
    case 'account_review_pending':
      return sendAccountReviewPendingEmail(email, payload)
    case 'account_warning':
      return sendAccountWarningEmail(email, payload)
    case 'account_suspension':
      return sendSuspensionEmail(email, payload)
    case 'account_suspension_lifted':
      return sendRestrictionLiftedEmail(email, { banType: 'suspension' })
    case 'account_suspension_expired_restricted':
      return sendSuspensionExpirationNoticeEmail(email, payload)
    case 'account_suspension_duration_changed':
      return sendSuspensionDurationChangedEmail(email, payload)
    case 'permanent_ban':
      return sendPermanentBanEmail(email, payload)
    case 'permanent_ban_reversed':
      return sendRestrictionLiftedEmail(email, { banType: 'permanent' })
    case 'appeal_decision':
      return sendModerationAppealDecisionEmail(email, payload)
    case 'appeal_more_information':
      return sendAppealMoreInformationEmail(email, payload)
    default:
      throw new Error(`Unsupported moderation email event: ${eventType}`)
  }
}

async function deliverOutbox(client) {
  const { data: messages, error } = await client.rpc('claim_moderation_email_outbox', { p_limit: 50 })
  if (error) throw error

  let sent = 0
  let failed = 0
  let stateErrors = 0
  for (const message of messages || []) {
    let delivery = { sent: false, reason: 'missing_recipient' }
    try {
      delivery = await deliverModerationEmail(
        message.recipient_email,
        message.event_type,
        message.payload || {},
      )
    } catch (deliveryError) {
      console.error('Moderation email delivery failed:', {
        eventType: message.event_type,
        outboxId: message.outbox_id,
        code: deliveryError.code || null,
      })
      delivery = { sent: false, reason: 'delivery_failed' }
    }

    const { error: finishError } = await client.rpc('finish_moderation_email_outbox', {
      p_outbox_id: message.outbox_id,
      p_sent: delivery.sent === true,
      p_error: delivery.sent ? null : delivery.reason || 'delivery_failed',
    })
    if (finishError) {
      stateErrors += 1
      console.error('Moderation email outbox state update failed:', {
        outboxId: message.outbox_id,
        code: finishError.code || null,
      })
      continue
    }
    if (delivery.sent) sent += 1
    else failed += 1
  }

  return { claimed: messages?.length || 0, sent, failed, stateErrors }
}

export async function GET(request) {
  if (!isAuthorized(request)) return respond({ success: false, message: 'Unauthorized.' }, 401)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    console.error('Moderation lifecycle job is not configured.')
    return respond({ success: false, message: 'Moderation lifecycle job is not configured.' }, 503)
  }

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  try {
    const { data: administratorExpirations, error: administratorExpirationError } = await client.rpc(
      'process_expired_admin_suspensions',
      { p_limit: 100 },
    )
    if (administratorExpirationError) throw administratorExpirationError
    const { data: expiration, error: expirationError } = await client.rpc(
      'process_expired_account_suspensions',
      { p_limit: 100 },
    )
    if (expirationError) throw expirationError
    const email = await deliverOutbox(client)
    return respond({
      success: email.stateErrors === 0,
      administratorExpirations,
      expiration,
      email,
    }, email.stateErrors === 0 ? 200 : 500)
  } catch (error) {
    console.error('Moderation lifecycle job failed:', {
      code: error.code || null,
      status: error.status || null,
    })
    return respond({ success: false, message: 'Moderation lifecycle job failed.' }, 500)
  }
}
