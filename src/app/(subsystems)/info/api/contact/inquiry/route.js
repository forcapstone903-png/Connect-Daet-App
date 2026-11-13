import { getServiceClient, fail, json, readJsonBody } from '@/lib/alertsServer'
import { clientIp, consumeRateLimit } from '@/lib/rateLimit'
import { getServerSession } from '@/lib/serverAuth'
import { notifyAdministrators, notifyTourismOfficers } from '@/lib/adminNotifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request) {
  const client = getServiceClient()
  if (!client) return fail(500, 'Inquiries are not configured on the server.')

  const limit = await consumeRateLimit(client, {
    scope: 'public-inquiry',
    key: clientIp(request),
    max: 5,
    windowSeconds: 3600,
  })
  if (!limit.allowed) return fail(limit.unavailable ? 503 : 429, 'Too many requests. Please try again later.')

  if (Number(request.headers.get('content-length')) > 12_000) {
    return fail(413, 'Your inquiry is too large to submit.')
  }
  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'A valid inquiry is required.')
  }
  if (typeof body.website === 'string' && body.website.trim()) {
    return fail(400, 'Your inquiry could not be submitted.')
  }

  const requesterName = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  const requesterEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!requesterName || requesterName.length > 100) {
    return fail(400, 'Enter your name using 1 to 100 characters.')
  }
  if (requesterEmail.length > 254 || !EMAIL_PATTERN.test(requesterEmail)) {
    return fail(400, 'Enter a valid email address.')
  }
  if (!title || title.length > 150) {
    return fail(400, 'Enter a subject using 1 to 150 characters.')
  }
  if (!message || message.length > 5000) {
    return fail(400, 'Your message must be between 1 and 5,000 characters.')
  }

  const userId = getServerSession(request)?.user_id || null
  try {
    const { data, error } = await client
      .from('info_inquiries')
      .insert({
        user_id: userId,
        requester_name: requesterName,
        requester_email: requesterEmail,
        title,
        message,
        category: 'inquiry',
        status: 'open',
      })
      .select('id')
      .single()

    if (error) throw error

    const inquiryNotification = {
      actorId: userId,
      title: 'New tourism office inquiry',
      message: userId
        ? `Submitted an inquiry: ${title}`
        : `${requesterName} submitted an inquiry: ${title}`,
      type: 'info',
      link: `/info/admin/feedback?inquiry=${encodeURIComponent(data.id)}`,
    }
    await Promise.all([
      notifyAdministrators(client, inquiryNotification),
      notifyTourismOfficers(client, inquiryNotification),
    ])

    return json({ success: true, id: data.id }, 201)
  } catch (error) {
    console.error('Public inquiry submission failed:', { code: error?.code || null })
    const errorMessage = String(error?.message || '')
    const missingGuestInquirySchema = (
      ['42703', 'PGRST204'].includes(error?.code)
      && /requester_name|requester_email/i.test(errorMessage)
    ) || (
      error?.code === '23502'
      && /user_id/i.test(errorMessage)
    )
    if (missingGuestInquirySchema) {
      return fail(503, 'Guest inquiries are not enabled in the database yet. Apply migration 113_allow_guest_inquiries.sql.')
    }
    return fail(500, 'Unable to send your inquiry right now. Please try again later.')
  }
}
