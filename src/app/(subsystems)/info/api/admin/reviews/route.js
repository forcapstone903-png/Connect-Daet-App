import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { getSettingsClient } from '@/lib/appSettingsServer'
import { decodeReviewText } from '@/lib/reviewText'
import { createPdfBuffer, createWorkbookBuffer } from '@/lib/reportExport'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }
const PAGE_SIZE = 50
const EXPORT_LIMIT = 5000

const respond = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

async function readBody(request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return { error: respond({ success: false, message: 'Cross-origin requests are not allowed.' }, 403) }
  }
  try {
    return { body: await request.json() }
  } catch {
    return { error: respond({ success: false, message: 'A valid JSON request body is required.' }, 400) }
  }
}

function applyFilters(query, params) {
  const spotId = params.get('spotId')
  const rating = Number(params.get('rating'))
  const reply = params.get('reply')
  let filtered = query.eq('attraction_type', 'tourist_spot')
  if (spotId && isValidUuid(spotId)) filtered = filtered.eq('attraction_id', spotId)
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) filtered = filtered.eq('rating', rating)
  if (reply === 'answered') filtered = filtered.not('office_reply', 'is', null)
  if (reply === 'unanswered') filtered = filtered.is('office_reply', null)
  return filtered
}

async function loadNames(client, reviews) {
  const spotIds = [...new Set(reviews.map((review) => review.attraction_id))]
  const userIds = [...new Set(reviews.flatMap((review) => [review.user_id, review.office_reply_by]).filter(Boolean))]
  const [spots, users] = await Promise.all([
    spotIds.length
      ? client.from('info_tourist_spots').select('id, name, listing_type').in('id', spotIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? client.from('info_users').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (spots.error) throw spots.error
  if (users.error) throw users.error
  return {
    spots: new Map((spots.data || []).map((spot) => [spot.id, spot])),
    users: new Map((users.data || []).map((user) => [user.id, user])),
  }
}

function shapeReview(review, names) {
  const text = decodeReviewText(review.review_text || '')
  const reviewer = names.users.get(review.user_id)
  const replier = names.users.get(review.office_reply_by)
  return {
    id: review.id,
    spotId: review.attraction_id,
    spotName: names.spots.get(review.attraction_id)?.name || 'Removed listing',
    listingType: names.spots.get(review.attraction_id)?.listing_type || null,
    rating: review.rating,
    title: text.title,
    body: text.body,
    reviewer: reviewer?.full_name || 'Visitor',
    createdAt: review.created_at,
    updatedAt: review.updated_at,
    officeReply: review.office_reply,
    officeReplyAt: review.office_reply_at,
    officeReplyBy: replier?.full_name || replier?.email || null,
  }
}

function summarize(reviews) {
  const bySpot = new Map()
  for (const review of reviews) {
    const entry = bySpot.get(review.spotId) || {
      spotId: review.spotId, spotName: review.spotName, count: 0, total: 0, answered: 0, stars: [0, 0, 0, 0, 0],
    }
    entry.count += 1
    entry.total += review.rating
    entry.stars[review.rating - 1] += 1
    if (review.officeReply) entry.answered += 1
    bySpot.set(review.spotId, entry)
  }
  return [...bySpot.values()]
    .map((entry) => ({ ...entry, average: Math.round((entry.total / entry.count) * 100) / 100 }))
    .sort((a, b) => b.count - a.count)
}

async function buildExport(client, params, format) {
  const { data, error } = await applyFilters(
    client.from('attraction_ratings')
      .select('id, user_id, attraction_id, rating, review_text, created_at, updated_at, office_reply, office_reply_by, office_reply_at'),
    params
  ).order('created_at', { ascending: false }).limit(EXPORT_LIMIT)
  if (error) throw error
  const names = await loadNames(client, data || [])
  const reviews = (data || []).map((review) => shapeReview(review, names))

  const [inquiries, feedback] = await Promise.all([
    client.from('info_inquiries').select('category, status').limit(EXPORT_LIMIT),
    client.from('info_feedback').select('rating, created_at').limit(EXPORT_LIMIT),
  ])
  if (inquiries.error) throw inquiries.error
  if (feedback.error) throw feedback.error

  const inquiryCounts = new Map()
  for (const row of inquiries.data || []) {
    const key = `${row.category || 'general'}|${row.status || 'open'}`
    inquiryCounts.set(key, (inquiryCounts.get(key) || 0) + 1)
  }
  const feedbackRatings = (feedback.data || []).map((row) => Number(row.rating)).filter((value) => value >= 1 && value <= 5)

  const tables = [
    {
      name: 'Summary',
      headers: ['Metric', 'Value'],
      rows: [
        ['Generated at (UTC)', new Date().toISOString()],
        ['Reviews', reviews.length],
        ['Average review rating', reviews.length ? (reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length).toFixed(2) : 0],
        ['Reviews answered by the office', reviews.filter((item) => item.officeReply).length],
        ['Feedback entries', feedback.data?.length || 0],
        ['Average feedback rating', feedbackRatings.length ? (feedbackRatings.reduce((a, b) => a + b, 0) / feedbackRatings.length).toFixed(2) : 'n/a'],
        ['Inquiries', inquiries.data?.length || 0],
      ],
    },
    {
      name: 'Reviews by listing',
      headers: ['Listing', 'Reviews', 'Average', '5★', '4★', '3★', '2★', '1★', 'Answered'],
      rows: summarize(reviews).map((entry) => [
        entry.spotName, entry.count, entry.average, ...[...entry.stars].reverse(), entry.answered,
      ]),
    },
    {
      name: 'Reviews',
      headers: ['Date (UTC)', 'Listing', 'Rating', 'Reviewer', 'Title', 'Review', 'Office reply'],
      rows: reviews.map((item) => [
        item.createdAt?.slice(0, 10), item.spotName, item.rating, item.reviewer, item.title, item.body, item.officeReply || '',
      ]),
    },
    {
      name: 'Inquiries by status',
      headers: ['Category', 'Status', 'Count'],
      rows: [...inquiryCounts.entries()].map(([key, count]) => [...key.split('|'), count]),
    },
  ]

  const date = new Date().toISOString().slice(0, 10)
  if (format === 'xlsx') {
    return {
      body: await createWorkbookBuffer(tables, { creator: 'Connect Daet Feedback' }),
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `connect-daet-feedback-summary-${date}.xlsx`,
    }
  }
  return {
    body: await createPdfBuffer({
      title: 'Connect Daet - Feedback Summary',
      subtitle: `Reviews, feedback and inquiries | Generated ${date}`,
      tables: tables.map((table) => (table.name === 'Reviews'
        ? { ...table, rows: table.rows.slice(0, 300) }
        : table)),
    }),
    type: 'application/pdf',
    filename: `connect-daet-feedback-summary-${date}.pdf`,
  }
}

// List reviews (filters: spotId, rating, reply=answered|unanswered, page) or
// export a feedback summary (format=xlsx|pdf).
export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'Reviews are not configured on the server.' }, 500)

  const params = new URL(request.url).searchParams
  const format = params.get('format')
  if (format && !['xlsx', 'pdf'].includes(format)) return respond({ success: false, message: 'Choose xlsx or pdf.' }, 400)

  try {
    if (format) {
      const file = await buildExport(client, params, format)
      return new NextResponse(file.body, {
        headers: { ...NO_STORE, 'Content-Type': file.type, 'Content-Disposition': `attachment; filename="${file.filename}"` },
      })
    }

    const page = Math.max(1, Number(params.get('page')) || 1)
    const start = (page - 1) * PAGE_SIZE
    const [{ data, count, error }, spotsResult, pendingResult] = await Promise.all([
      applyFilters(
        client.from('attraction_ratings')
          .select('id, user_id, attraction_id, rating, review_text, created_at, updated_at, office_reply, office_reply_by, office_reply_at', { count: 'exact' }),
        params
      ).order('created_at', { ascending: false }).range(start, start + PAGE_SIZE - 1),
      client.from('info_tourist_spots').select('id, name, listing_type').order('name').limit(1000),
      client.from('attraction_ratings').select('id', { count: 'exact', head: true })
        .eq('attraction_type', 'tourist_spot').is('office_reply', null),
    ])
    if (error) throw error
    if (spotsResult.error) throw spotsResult.error

    const names = await loadNames(client, data || [])
    return respond({
      success: true,
      reviews: (data || []).map((review) => shapeReview(review, names)),
      listings: spotsResult.data || [],
      pagination: { page, pageSize: PAGE_SIZE, total: count || 0, pages: Math.ceil((count || 0) / PAGE_SIZE) },
      unansweredCount: pendingResult.error ? null : pendingResult.count || 0,
    })
  } catch (error) {
    console.error('Admin reviews load failed:', error)
    const migration = /office_reply/.test(String(error?.message || ''))
    return respond({
      success: false,
      message: migration ? 'Review replies need database migration 102.' : 'Unable to load reviews right now.',
    }, 500)
  }
}

// Reply as the tourism office, edit the reply, or remove it (reply: '').
export async function PATCH(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'Reviews are not configured on the server.' }, 500)

  const { body, error: bodyError } = await readBody(request)
  if (bodyError) return bodyError

  const reviewId = String(body?.reviewId || '')
  const reply = typeof body?.reply === 'string' ? body.reply.trim() : null
  if (!isValidUuid(reviewId) || reply === null) return respond({ success: false, message: 'A review and reply are required.' }, 400)
  if (reply.length > 2000) return respond({ success: false, message: 'Replies are limited to 2,000 characters.' }, 400)

  const { data: review, error: reviewError } = await client
    .from('attraction_ratings')
    .select('id, user_id, attraction_id, office_reply')
    .eq('id', reviewId)
    .maybeSingle()
  if (reviewError) {
    console.error('Review lookup failed:', reviewError)
    return respond({ success: false, message: 'Unable to load this review.' }, 500)
  }
  if (!review) return respond({ success: false, message: 'Review not found.' }, 404)

  const now = new Date().toISOString()
  const update = reply
    ? { office_reply: reply, office_reply_by: session.user_id, office_reply_at: now }
    : { office_reply: null, office_reply_by: null, office_reply_at: null }
  const { error } = await client.from('attraction_ratings').update(update).eq('id', reviewId)
  if (error) {
    console.error('Review reply save failed:', error)
    return respond({ success: false, message: 'Unable to save the reply.' }, 500)
  }

  const action = !reply ? 'review_reply_removed' : review.office_reply ? 'review_reply_edited' : 'review_replied'
  const { error: auditError } = await client.from('info_audit_log').insert({
    user_id: session.user_id,
    action,
    table_name: 'attraction_ratings',
    record_id: reviewId,
    changes: { spot_id: review.attraction_id, length: reply.length },
  })
  if (auditError) console.error('Review reply audit failed:', auditError)

  if (reply && !review.office_reply) {
    const { error: noticeError } = await client.from('info_notifications').insert({
      user_id: review.user_id,
      title: 'The tourism office replied to your review',
      message: reply.length > 200 ? `${reply.slice(0, 197)}...` : reply,
      type: 'info',
      is_read: false,
      link: `/info/visitor/tourist-spots/${review.attraction_id}`,
    })
    if (noticeError) console.error('Review reply notification failed:', noticeError)
  }

  return respond({ success: true, reply: reply || null, repliedAt: reply ? now : null })
}
