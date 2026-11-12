import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { clientIp, consumeRateLimit } from '@/lib/rateLimit'
import { notifyAdministrators } from '@/lib/adminNotifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const REPORTED_TABLES = {
  content_comments: 'user_id',
  info_comments: 'user_id',
  forum_replies: 'user_id',
  forum_threads: 'created_by',
  info_blogs: 'created_by',
  info_events: 'created_by',
  info_user_posts: 'user_id',
  info_announcements: 'created_by',
  info_tourist_spots: 'created_by',
  attraction_ratings: 'user_id',
  reposts: 'user_id',
  info_users: 'id',
}

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

export async function POST(request) {
  const reporterId = getServerSession(request)?.user_id || null
  if (!reporterId) return respond({ success: false, message: 'Please sign in to submit a report.' }, 401)
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Report submission is not configured.' }, 500)

  const limit = await consumeRateLimit(client, { scope: 'report', key: reporterId, max: 20, windowSeconds: 3600 })
  if (!limit.allowed) {
    return respond({ success: false, message: limit.unavailable ? 'Reporting is temporarily unavailable.' : 'You have sent many reports recently. Please try again later.' }, limit.unavailable ? 503 : 429)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A report reason is required.' }, 400)
  }
  const tableName = String(body?.itemTable || '')
  const ownerColumn = REPORTED_TABLES[tableName]
  const itemId = String(body?.itemId || '').trim()
  const reason = String(body?.reason || '').trim()
  const description = String(body?.description || '').trim()
  if (!ownerColumn || !itemId || !reason || reason.length > 120 || description.length > 2000) {
    return respond({ success: false, message: 'Provide a valid report reason and content item.' }, 400)
  }

  const { data: item, error: itemError } = await client
    .from(tableName)
    .select(ownerColumn)
    .eq('id', itemId)
    .maybeSingle()
  if (itemError) {
    console.error('Report target lookup failed:', itemError.message)
    return respond({ success: false, message: 'Unable to verify the reported content.' }, 500)
  }
  if (!item) return respond({ success: false, message: 'The reported content could not be found.' }, 404)
  const reportedUserId = item[ownerColumn] || null
  if (reportedUserId === reporterId) return respond({ success: false, message: 'You cannot report your own content.' }, 400)
  const reportType = tableName === 'info_users'
    ? 'account'
    : String(body?.reportType || 'content').trim().slice(0, 60)

  const { data, error } = await client.from('info_moderation').insert({
    report_type: reportType,
    reason,
    description: description || null,
    severity: 'medium',
    reported_by: reporterId,
    reported_user_id: reportedUserId,
    reported_item_id: itemId,
    reported_item_table: tableName,
    status: 'pending',
  }).select('id').single()
  if (error) {
    console.error('Report submission failed:', error.message)
    return respond({ success: false, message: 'Unable to submit your report.' }, 500)
  }
  await notifyAdministrators(client, {
    title: tableName === 'info_users' ? 'User account reported' : 'Content reported',
    message: `New ${reportType} report requires review.`,
    type: 'warning',
    link: '/info/admin/moderation',
  })
  return respond({ success: true, reportId: data.id }, 201)
}
