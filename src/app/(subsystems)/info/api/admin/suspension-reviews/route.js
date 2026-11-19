import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' }
const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'modified', 'needs_information', 'cancelled']
const DECISIONS = ['uphold', 'lift', 'modify', 'request_info']

const REPORTED_CONTENT_TABLES = {
  content_comments: { select: 'id, body, content_type, content_id', label: 'Comment' },
  info_comments: { select: 'id, content, blog_id', label: 'Blog comment' },
  forum_replies: { select: 'id, content, thread_id', label: 'Forum reply' },
  forum_threads: { select: 'id, title, content', label: 'Forum topic' },
  info_blogs: { select: 'id, title, excerpt, content', label: 'Blog post' },
  info_user_posts: { select: 'id, title, content', label: 'Community post' },
}

function respond(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function getContentLink(tableName, item) {
  if (!item) return null
  if (tableName === 'content_comments') {
    const paths = {
      blog: '/info/user/blogs',
      event: '/info/user/events',
      forum_thread: '/info/user/forums',
      user_post: '/info/user/posts',
      announcement: '/info/user/announcements',
      tourist_spot: '/info/visitor/tourist-spots',
    }
    return paths[item.content_type] ? `${paths[item.content_type]}/${item.content_id}#comment-${item.id}` : null
  }
  if (tableName === 'info_comments') return `/info/user/blogs/${item.blog_id}#comment-${item.id}`
  if (tableName === 'forum_replies') return `/info/user/forums/${item.thread_id}#reply-${item.id}`
  if (tableName === 'forum_threads') return `/info/user/forums/${item.id}`
  if (tableName === 'info_blogs') return `/info/user/blogs/${item.id}`
  if (tableName === 'info_user_posts') return `/info/user/posts/${item.id}`
  return null
}

async function loadReportedContent(client, reports) {
  const groups = new Map()
  for (const report of reports) {
    const tableName = report.reported_item_table
    if (!REPORTED_CONTENT_TABLES[tableName] || !report.reported_item_id) continue
    if (!groups.has(tableName)) groups.set(tableName, new Set())
    groups.get(tableName).add(report.reported_item_id)
  }

  const contentByKey = new Map()
  await Promise.all([...groups.entries()].map(async ([tableName, ids]) => {
    const config = REPORTED_CONTENT_TABLES[tableName]
    const { data, error } = await client
      .from(tableName)
      .select(config.select)
      .in('id', [...ids])
    if (error) throw error
    for (const item of data || []) {
      contentByKey.set(`${tableName}:${item.id}`, {
        label: config.label,
        title: item.title || item.name || config.label,
        body: item.body || item.content || item.excerpt || '',
        href: getContentLink(tableName, item),
      })
    }
  }))

  return reports.map((report) => ({
    ...report,
    reported_content: contentByKey.get(`${report.reported_item_table}:${report.reported_item_id}`) || null,
  }))
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Suspension reviews are not configured.' }, 500)

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    if (status && !REVIEW_STATUSES.includes(status)) {
      return respond({ success: false, message: 'The requested review status is invalid.' }, 400)
    }

    let query = client.from('suspension_reviews').select(`
      id,
      user_id,
      ban_user_id,
      report_id,
      original_suspending_user_id,
      original_suspending_party,
      reason,
      original_duration_days,
      original_expires_at,
      suspended_at,
      created_at,
      status,
      moderation_notes,
      reviewed_by,
      reviewed_at,
      has_user_appeal,
      user_appeal_id,
      new_expires_at,
      updated_duration_days,
      updated_at
    `)
    if (status) query = query.eq('status', status)
    const { data: reviews, error } = await query.order('created_at', { ascending: false })
    if (error) throw error

    const rows = reviews || []
    if (!rows.length) return respond({ success: true, reviews: [] })

    const userIds = [...new Set(rows.map((review) => review.user_id).filter(Boolean))]
    const appealIds = [...new Set(rows.map((review) => review.user_appeal_id).filter(Boolean))]
    const reportIds = [...new Set(rows.map((review) => review.report_id).filter(Boolean))]
    const reviewIds = rows.map((review) => review.id)
    const staffIds = [...new Set(rows.flatMap((review) => [
      review.original_suspending_user_id,
      review.reviewed_by,
    ]).filter(Boolean))]

    const [usersResult, appealsResult, reportsResult, staffResult, historyResult, previousReviewsResult, warningsResult] = await Promise.all([
      client.from('info_users').select('id, email, full_name, profile_image_url, user_type, status, created_at').in('id', userIds),
      appealIds.length
        ? client.from('user_moderation_appeals').select('id, reason, status, created_at').in('id', appealIds)
        : Promise.resolve({ data: [], error: null }),
      reportIds.length
        ? client.from('info_moderation').select('id, reason, description, reported_item_id, reported_item_table, created_at, resolution').in('id', reportIds)
        : Promise.resolve({ data: [], error: null }),
      staffIds.length
        ? client.from('info_users').select('id, full_name, email').in('id', staffIds)
        : Promise.resolve({ data: [], error: null }),
      client.from('suspension_review_history').select('id, review_id, reviewer_id, decision, notes, account_status_after, recorded_at').in('review_id', reviewIds).order('recorded_at', { ascending: false }),
      client.from('suspension_reviews').select('id, user_id, reason, status, suspended_at, reviewed_at').in('user_id', userIds).order('created_at', { ascending: false }),
      client.from('user_warnings').select('id, user_id, reason, created_at').in('user_id', userIds).order('created_at', { ascending: false }),
    ])
    const failedResult = [usersResult, appealsResult, reportsResult, staffResult, historyResult, previousReviewsResult, warningsResult]
      .find((result) => result.error)
    if (failedResult) throw failedResult.error

    const reports = await loadReportedContent(client, reportsResult.data || [])
    const usersById = new Map((usersResult.data || []).map((user) => [user.id, user]))
    const staffById = new Map((staffResult.data || []).map((user) => [user.id, user]))
    const appealsById = new Map((appealsResult.data || []).map((appeal) => [appeal.id, appeal]))
    const reportsById = new Map(reports.map((report) => [report.id, report]))
    const historyByReview = new Map()
    for (const entry of historyResult.data || []) {
      if (!historyByReview.has(entry.review_id)) historyByReview.set(entry.review_id, [])
      historyByReview.get(entry.review_id).push({
        ...entry,
        reviewer: staffById.get(entry.reviewer_id) || null,
      })
    }
    const previousByUser = new Map()
    for (const previous of previousReviewsResult.data || []) {
      if (!previousByUser.has(previous.user_id)) previousByUser.set(previous.user_id, [])
      previousByUser.get(previous.user_id).push(previous)
    }
    const warningsByUser = new Map()
    for (const warning of warningsResult.data || []) {
      if (!warningsByUser.has(warning.user_id)) warningsByUser.set(warning.user_id, [])
      warningsByUser.get(warning.user_id).push(warning)
    }

    return respond({
      success: true,
      reviews: rows.map((review) => ({
        ...review,
        user_data: usersById.get(review.user_id) || null,
        original_suspending_user: staffById.get(review.original_suspending_user_id) || null,
        reviewing_staff: staffById.get(review.reviewed_by) || null,
        appeal: appealsById.get(review.user_appeal_id) || null,
        report: reportsById.get(review.report_id) || null,
        history: historyByReview.get(review.id) || [],
        previous_reviews: (previousByUser.get(review.user_id) || []).filter((item) => item.id !== review.id),
        previous_warnings: warningsByUser.get(review.user_id) || [],
      })),
    })
  } catch (error) {
    console.error('Suspension reviews load failed:', error)
    return respond({ success: false, message: 'Unable to load suspension reviews and case evidence.' }, 500)
  }
}

export async function POST(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Suspension reviews are not configured.' }, 500)

  try {
    let body
    try {
      body = await request.json()
    } catch {
      return respond({ success: false, message: 'A valid review decision is required.' }, 400)
    }

    const reviewId = typeof body?.reviewId === 'string' ? body.reviewId : ''
    const decision = typeof body?.decision === 'string' ? body.decision : ''
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
    const newDurationDays = body?.newDurationDays == null || body.newDurationDays === ''
      ? null
      : Number(body.newDurationDays)

    if (!isValidUuid(reviewId) || !DECISIONS.includes(decision)) {
      return respond({ success: false, message: 'A valid review ID and decision are required.' }, 400)
    }
    if (!notes || notes.length > 2000) {
      return respond({ success: false, message: 'A review note between 1 and 2,000 characters is required.' }, 400)
    }
    if (decision === 'modify' && (!Number.isInteger(newDurationDays) || newDurationDays < 1 || newDurationDays > 365)) {
      return respond({ success: false, message: 'Choose a revised suspension duration between 1 and 365 days.' }, 400)
    }
    if (decision !== 'modify' && newDurationDays !== null) {
      return respond({ success: false, message: 'A revised duration is only valid when modifying a suspension.' }, 400)
    }

    const { data, error } = await client.rpc('process_suspension_review', {
      p_review_id: reviewId,
      p_reviewer_id: authorization.session.user_id,
      p_decision: decision,
      p_notes: notes,
      p_new_duration_days: newDurationDays,
    })

    if (error) {
      console.error('Suspension review processing failed:', error)
      const conflict = /no longer available|no longer active|shorter than the original|original suspension record no longer exists|original suspending moderator/i.test(error.message || '')
      return respond({
        success: false,
        message: conflict ? error.message : 'Failed to process the review decision.',
      }, conflict ? 409 : 500)
    }

    return respond({ success: true, ...data })
  } catch (error) {
    console.error('Suspension review submission failed:', error)
    return respond({ success: false, message: 'Unable to submit the review decision.' }, 500)
  }
}
