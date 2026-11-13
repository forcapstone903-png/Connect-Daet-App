import sgMail from '@sendgrid/mail'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { getSettingsClient } from '@/lib/appSettingsServer'
import { isValidUuid } from '@/lib/uuid'
import { getEmailSender } from '@/lib/emailSettings'
import { notifyUserRecipients } from '@/lib/userNotificationDelivery.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Inquiries are read and answered here with the service role, because the
// table's RLS only admits is_admin() and Tourism Officers (feedback.manage)
// must be able to work the queue too.
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }
const STATUSES = ['open', 'in_progress', 'answered', 'reviewing', 'resolved', 'closed']

const respond = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'Feedback is not configured on the server.' }, 500)

  const { data, error } = await client
    .from('info_inquiries')
    .select('*, user:user_id (full_name, email)')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) {
    console.error('Admin inquiry list failed:', error)
    return respond({ success: false, message: 'Unable to load inquiries.' }, 500)
  }
  return respond({ success: true, items: data || [] })
}

// Body: { id, status?, response? } — a response marks the inquiry answered
// and notifies the visitor.
export async function PATCH(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'Feedback is not configured on the server.' }, 500)

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return respond({ success: false, message: 'Cross-origin requests are not allowed.' }, 403)
  }
  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A valid JSON request body is required.' }, 400)
  }

  const id = String(body?.id || '')
  const replyText = typeof body?.response === 'string' ? body.response.trim() : null
  const status = replyText ? 'answered' : String(body?.status || '')
  if (!isValidUuid(id)) return respond({ success: false, message: 'A valid inquiry is required.' }, 400)
  if (!STATUSES.includes(status)) return respond({ success: false, message: 'Choose a supported status.' }, 400)
  if (replyText !== null && (!replyText || replyText.length > 5000)) {
    return respond({ success: false, message: 'Responses must be 1 to 5,000 characters.' }, 400)
  }

  let inquiryLookup = await client
    .from('info_inquiries')
    .select('id, user_id, title, status, requester_name, requester_email')
    .eq('id', id)
    .maybeSingle()
  if (
    inquiryLookup.error
    && ['42703', 'PGRST204'].includes(inquiryLookup.error.code)
    && /requester_name|requester_email/i.test(inquiryLookup.error.message || '')
  ) {
    inquiryLookup = await client
      .from('info_inquiries')
      .select('id, user_id, title, status')
      .eq('id', id)
      .maybeSingle()
  }
  const { data: inquiry, error: lookupError } = inquiryLookup
  if (lookupError) {
    console.error('Inquiry lookup failed:', lookupError)
    return respond({ success: false, message: 'Unable to load this inquiry.' }, 500)
  }
  if (!inquiry) return respond({ success: false, message: 'Inquiry not found.' }, 404)

  const now = new Date().toISOString()
  const update = {
    status,
    updated_at: now,
    responded_by: session.user_id,
    responded_at: ['answered', 'closed', 'resolved'].includes(status) ? now : null,
    ...(replyText ? { admin_response: replyText } : {}),
  }
  const { error } = await client.from('info_inquiries').update(update).eq('id', id)
  if (error) {
    console.error('Inquiry update failed:', error)
    return respond({ success: false, message: 'Unable to save this inquiry.' }, 500)
  }

  const { error: auditError } = await client.from('info_audit_log').insert({
    user_id: session.user_id,
    action: replyText ? 'inquiry_answered' : 'inquiry_status_changed',
    table_name: 'info_inquiries',
    record_id: id,
    changes: { from: inquiry.status, to: status },
  })
  if (auditError) console.error('Inquiry audit failed:', auditError)

  let guestEmailSent
  if (replyText && inquiry.user_id) {
    await notifyUserRecipients(client, [{
      user_id: inquiry.user_id,
      title: 'The tourism office answered your inquiry',
      message: inquiry.title ? `Re: ${inquiry.title}` : 'Open Feedback to read the response.',
      type: 'info',
      link: '/info/user/feedback',
    }], 'Inquiry reply')
  } else if (replyText) {
    guestEmailSent = false
    if (inquiry.requester_email) {
      const sender = await getEmailSender()
      if (sender.configured) {
        sgMail.setApiKey(sender.apiKey)
        try {
          await sgMail.send({
            to: inquiry.requester_email,
            from: sender.from,
            replyTo: sender.replyTo,
            subject: 'The tourism office replied to your inquiry',
            text: `Hello ${inquiry.requester_name || 'there'},\n\n${replyText}\n\nRegarding: ${inquiry.title || 'your inquiry'}${sender.footerText}`,
          })
          guestEmailSent = true
        } catch (error) {
          console.error('Guest inquiry reply email failed:', {
            code: error.code || null,
            status: error.response?.statusCode || null,
          })
        }
      } else {
        console.error('Guest inquiry reply email is not configured.')
      }
    } else {
      console.error('Guest inquiry has no reply email address.')
    }
  }

  return respond({ success: true, ...(guestEmailSent === undefined ? {} : { emailSent: guestEmailSent }) })
}
