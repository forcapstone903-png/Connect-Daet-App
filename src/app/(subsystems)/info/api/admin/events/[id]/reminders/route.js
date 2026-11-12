import sgMail from '@sendgrid/mail'
import { getEmailSender } from '@/lib/emailSettings'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

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

export async function POST(request, { params }) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Event reminders are not configured.' }, 500)
  const eventId = (await params)?.id
  if (!eventId) return respond({ success: false, message: 'An event is required.' }, 400)

  const [{ data: event, error: eventError }, { data: registrations, count: registrationCount, error: registrationError }] = await Promise.all([
    client.from('info_events').select('id, title, start_date, start_time, location').eq('id', eventId).maybeSingle(),
    client
      .from('event_registrations')
      .select('id, event_id, user_id, info_users(id, full_name, email)', { count: 'exact' })
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .limit(1000),
  ])
  if (eventError || registrationError) {
    return respond({ success: false, message: 'Unable to load event and attendee details.' }, 500)
  }
  if (!event) return respond({ success: false, message: 'Event not found.' }, 404)
  if ((registrationCount || 0) > 1000) {
    return respond({ success: false, message: 'This event has more than 1,000 confirmed registrations. Contact support to arrange a safe bulk delivery.' }, 413)
  }
  const attendees = registrations || []
  if (!attendees.length) return respond({ success: true, sent: 0, failed: 0, message: 'There are no confirmed attendees.' })

  const sender = await getEmailSender()
  if (!sender.settings.event_reminder_emails_enabled) {
    return respond({ success: false, message: 'Event reminder emails are turned off in Settings → Email.' }, 409)
  }
  const send = async (registration) => {
    if (!registration.info_users?.email) return { status: 'failed', error: 'No email address is associated with this attendee.' }
    if (!sender.configured) return { status: 'not_configured', error: 'Email delivery is not configured.' }
    const user = registration.info_users
    const dateTime = [event.start_date, event.start_time].filter(Boolean).join(' ')
    sgMail.setApiKey(sender.apiKey)
    try {
      await sgMail.send({
        to: user.email,
        from: sender.from,
        replyTo: sender.replyTo,
        subject: `Reminder: ${event.title}`,
        text: `Hello ${user.full_name || 'there'},\n\nThis is a reminder about "${event.title}".\n${dateTime ? `Date and time: ${dateTime}\n` : ''}${event.location ? `Location: ${event.location}\n` : ''}\nWe look forward to seeing you.${sender.footerText}`,
      })
      return { status: 'sent', error: null }
    } catch (error) {
      console.error('Event reminder email delivery failed:', {
        eventId,
        registrationId: registration.id,
        code: error.code || null,
        status: error.response?.statusCode || null,
      })
      return { status: 'failed', error: 'The email provider rejected the reminder.' }
    }
  }

  const results = []
  for (let index = 0; index < attendees.length; index += 10) {
    const batch = await Promise.all(attendees.slice(index, index + 10).map(async (registration) => ({
      registration,
      delivery: await send(registration),
    })))
    results.push(...batch)
  }
  const logs = results.map(({ registration, delivery }) => ({
    event_id: event.id,
    registration_id: registration.id,
    recipient_user_id: registration.user_id,
    sent_by: authorization.session.user_id,
    status: delivery.status,
    error_message: delivery.error,
    sent_at: delivery.status === 'sent' ? new Date().toISOString() : null,
  }))
  const { error: logError } = await client.from('event_reminder_deliveries').insert(logs)
  if (logError) {
    console.error('Event reminder delivery log insert failed:', logError.message)
    return respond({
      success: false,
      sent: results.filter(({ delivery }) => delivery.status === 'sent').length,
      failed: results.filter(({ delivery }) => delivery.status !== 'sent').length,
      message: 'Email attempts completed, but delivery results could not be saved to the database.',
    }, 500)
  }

  const sent = results.filter(({ delivery }) => delivery.status === 'sent').length
  const failed = results.length - sent
  return respond({
    success: failed === 0,
    sent,
    failed,
    message: failed
      ? `${sent} reminder${sent === 1 ? '' : 's'} sent; ${failed} could not be delivered.`
      : `${sent} reminder${sent === 1 ? '' : 's'} sent.`,
  }, failed ? 207 : 200)
}
