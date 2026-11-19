import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { isValidUuid } from '@/lib/uuid'
import { normalizeProfanityTerms } from '@/lib/profanityFilter.mjs'
import { revokeUserSessions } from '@/lib/sessionVersions'
import { publicErrorMessage } from '@/lib/publicError'
import {
  notifyBlogAuthorsOfUnpublish,
  notifyContentAuthorOfDeletion,
} from '@/lib/contentDeletionNotifications.mjs'
import { decodeReviewText } from '@/lib/reviewText'
import { notifyUserRecipients } from '@/lib/userNotificationDelivery.mjs'
import { notifyAdministrators } from '@/lib/adminNotifications'
import {
  sendRestrictionLiftedEmail,
} from '@/lib/moderatorReviewEmail'
import { signModerationAppealEvidence } from '@/lib/moderationAppealEvidence.mjs'

const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST205'])
const BAN_TYPES = ['posting', 'suspension', 'permanent']

function normalizeStaffRole(role) {
  const normalized = String(role || '').trim().toLowerCase()
  return normalized === 'super_admin' || normalized === 'administrator' ? 'admin' : normalized
}

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

function getOwnedReviewPhotoPath(url, userId) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url || !userId || !supabaseUrl) return ''

  try {
    const photoUrl = new URL(url)
    if (photoUrl.origin !== new URL(supabaseUrl).origin) return ''
    const marker = '/storage/v1/object/public/profile-media/'
    const markerIndex = photoUrl.pathname.indexOf(marker)
    if (markerIndex < 0) return ''
    const objectPath = decodeURIComponent(photoUrl.pathname.slice(markerIndex + marker.length))
    return objectPath.startsWith(`reviews/${userId}/`) ? objectPath : ''
  } catch {
    return ''
  }
}

const REPORTED_CONTENT_TABLES = {
  content_comments: { select: 'id, body, content_type, content_id', label: 'Comment' },
  info_comments: { select: 'id, content, blog_id', label: 'Blog comment' },
  forum_replies: { select: 'id, content, thread_id', label: 'Forum reply' },
  forum_threads: { select: 'id, title, content', label: 'Forum topic' },
  info_blogs: { select: 'id, title, excerpt, content', label: 'Blog post' },
  info_events: { select: 'id, title, description', label: 'Event' },
  info_user_posts: { select: 'id, title, content', label: 'Community post' },
  info_announcements: { select: 'id, title, content', label: 'Announcement' },
  info_tourist_spots: { select: 'id, name, description', label: 'Tourist spot' },
  attraction_ratings: { select: 'id, user_id, attraction_type, attraction_id, rating, review_text, pros, cons, photo_url', label: 'Visitor review' },
  reposts: { select: 'id, original_content_type, original_content_id, quote_text', label: 'Repost' },
  info_users: { select: 'id, full_name, user_type', label: 'User account' },
}

const REPOST_ORIGINAL_TABLES = {
  blog: { table: 'info_blogs', select: 'id, title, excerpt, content' },
  event: { table: 'info_events', select: 'id, title, description' },
  forum_thread: { table: 'forum_threads', select: 'id, title, content' },
  announcement: { table: 'info_announcements', select: 'id, title, content' },
  user_post: { table: 'info_user_posts', select: 'id, title, content' },
}

const HIDE_UPDATES = {
  info_blogs: { status: 'draft', published_at: null },
  info_user_posts: { status: 'flagged' },
  forum_threads: { status: 'archived' },
  forum_replies: { status: 'hidden' },
  content_comments: { status: 'hidden' },
  info_comments: { status: 'rejected' },
  reposts: { status: 'archived' },
}

const DELETABLE_CONTENT = {
  info_user_posts: { authorColumn: 'user_id', titleColumn: 'title', contentType: 'community post' },
  forum_threads: { authorColumn: 'created_by', titleColumn: 'title', contentType: 'forum topic' },
  forum_replies: { authorColumn: 'user_id', titleColumn: 'content', contentType: 'forum reply' },
  content_comments: { authorColumn: 'user_id', titleColumn: 'body', contentType: 'comment' },
  info_comments: { authorColumn: 'user_id', titleColumn: 'content', contentType: 'blog comment' },
  reposts: { authorColumn: 'user_id', titleColumn: 'quote_text', contentType: 'repost' },
  attraction_ratings: { authorColumn: 'user_id', titleColumn: 'review_text', contentType: 'visitor review' },
}
const DELETABLE_TABLES = new Set(Object.keys(DELETABLE_CONTENT))

function getContentLink(tableName, item) {
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
  if (tableName === 'info_events') return `/info/user/events/${item.id}`
  if (tableName === 'info_user_posts') return `/info/user/posts/${item.id}`
  if (tableName === 'info_announcements') return `/info/user/announcements/${item.id}`
  if (tableName === 'info_tourist_spots') return `/info/visitor/tourist-spots/${item.id}`
  if (tableName === 'attraction_ratings') {
    const path = item.attraction_type === 'event' ? '/info/visitor/events' : '/info/visitor/tourist-spots'
    return `${path}/${item.attraction_id}#reviews`
  }
  if (tableName === 'info_users') return `/info/user/profile/${item.id}`
  if (tableName === 'reposts') {
    const paths = {
      blog: '/info/user/blogs',
      event: '/info/user/events',
      forum_thread: '/info/user/forums',
      announcement: '/info/user/announcements',
      user_post: '/info/user/posts',
    }
    return paths[item.original_content_type]
      ? `${paths[item.original_content_type]}/${item.original_content_id}`
      : null
  }
  return null
}

function mapReportedContent(tableName, item, originalContent = null) {
  if (!item) return null
  const config = REPORTED_CONTENT_TABLES[tableName]
  if (!config) return null
  const review = tableName === 'attraction_ratings' ? decodeReviewText(item.review_text || '') : null
  const title = tableName === 'content_comments'
    ? `Comment on ${item.content_type || 'content'}`
    : tableName === 'info_comments'
      ? 'Blog comment'
      : tableName === 'forum_replies'
        ? 'Forum reply'
        : tableName === 'reposts'
        ? `Repost: ${originalContent?.title || originalContent?.name || item.original_content_type || 'content'}`
          : tableName === 'attraction_ratings'
            ? review.title || `${item.rating}-star ${item.attraction_type === 'event' ? 'event' : 'tourist spot'} review`
            : tableName === 'info_users'
              ? item.full_name || config.label
              : item.title || item.name || config.label
  const body = review?.body || item.body || item.content || item.description || item.excerpt || item.quote_text
    || (tableName === 'attraction_ratings' ? [...(item.pros || []), ...(item.cons || [])].join(' · ') : '')
    || originalContent?.excerpt || originalContent?.content || originalContent?.description
    || (tableName === 'reposts' ? `Original content ID: ${item.original_content_id}` : '')
  const editable = {
    info_blogs: { title: item.title || '', content: item.content || '', excerpt: item.excerpt || '' },
    info_user_posts: { title: item.title || '', content: item.content || '' },
    forum_threads: { title: item.title || '', content: item.content || '' },
    forum_replies: { content: item.content || '' },
    content_comments: { body: item.body || '' },
    info_comments: { content: item.content || '' },
  }[tableName] || null
  return {
    label: config.label,
    title,
    excerpt: String(body || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    photoUrl: tableName === 'attraction_ratings' ? item.photo_url || null : null,
    href: getContentLink(tableName, item),
    editable,
    canHide: Boolean(HIDE_UPDATES[tableName]),
    canDelete: DELETABLE_TABLES.has(tableName),
  }
}

async function writeAudit(client, actorId, action, tableName, recordId, changes) {
  const { error } = await client.from('info_audit_log').insert({
    user_id: actorId,
    action,
    table_name: tableName,
    record_id: recordId,
    changes,
  })
  if (error) throw error
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation is not configured.' }, 500)

  const params = new URL(request.url).searchParams
  const reviewReportId = params.get('reviewReportId')
  if (reviewReportId) {
    if (!isValidUuid(reviewReportId)) return respond({ success: false, message: 'A valid report id is required.' }, 400)

    const { data: report, error: reportError } = await client
      .from('info_moderation')
      .select('id, report_type, reason, description, severity, reported_by, reported_user_id, reported_item_id, reported_item_table, status, assigned_to, moderation_notes, resolution, created_at, resolved_at')
      .eq('id', reviewReportId)
      .maybeSingle()
    if (reportError) throw reportError
    if (!report) return respond({ success: false, message: 'Report not found.' }, 404)
    if (report.reported_item_table !== 'info_users' || report.reported_item_id !== report.reported_user_id) {
      return respond({ success: false, message: 'This review interface is only available for account reports.' }, 400)
    }

    const userIds = [...new Set([report.reported_by, report.reported_user_id, report.assigned_to].filter(Boolean))]
    const [
      usersResult,
      reportsResult,
      postingQueries,
      warningsResult,
      bansResult,
      auditResult,
    ] = await Promise.all([
      client.from('info_users').select('id, full_name, user_name, email, user_type, status, profile_image_url, created_at').in('id', userIds),
      client.from('info_moderation')
        .select('id, report_type, reason, description, severity, reported_by, reported_user_id, reported_item_id, reported_item_table, status, resolution, moderation_notes, created_at, resolved_at')
        .eq('reported_user_id', report.reported_user_id)
        .order('created_at', { ascending: false })
        .limit(100),
      Promise.all([
        client.from('info_blogs').select('id, title, status, approval_status, created_at').eq('created_by', report.reported_user_id).order('created_at', { ascending: false }).limit(50),
        client.from('info_user_posts').select('id, title, content, status, created_at').eq('user_id', report.reported_user_id).order('created_at', { ascending: false }).limit(50),
        client.from('forum_threads').select('id, title, content, status, created_at').eq('created_by', report.reported_user_id).order('created_at', { ascending: false }).limit(50),
        client.from('forum_replies').select('id, content, status, created_at, thread_id').eq('user_id', report.reported_user_id).order('created_at', { ascending: false }).limit(50),
        client.from('content_comments').select('id, body, status, created_at, content_type, content_id').eq('user_id', report.reported_user_id).order('created_at', { ascending: false }).limit(50),
        client.from('info_comments').select('id, content, status, created_at, blog_id').eq('user_id', report.reported_user_id).order('created_at', { ascending: false }).limit(50),
      ]),
      client.from('user_warnings').select('id, reason, issued_by, report_id, created_at').eq('user_id', report.reported_user_id).order('created_at', { ascending: false }).limit(50),
      client.from('admin_user_bans').select('*').eq('user_id', report.reported_user_id).order('banned_at', { ascending: false }).limit(50),
      client.from('info_audit_log')
        .select('id, user_id, action, table_name, record_id, changes, created_at')
        .or(`record_id.eq.${report.reported_user_id},record_id.eq.${reviewReportId}`)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const failed = [usersResult, reportsResult, warningsResult, bansResult, auditResult, ...postingQueries].find((result) => result.error && !MISSING_RELATION_CODES.has(result.error.code))
    if (failed) {
      console.error('Account review detail load failed:', failed.error)
      return respond({ success: false, message: 'Unable to load the account review.' }, 500)
    }

    const users = new Map((usersResult.data || []).map((item) => [item.id, item]))
    const reporterIds = (reportsResult.data || []).map((item) => item.reported_by).filter(Boolean)
    if (reporterIds.length) {
      const reporterResult = await client.from('info_users').select('id, full_name, email, user_type, status, created_at').in('id', [...new Set(reporterIds)])
      if (!reporterResult.error) {
        for (const reporter of reporterResult.data || []) users.set(reporter.id, reporter)
      }
    }

    const violations = reportsResult.data || []
    const reportsByTable = new Map()
    for (const violation of violations) {
      if (!REPORTED_CONTENT_TABLES[violation.reported_item_table] || !violation.reported_item_id) continue
      const ids = reportsByTable.get(violation.reported_item_table) || new Set()
      ids.add(violation.reported_item_id)
      reportsByTable.set(violation.reported_item_table, ids)
    }

    const evidenceByType = new Map()
    try {
      await Promise.all([...reportsByTable.entries()].map(async ([tableName, ids]) => {
        const result = await client.from(tableName).select(REPORTED_CONTENT_TABLES[tableName].select).in('id', [...ids])
        if (result.error) throw result.error
        evidenceByType.set(tableName, new Map((result.data || []).map((item) => [item.id, item])))
      }))
    } catch (error) {
      console.error('Account review evidence load failed:', error)
      return respond({ success: false, message: 'Unable to load reported evidence.' }, 500)
    }

    const postingHistory = [
      ...(postingQueries[0].data || []).map((item) => ({ ...item, type: 'Blog', title: item.title })),
      ...(postingQueries[1].data || []).map((item) => ({ ...item, type: 'Community post', title: item.title })),
      ...(postingQueries[2].data || []).map((item) => ({ ...item, type: 'Forum topic', title: item.title })),
      ...(postingQueries[3].data || []).map((item) => ({ ...item, type: 'Forum reply', title: item.content })),
      ...(postingQueries[4].data || []).map((item) => ({ ...item, type: 'Comment', title: item.body })),
      ...(postingQueries[5].data || []).map((item) => ({ ...item, type: 'Blog comment', title: item.content })),
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 100)

    const moderatorId = report.assigned_to
    return respond({
      success: true,
      review: {
        report,
        account: users.get(report.reported_user_id) || null,
        reporter: users.get(report.reported_by) || null,
        moderator: moderatorId ? users.get(moderatorId) || null : null,
        violations: violations.map((violation) => ({
          ...violation,
          reporter: users.get(violation.reported_by) || null,
          evidence: evidenceByType.get(violation.reported_item_table)?.get(violation.reported_item_id) || null,
        })),
        postingHistory,
        warnings: warningsResult.error ? [] : warningsResult.data || [],
        restrictions: bansResult.error ? [] : bansResult.data || [],
        auditHistory: auditResult.error ? [] : auditResult.data || [],
      },
    })
  }

  if (params.get('view') === 'summary') {
    const now = new Date().toISOString()
    const [
      receivedReports,
      resolvedReports,
      pendingReports,
      flaggedPosts,
      appeals,
      bans,
      pendingPosts,
      pendingForumTopics,
      openInquiries,
      inProgressInquiries,
    ] = await Promise.all([
      client.from('info_moderation').select('id', { count: 'exact', head: true }),
      client.from('info_moderation')
        .select('id', { count: 'exact', head: true })
        .in('status', ['resolved', 'rejected']),
      client.from('info_moderation')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'reviewing']),
      client.from('info_user_posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'flagged'),
      client.from('user_moderation_appeals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      client.from('admin_user_bans')
        .select('user_id', { count: 'exact', head: true })
        .is('lifted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${now}`),
      client.from('info_user_posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      client.from('forum_threads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      client.from('info_inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
      client.from('info_inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'in_progress'),
    ])
    const failedResult = [
      receivedReports,
      resolvedReports,
      pendingReports,
      flaggedPosts,
      appeals,
      bans,
      pendingPosts,
      pendingForumTopics,
      openInquiries,
      inProgressInquiries,
    ].find((result) => result.error)
    if (failedResult) {
      console.error('Moderation summary load failed:', failedResult.error)
      return respond({ success: false, message: 'Unable to load moderation summary.' }, 500)
    }

    return respond({
      success: true,
      stats: {
        receivedReports: receivedReports.count || 0,
        resolvedReports: resolvedReports.count || 0,
        pendingReports: pendingReports.count || 0,
        openReports: pendingReports.count || 0,
        flaggedPosts: flaggedPosts.count || 0,
        pendingAppeals: appeals.count || 0,
        activeBans: bans.count || 0,
        pendingPosts: pendingPosts.count || 0,
        pendingForumTopics: pendingForumTopics.count || 0,
        openInquiries: openInquiries.count || 0,
        inProgressInquiries: inProgressInquiries.count || 0,
      },
    })
  }

  const historyUserId = params.get('userId')
  if (historyUserId) {
    if (!isValidUuid(historyUserId)) return respond({ success: false, message: 'A valid user id is required.' }, 400)
    const historyQueries = await Promise.all([
      client.from('info_blogs').select('id, title, status, approval_status, created_at').eq('created_by', historyUserId).order('created_at', { ascending: false }).limit(50),
      client.from('info_user_posts').select('id, title, status, created_at').eq('user_id', historyUserId).order('created_at', { ascending: false }).limit(50),
      client.from('forum_threads').select('id, title, status, created_at').eq('created_by', historyUserId).order('created_at', { ascending: false }).limit(50),
      client.from('forum_replies').select('id, content, status, created_at').eq('user_id', historyUserId).order('created_at', { ascending: false }).limit(50),
      client.from('content_comments').select('id, body, status, created_at').eq('user_id', historyUserId).order('created_at', { ascending: false }).limit(50),
      client.from('info_comments').select('id, content, status, created_at').eq('user_id', historyUserId).order('created_at', { ascending: false }).limit(50),
    ])
    const historyError = historyQueries.find((result) => result.error)
    if (historyError) {
      console.error('User moderation history load failed:', historyError.error)
      return respond({ success: false, message: 'Unable to load this user posting history.' }, 500)
    }

    const [warningsResult, restrictionResult] = await Promise.all([
      client.from('user_warnings')
        .select('id, reason, issued_by, report_id, created_at', { count: 'exact' })
        .eq('user_id', historyUserId)
        .order('created_at', { ascending: false })
        .limit(50),
      client.from('admin_user_bans')
        .select('*')
        .eq('user_id', historyUserId)
        .is('lifted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .maybeSingle(),
    ])
    if (warningsResult.error && !MISSING_RELATION_CODES.has(warningsResult.error.code)) {
      console.error('User warning history load failed:', warningsResult.error)
      return respond({ success: false, message: 'Unable to load this user warning history.' }, 500)
    }
    if (restrictionResult.error) {
      console.error('User restriction lookup failed:', restrictionResult.error)
      return respond({ success: false, message: 'Unable to load this user restriction status.' }, 500)
    }

    const postingHistory = [
      ...(historyQueries[0].data || []).map((item) => ({ ...item, type: 'Blog' })),
      ...(historyQueries[1].data || []).map((item) => ({ ...item, type: 'Community post' })),
      ...(historyQueries[2].data || []).map((item) => ({ ...item, type: 'Forum topic' })),
      ...(historyQueries[3].data || []).map((item) => ({ ...item, title: item.content, type: 'Forum reply' })),
      ...(historyQueries[4].data || []).map((item) => ({ ...item, title: item.body, type: 'Comment' })),
      ...(historyQueries[5].data || []).map((item) => ({ ...item, title: item.content, type: 'Blog comment' })),
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 100)

    return respond({
      success: true,
      postingHistory,
      warnings: warningsResult.error ? [] : warningsResult.data || [],
      warningCount: warningsResult.error ? 0 : warningsResult.count || 0,
      activeRestriction: restrictionResult.data
        ? { ...restrictionResult.data, ban_type: restrictionResult.data.ban_type || 'posting' }
        : null,
    })
  }

  const [
    { data: reports, error: reportsError },
    { data: bans, error: bansError },
    { data: logs, error: logsError },
    { data: appeals, error: appealsError },
    { data: moderationSettings, error: settingsError },
  ] = await Promise.all([
    client.from('info_moderation')
      .select('id, report_type, reason, description, severity, reported_by, reported_user_id, reported_item_id, reported_item_table, status, moderation_notes, created_at')
      .in('status', ['pending', 'reviewing'])
      .order('created_at', { ascending: false })
      .limit(100),
    client.from('admin_user_bans')
      .select('*')
      .is('lifted_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('banned_at', { ascending: false })
      .limit(100),
    client.from('info_audit_log')
      .select('id, user_id, action, table_name, record_id, changes, created_at')
      .in('table_name', ['info_moderation', 'user_moderation_appeals', 'admin_user_bans', 'admin_comment_mutes', 'admin_app_settings', 'content', 'report', 'user', 'info_user_posts', 'forum_threads', 'forum_replies', 'content_comments', 'info_comments', 'info_blogs'])
      .order('created_at', { ascending: false })
      .limit(50),
    client.from('user_moderation_appeals')
      .select('id, user_id, restriction_id, reason, explanation, appeal_type, evidence_paths, status, decision_notes, reviewed_by, reviewed_at, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100),
    client.from('admin_app_settings')
      .select('value')
      .eq('id', 'moderation')
      .maybeSingle(),
  ])
  if (reportsError || bansError || logsError || appealsError || settingsError) {
    console.error('Moderation data load failed:', reportsError?.message || bansError?.message || logsError?.message || appealsError?.message || settingsError?.message)
    return respond({ success: false, message: 'Unable to load moderation data.' }, 500)
  }

  const pendingResults = await Promise.all([
    client.from('info_user_posts').select('id, user_id, title, content, created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    client.from('forum_threads').select('id, created_by, title, content, created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
  ])
  const pendingError = pendingResults.find((result) => result.error)
  if (pendingError) {
    console.error('Pending submission load failed:', pendingError.error)
    return respond({ success: false, message: 'Unable to load pending submissions.' }, 500)
  }
  const appealRestrictionIds = [...new Set((appeals || []).map((appeal) => appeal.restriction_id).filter(Boolean))]
  const appealRestrictionResult = appealRestrictionIds.length
    ? await client.from('admin_user_bans')
      .select('id, user_id, reason, ban_type, banned_at, expires_at, lifted_at')
      .in('id', appealRestrictionIds)
    : { data: [], error: null }
  if (appealRestrictionResult.error) {
    console.error('Account appeal suspension details load failed:', { code: appealRestrictionResult.error.code || null })
    return respond({ success: false, message: 'Unable to load restriction details for open appeals.' }, 500)
  }
  const appealRestrictionsById = new Map((appealRestrictionResult.data || []).map((ban) => [ban.id, ban]))
  const appealIds = (appeals || []).map((appeal) => appeal.id).filter(Boolean)
  const appealReviewResult = appealIds.length
    ? await client.from('moderation_appeal_reviews')
      .select('id, appeal_id, reviewer_id, reviewer_role, decision, reason, previous_status, new_status, previous_expires_at, new_expires_at, created_at')
      .in('appeal_id', appealIds)
      .order('created_at', { ascending: true })
    : { data: [], error: null }
  if (appealReviewResult.error) {
    console.error('Appeal review history load failed:', { code: appealReviewResult.error.code || null })
    return respond({ success: false, message: 'Unable to load appeal review history.' }, 500)
  }
  const pendingSubmissions = [
    ...(pendingResults[0].data || []).map((item) => ({ ...item, table: 'info_user_posts', userId: item.user_id, title: item.title, content: item.content, label: 'Community post' })),
    ...(pendingResults[1].data || []).map((item) => ({ ...item, table: 'forum_threads', userId: item.created_by, title: item.title, content: item.content, label: 'Forum topic' })),
  ].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const pendingUserIds = [...new Set(pendingSubmissions.map((item) => item.userId).filter(Boolean))]

  const userIds = [...new Set([
    ...(reports || []).flatMap((report) => [report.reported_by, report.reported_user_id]),
    ...(bans || []).flatMap((ban) => [ban.user_id, ban.banned_by]),
    ...(appeals || []).map((appeal) => appeal.user_id),
    ...(appealReviewResult.data || []).map((review) => review.reviewer_id),
    ...(logs || []).map((entry) => entry.user_id),
    ...pendingUserIds,
  ].filter(Boolean))]
  const { data: users, error: usersError } = userIds.length
    ? await client.from('info_users').select('id, full_name, email, status').in('id', userIds)
    : { data: [], error: null }
  if (usersError) return respond({ success: false, message: 'Unable to load moderation user details.' }, 500)
  const people = new Map((users || []).map((user) => [user.id, user]))
  const bansByUser = new Map((bans || []).map((ban) => [ban.user_id, ban]))
  const signedAppeals = await signModerationAppealEvidence(client, appeals || [])
  const reviewsByAppeal = new Map()
  for (const review of appealReviewResult.data || []) {
    const reviews = reviewsByAppeal.get(review.appeal_id) || []
    reviews.push({ ...review, reviewer: people.get(review.reviewer_id) || null })
    reviewsByAppeal.set(review.appeal_id, reviews)
  }
  const appealDetails = signedAppeals.map((appeal) => ({
    ...appeal,
    user: people.get(appeal.user_id) || null,
    suspension: appealRestrictionsById.get(appeal.restriction_id) || bansByUser.get(appeal.user_id) || null,
    reviewHistory: reviewsByAppeal.get(appeal.id) || [],
  }))

  const reportsByTable = new Map()
  for (const report of reports || []) {
    const tableName = report.reported_item_table
    if (!REPORTED_CONTENT_TABLES[tableName] || !report.reported_item_id) continue
    const ids = reportsByTable.get(tableName) || new Set()
    ids.add(report.reported_item_id)
    reportsByTable.set(tableName, ids)
  }
  let contentResults
  try {
    contentResults = await Promise.all([...reportsByTable.entries()].map(async ([tableName, ids]) => {
      const { data, error } = await client
        .from(tableName)
        .select(REPORTED_CONTENT_TABLES[tableName].select)
        .in('id', [...ids])
      if (error) throw error
      return [tableName, new Map((data || []).map((item) => [item.id, item]))]
    }))
  } catch (error) {
    console.error('Reported content preview load failed:', error)
    return respond({ success: false, message: 'Unable to load reported content previews.' }, 500)
  }
  const contentByTable = new Map(contentResults)

  const repostRows = [...(contentByTable.get('reposts')?.values() || [])]
  const repostOriginalsByType = new Map()
  for (const repost of repostRows) {
    const config = REPOST_ORIGINAL_TABLES[repost.original_content_type]
    if (!config || !repost.original_content_id) continue
    const ids = repostOriginalsByType.get(repost.original_content_type) || new Set()
    ids.add(repost.original_content_id)
    repostOriginalsByType.set(repost.original_content_type, ids)
  }
  let originalContentByType
  try {
    const originalContentResults = await Promise.all([...repostOriginalsByType.entries()].map(async ([contentType, ids]) => {
      const config = REPOST_ORIGINAL_TABLES[contentType]
      const { data, error } = await client.from(config.table).select(config.select).in('id', [...ids])
      if (error) throw error
      return [contentType, new Map((data || []).map((item) => [item.id, item]))]
    }))
    originalContentByType = new Map(originalContentResults)
  } catch (error) {
    console.error('Repost preview load failed:', error)
    return respond({ success: false, message: 'Unable to load reported repost previews.' }, 500)
  }

  let profanityTerms
  try {
    profanityTerms = normalizeProfanityTerms(moderationSettings?.value?.profanityTerms || [])
  } catch (error) {
    console.error('Saved profanity settings are invalid:', error)
    return respond({ success: false, message: 'Saved profanity settings are invalid. Update the filter list to continue.' }, 500)
  }

  return respond({
    success: true,
    reports: (reports || []).map((report) => {
      const item = contentByTable.get(report.reported_item_table)?.get(report.reported_item_id)
      const originalContent = report.reported_item_table === 'reposts' && item
        ? originalContentByType.get(item.original_content_type)?.get(item.original_content_id)
        : null
      return {
        ...report,
        reporter: people.get(report.reported_by) || null,
        reportedUser: people.get(report.reported_user_id) || null,
        reportedContent: mapReportedContent(report.reported_item_table, item, originalContent),
      }
    }),
    pendingSubmissions: pendingSubmissions.map((item) => ({
      ...item,
      author: people.get(item.userId) || null,
    })),
    blockedUsers: (bans || []).map((ban) => ({
      ...ban,
      ban_type: ban.ban_type || 'posting',
      user: people.get(ban.user_id) || null,
      moderator: people.get(ban.banned_by) || null,
    })),
    appeals: appealDetails,
    profanityTerms,
    autoPublish: {
      enabled: moderationSettings?.value?.autoPublish?.enabled === true,
      minAccountAgeDays: moderationSettings?.value?.autoPublish?.minAccountAgeDays ?? 7,
      minApprovedPosts: moderationSettings?.value?.autoPublish?.minApprovedPosts ?? 3,
      maxRejectedPosts: moderationSettings?.value?.autoPublish?.maxRejectedPosts ?? 0,
      maxViolations: moderationSettings?.value?.autoPublish?.maxViolations ?? 0,
      maxRecentSubmissions: moderationSettings?.value?.autoPublish?.maxRecentSubmissions ?? 2,
    },
    logs: (logs || []).map((entry) => ({ ...entry, actor: people.get(entry.user_id) || null })),
  })
}

export async function PATCH(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation is not configured.' }, 500)

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A moderation action is required.' }, 400)
  }
  const actorId = authorization.session.user_id
  const action = String(body?.action || '')
  const now = new Date().toISOString()

  try {
    if (action === 'review-submission') {
      const submissionId = String(body.submissionId || '')
      const tableName = String(body.tableName || '')
      const decision = String(body.decision || '')
      const reason = String(body.reason || '').trim()
      const statuses = {
        info_user_posts: { approve: 'published', reject: 'rejected' },
        forum_threads: { approve: 'published', reject: 'rejected' },
      }
      if (!isValidUuid(submissionId) || !statuses[tableName] || !['approve', 'reject'].includes(decision) || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'Provide a valid submission decision and reason.' }, 400)
      }
      const authorField = tableName === 'forum_threads' ? 'created_by' : 'user_id'
      const currentStatuses = tableName === 'info_user_posts' ? ['pending', 'flagged'] : ['pending']
      const { data: submission, error: submissionError } = await client.from(tableName)
        .select(`id, ${authorField}`)
        .eq('id', submissionId)
        .in('status', currentStatuses)
        .maybeSingle()
      if (submissionError) throw submissionError
      if (!submission) return respond({ success: false, message: 'This submission is no longer pending.' }, 409)
      const { data, error } = await client.from(tableName)
        .update({ status: statuses[tableName][decision], updated_at: now })
        .eq('id', submissionId)
        .in('status', currentStatuses)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return respond({ success: false, message: 'This submission is no longer pending.' }, 409)
      await writeAudit(client, actorId, `${decision}-submission`, tableName, submissionId, { reason })
      const submissionAuthorId = submission[authorField]
      if (submissionAuthorId) {
        const { error: notificationError } = await client.from('info_notifications').insert({
          user_id: submissionAuthorId,
          title: decision === 'approve' ? 'Submission approved' : 'Submission not approved',
          message: decision === 'approve'
            ? `Your ${tableName.replace(/_/g, ' ')} is now published.`
            : `Your ${tableName.replace(/_/g, ' ')} was not approved. Reason: ${reason}`,
          type: decision === 'approve' ? 'success' : 'warning',
          is_read: false,
        })
        if (notificationError) throw notificationError
      }
      return respond({ success: true })
    }

    if (action === 'edit-reported-content') {
      const reportId = String(body.reportId || '')
      const reason = String(body.reason || '').trim()
      const edits = body.edits && typeof body.edits === 'object' && !Array.isArray(body.edits) ? body.edits : {}
      const editableFields = {
        info_blogs: ['title', 'content', 'excerpt'],
        info_user_posts: ['title', 'content'],
        forum_threads: ['title', 'content'],
        forum_replies: ['content'],
        content_comments: ['body'],
        info_comments: ['content'],
      }
      if (!isValidUuid(reportId) || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'A report and edit reason are required.' }, 400)
      }
      const { data: report, error: reportError } = await client.from('info_moderation')
        .select('id, reported_item_id, reported_item_table')
        .eq('id', reportId)
        .in('status', ['pending', 'reviewing'])
        .maybeSingle()
      if (reportError) throw reportError
      if (!report || !report.reported_item_id) return respond({ success: false, message: 'This report no longer has editable content.' }, 409)

      const allowedFields = editableFields[report.reported_item_table]
      if (!allowedFields) return respond({ success: false, message: 'This content type cannot be edited here.' }, 400)
      const update = {}
      for (const field of allowedFields) {
        if (!Object.prototype.hasOwnProperty.call(edits, field)) continue
        const value = String(edits[field] || '').trim()
        const maxLength = field === 'title' ? 200 : field === 'excerpt' ? 5000 : 50000
        if (!value && ['title', 'content', 'body'].includes(field)) {
          return respond({ success: false, message: `${field} cannot be empty.` }, 400)
        }
        if (value.length > maxLength) {
          return respond({ success: false, message: `${field} is too long.` }, 400)
        }
        update[field] = value || null
      }
      if (!Object.keys(update).length) return respond({ success: false, message: 'Provide at least one content change.' }, 400)
      update.updated_at = now
      if (report.reported_item_table === 'info_blogs') {
        update.status = 'draft'
        update.approval_status = 'pending'
        update.published_at = null
      }

      const { data: edited, error: editError } = await client.from(report.reported_item_table)
        .update(update)
        .eq('id', report.reported_item_id)
        .select(report.reported_item_table === 'info_blogs' ? 'id, created_by, title' : 'id')
        .maybeSingle()
      if (editError) throw editError
      if (!edited) return respond({ success: false, message: 'The reported content is no longer available.' }, 404)

      const { data: resolved, error: resolutionError } = await client.from('info_moderation')
        .update({
          status: 'resolved',
          resolution: `Content edited: ${reason}`,
          moderation_notes: reason,
          assigned_to: actorId,
          resolved_at: now,
          updated_at: now,
        })
        .eq('id', reportId)
        .in('status', ['pending', 'reviewing'])
        .select('id')
        .maybeSingle()
      if (resolutionError) throw resolutionError
      if (!resolved) return respond({ success: false, message: 'Content was edited, but the report changed concurrently. Refresh the queue.' }, 409)
      await writeAudit(client, actorId, 'edit-reported-content', report.reported_item_table, report.reported_item_id, { reportId, reason, fields: Object.keys(update).filter((field) => field !== 'updated_at') })
      const unpublishNotification = report.reported_item_table === 'info_blogs'
        ? await notifyBlogAuthorsOfUnpublish(client, [{
            authorId: edited.created_by,
            actorId,
            contentTitle: edited.title,
          }], reason)
        : null
      return respond({
        success: true,
        ...(unpublishNotification
          ? {
              notificationSent: unpublishNotification.sent > 0,
              notificationWarning: unpublishNotification.warning,
            }
          : {}),
      })
    }

    if (action === 'save-profanity-terms') {
      let terms
      try {
        terms = normalizeProfanityTerms(body.terms)
      } catch (error) {
        return respond({ success: false, message: publicErrorMessage(error, 'The profanity term list is invalid.') }, 400)
      }

      const { data: current, error: settingsError } = await client
        .from('admin_app_settings')
        .select('value')
        .eq('id', 'moderation')
        .maybeSingle()
      if (settingsError) throw settingsError

      const { error } = await client.from('admin_app_settings').upsert({
        id: 'moderation',
        value: { ...(current?.value || {}), profanityTerms: terms },
        updated_by: actorId,
        updated_at: now,
      }, { onConflict: 'id' })
      if (error) throw error
      await writeAudit(client, actorId, action, 'admin_app_settings', null, { termCount: terms.length })
      return respond({ success: true, profanityTerms: terms })
    }

    if (action === 'save-auto-publish-policy') {
      const input = body.policy && typeof body.policy === 'object' && !Array.isArray(body.policy)
        ? body.policy
        : null
      const numberFields = [
        ['minAccountAgeDays', 0, 3650],
        ['minApprovedPosts', 0, 10000],
        ['maxRejectedPosts', 0, 10000],
        ['maxViolations', 0, 10000],
        ['maxRecentSubmissions', 0, 100],
      ]
      if (!input || typeof input.enabled !== 'boolean') {
        return respond({ success: false, message: 'A valid auto-publishing policy is required.' }, 400)
      }
      const policy = { enabled: input.enabled }
      for (const [field, minimum, maximum] of numberFields) {
        const value = input[field]
        if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
          return respond({ success: false, message: `Enter a whole number between ${minimum} and ${maximum} for ${field}.` }, 400)
        }
        policy[field] = value
      }

      const { data: current, error: settingsError } = await client
        .from('admin_app_settings')
        .select('value')
        .eq('id', 'moderation')
        .maybeSingle()
      if (settingsError) throw settingsError

      const { error } = await client.from('admin_app_settings').upsert({
        id: 'moderation',
        value: { ...(current?.value || {}), autoPublish: policy },
        updated_by: actorId,
        updated_at: now,
      }, { onConflict: 'id' })
      if (error) throw error
      await writeAudit(client, actorId, action, 'admin_app_settings', null, policy)
      return respond({ success: true, autoPublish: policy })
    }

    if (action === 'warn-user') {
      const userId = String(body.userId || '')
      const reason = String(body.reason || '').trim()
      if (!userId || userId === actorId || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'Select another user and provide a valid warning.' }, 400)
      }
      const { data: target, error: targetError } = await client.from('info_users').select('id, user_type, username').eq('id', userId).maybeSingle()
      if (targetError) throw targetError
      if (!target) return respond({ success: false, message: 'User not found.' }, 404)
      if (['admin', 'administrator', 'tourism_officer', 'moderator'].includes(String(target.user_type || '').toLowerCase())) {
        return respond({ success: false, message: 'Staff accounts cannot be warned through community moderation.' }, 400)
      }

      const reportId = isValidUuid(String(body.reportId || '')) ? String(body.reportId) : null
      const { error: warningError } = await client.from('user_warnings').insert({
        user_id: userId,
        reason,
        report_id: reportId,
        issued_by: actorId,
      })
      if (warningError && !MISSING_RELATION_CODES.has(warningError.code)) throw warningError

      const { error } = await client.from('info_notifications').insert({
        user_id: userId,
        title: 'Community guidelines warning',
        message: reason,
        type: 'warning',
        is_read: false,
        link: '/info/user/notifications',
      })
      if (error) throw error
      const { error: emailQueueError } = await client.rpc('enqueue_moderation_email', {
        p_dedupe_key: `warning:${userId}:${reportId || now}`,
        p_user_id: userId,
        p_event_type: 'account_warning',
        p_payload: {
          username: target.username,
          reason,
          guideline: String(body.guideline || '').trim() || 'Connect Daet Community Guidelines',
        },
      })
      if (emailQueueError) {
        console.error('Account warning email queue failed:', { code: emailQueueError.code || null })
      }
      await writeAudit(client, actorId, action, 'info_users', userId, { reason, reportId })
      return respond({ success: true, emailQueued: !emailQueueError })
    }

    if (action === 'review-appeal') {
      const appealId = String(body.appealId || '')
      const decision = String(body.decision || '')
      const reason = String(body.reason || '').trim()
      const durationDays = body.durationDays == null || body.durationDays === '' ? null : Number(body.durationDays)
      const validDecisions = ['start_review', 'approve', 'reject', 'reduce_suspension', 'request_more_information']
      if (!isValidUuid(appealId) || !validDecisions.includes(decision) || !reason || reason.length > 2000
        || (decision === 'reduce_suspension' && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365))
        || (decision !== 'reduce_suspension' && durationDays !== null)) {
        return respond({ success: false, message: 'Provide a valid appeal decision, reason, and duration when reducing a suspension.' }, 400)
      }
      const { data, error } = await client.rpc('review_user_moderation_appeal_v2', {
        p_appeal_id: appealId,
        p_reviewer_id: actorId,
        p_decision: decision,
        p_reason: reason,
        p_duration_days: durationDays,
      })
      if (error) {
        if (error.message?.includes('no longer')
          || error.message?.includes('original decision-maker')
          || error.message?.includes('no longer active')) {
          return respond({ success: false, message: error.message }, 409)
        }
        throw error
      }

      let sessionRevocationWarning = null
      if (data.account_restored) {
        try {
          await revokeUserSessions(client, data.user_id)
        } catch (revokeError) {
          console.error('Session revocation after suspension appeal approval failed:', revokeError)
          sessionRevocationWarning = 'The account was restored, but the suspended session could not be revoked.'
        }
      }

      return respond({
        success: true,
        appeal: data,
        emailQueued: decision !== 'start_review',
        sessionRevocationWarning,
      })
    }

    if (action === 'moderate-content') {
      const reportId = String(body.reportId || '')
      const disposition = String(body.disposition || '')
      const reason = String(body.reason || '').trim()
      if (!isValidUuid(reportId) || !['hide', 'delete'].includes(disposition) || reason.length > 1000) {
        return respond({ success: false, message: 'Provide a valid content action and reason.' }, 400)
      }

      const { data: report, error: reportError } = await client
        .from('info_moderation')
        .select('id, reported_item_id, reported_item_table, status')
        .eq('id', reportId)
        .in('status', ['pending', 'reviewing'])
        .maybeSingle()
      if (reportError) throw reportError
      if (!report) return respond({ success: false, message: 'This report is no longer open.' }, 409)

      const tableName = report.reported_item_table
      let deletionNotification = null
      let unpublishNotification = null
      let mediaCleanupWarning = ''
      if (disposition === 'hide') {
        if (!reason && tableName !== 'info_blogs') {
          return respond({ success: false, message: 'A reason is required to hide this content.' }, 400)
        }
        const update = HIDE_UPDATES[tableName]
        if (!update) return respond({ success: false, message: 'This content type cannot be hidden here.' }, 400)
        const { data: hidden, error } = await client.from(tableName)
          .update(update)
          .eq('id', report.reported_item_id)
          .select(tableName === 'info_blogs' ? 'id, created_by, title' : 'id')
          .maybeSingle()
        if (error) throw error
        if (!hidden) return respond({ success: false, message: 'The reported content is no longer available.' }, 404)
        if (tableName === 'info_blogs') {
          unpublishNotification = await notifyBlogAuthorsOfUnpublish(client, [{
            authorId: hidden.created_by,
            actorId,
            contentTitle: hidden.title,
          }], reason)
        }
      } else {
        if (!reason) return respond({ success: false, message: 'A reason is required to delete this content.' }, 400)
        if (!DELETABLE_TABLES.has(tableName)) {
          return respond({ success: false, message: 'This content type must be removed through its management workflow.' }, 400)
        }
        const contentConfig = DELETABLE_CONTENT[tableName]
        const deletedColumns = ['id', contentConfig.authorColumn, contentConfig.titleColumn]
        if (tableName === 'attraction_ratings') deletedColumns.push('photo_url')
        const { data: deleted, error } = await client.from(tableName)
          .delete()
          .eq('id', report.reported_item_id)
          .select([...new Set(deletedColumns)].join(', '))
          .maybeSingle()
        if (error) throw error
        if (!deleted) return respond({ success: false, message: 'The reported content is no longer available.' }, 404)

        if (tableName === 'attraction_ratings' && deleted.photo_url) {
          const authorId = deleted[contentConfig.authorColumn]
          const photoPath = getOwnedReviewPhotoPath(deleted.photo_url, authorId)
          if (!photoPath) {
            mediaCleanupWarning = 'The review photo could not be safely identified for cleanup.'
          } else {
            const { error: photoError } = await client.storage.from('profile-media').remove([photoPath])
            if (photoError) {
              console.error('Moderated review photo cleanup failed:', { code: photoError.code || null })
              mediaCleanupWarning = 'The review was deleted, but its photo could not be removed.'
            } else {
              const { error: trackingError } = await client.from('user_storage_objects')
                .delete()
                .eq('user_id', authorId)
                .eq('bucket_id', 'profile-media')
                .eq('object_path', photoPath)
              if (trackingError) {
                console.error('Moderated review photo ownership cleanup failed:', { code: trackingError.code || null })
                mediaCleanupWarning = 'The review was deleted, but its photo record could not be cleaned up.'
              }
            }
          }
        }

        deletionNotification = await notifyContentAuthorOfDeletion(client, {
          authorId: deleted[contentConfig.authorColumn],
          actorId,
          contentType: contentConfig.contentType,
          contentTitle: tableName === 'attraction_ratings'
            ? decodeReviewText(deleted[contentConfig.titleColumn] || '').title || 'Visitor review'
            : deleted[contentConfig.titleColumn],
        })
      }

      const resolutionAction = disposition === 'delete'
        ? 'deleted'
        : tableName === 'info_blogs'
          ? 'unpublished'
          : 'hidden'
      const { data: resolved, error: resolveError } = await client.from('info_moderation')
        .update({
          status: 'resolved',
          resolution: `Content ${resolutionAction}${reason ? `: ${reason}` : ''}`,
          moderation_notes: reason || null,
          assigned_to: actorId,
          resolved_at: now,
          updated_at: now,
        })
        .eq('id', reportId)
        .in('status', ['pending', 'reviewing'])
        .select('id')
        .maybeSingle()
      if (resolveError) throw resolveError
      if (!resolved) return respond({ success: false, message: 'Content was moderated, but the report changed concurrently. Refresh the queue.' }, 409)
      await writeAudit(client, actorId, `${disposition}-reported-content`, tableName, report.reported_item_id, { reportId, reason: reason || null })
      return respond({
        success: true,
        ...(deletionNotification
          ? {
              notificationSent: deletionNotification.sent,
              notificationWarning: deletionNotification.warning,
            }
          : {}),
        ...(unpublishNotification
          ? {
              notificationSent: unpublishNotification.sent > 0,
              notificationWarning: unpublishNotification.warning,
            }
          : {}),
        ...(mediaCleanupWarning ? { mediaCleanupWarning } : {}),
      })
    }

    if (action === 'unpublish-blogs') {
      const blogIds = [...new Set(Array.isArray(body.blogIds) ? body.blogIds.map(String) : [])]
      const reason = String(body.reason || '').trim()
      if (!blogIds.length || blogIds.length > 100 || blogIds.some((id) => !isValidUuid(id)) || reason.length > 1000) {
        return respond({ success: false, message: 'Select up to 100 blogs and provide a valid optional comment.' }, 400)
      }

      const { data: existingBlogs, error: lookupError } = await client.from('info_blogs')
        .select('id, created_by, title, status')
        .in('id', blogIds)
      if (lookupError) throw lookupError
      if (!existingBlogs || existingBlogs.length !== blogIds.length) {
        return respond({ success: false, message: 'One or more selected blogs are no longer available.' }, 404)
      }

      const { data: unpublishedBlogs, error: unpublishError } = await client.from('info_blogs')
        .update({ status: 'draft', published_at: null, updated_at: now })
        .in('id', blogIds)
        .select('id, created_by, title')
      if (unpublishError) throw unpublishError
      if (!unpublishedBlogs?.length) {
        return respond({ success: false, message: 'No selected blogs could be unpublished.' }, 404)
      }

      const previouslyPublished = new Set(
        existingBlogs.filter((blog) => blog.status === 'published').map((blog) => blog.id),
      )
      const notification = await notifyBlogAuthorsOfUnpublish(
        client,
        unpublishedBlogs
          .filter((blog) => previouslyPublished.has(blog.id))
          .map((blog) => ({ authorId: blog.created_by, actorId, contentTitle: blog.title })),
        reason,
      )
      await writeAudit(client, actorId, 'unpublish-blogs', 'info_blogs', null, {
        blogIds: unpublishedBlogs.map((blog) => blog.id),
        reason: reason || null,
      })
      return respond({
        success: true,
        updatedCount: unpublishedBlogs.length,
        notificationSent: notification.sent,
        notificationWarning: notification.warning,
      })
    }

    if (action === 'submit-moderator-account-investigation') {
      const reportId = String(body.reportId || '')
      const assessment = String(body.assessment || '').trim()
      const recommendation = String(body.recommendation || '')
      const reason = String(body.reason || '').trim()
      const supportingExplanation = String(body.supportingExplanation || '').trim()
      const suspensionDurationDays = body.suspensionDurationDays == null ? null : Number(body.suspensionDurationDays)
      const customDurationDays = body.customDurationDays == null ? null : Number(body.customDurationDays)
      const evidenceSnapshot = body.evidenceSnapshot && typeof body.evidenceSnapshot === 'object'
        ? body.evidenceSnapshot
        : {}

      if (!isValidUuid(reportId)) {
        return respond({ success: false, message: 'A valid account report is required.' }, 400)
      }
      if (normalizeStaffRole(authorization.session.role) !== 'moderator') {
        return respond({ success: false, message: 'Only authenticated moderators can submit account investigations.' }, 403)
      }
      if (!assessment || assessment.length > 5000) {
        return respond({ success: false, message: 'A written assessment is required.' }, 400)
      }
      if (!reason || reason.length > 1000) {
        return respond({ success: false, message: 'A recommendation reason is required.' }, 400)
      }
      if (!supportingExplanation || supportingExplanation.length > 5000) {
        return respond({ success: false, message: 'Supporting explanation is required.' }, 400)
      }
      if (![
        'no_violation',
        'issue_warning',
        'recommend_temporary_suspension',
        'recommend_permanent_ban',
      ].includes(recommendation)) {
        return respond({ success: false, message: 'A valid recommendation is required.' }, 400)
      }
      if (recommendation === 'recommend_temporary_suspension') {
        const preset = [1, 3, 7, 14, 30].includes(suspensionDurationDays)
        const custom = suspensionDurationDays == null && Number.isInteger(customDurationDays) && customDurationDays >= 1 && customDurationDays <= 365
        if (!preset && !custom) {
          return respond({ success: false, message: 'Select a valid temporary suspension duration.' }, 400)
        }
      } else if (suspensionDurationDays != null || customDurationDays != null) {
        return respond({ success: false, message: 'Suspension duration is only valid for temporary suspension recommendations.' }, 400)
      }

      const { data: investigation, error: investigationError } = await client.rpc(
        'submit_moderator_account_investigation',
        {
          p_report_id: reportId,
          p_moderator_id: actorId,
          p_assessment: assessment,
          p_recommendation: recommendation,
          p_reason: reason,
          p_supporting_explanation: supportingExplanation,
          p_suspension_duration_days: recommendation === 'recommend_temporary_suspension'
            ? suspensionDurationDays
            : null,
          p_custom_duration_days: recommendation === 'recommend_temporary_suspension'
            ? customDurationDays
            : null,
          p_evidence_snapshot: evidenceSnapshot,
        },
      )
      if (investigationError) {
        if (investigationError.message?.includes('already been submitted') || investigationError.message?.includes('no longer available')) {
          return respond({ success: false, message: investigationError.message }, 409)
        }
        if (investigationError.message?.includes('Only an active moderator')) {
          return respond({ success: false, message: investigationError.message }, 403)
        }
        throw investigationError
      }

      const { error: notificationLinkError } = await client
        .from('info_notifications')
        .update({ link: `/info/admin/suspension-cases?case=${investigation.investigation_id}` })
        .eq('title', 'Account investigation submitted')
        .like('link', `%reviewReportId=${reportId}`)
      if (notificationLinkError) {
        console.error('Tourism Officer investigation notification link update failed:', {
          code: notificationLinkError.code || null,
        })
      }

      return respond({
        success: true,
        investigation,
        confirmation: 'Investigation submitted. The case is pending Tourism Officer review.',
        notificationLinkWarning: notificationLinkError ? 'The case was submitted, but the Tourism Officer notification link could not be updated.' : null,
      })
    }

    if (action === 'approve-suspension') {
      return respond({
        success: false,
        message: 'Use the audited account status workflow to apply a suspension or permanent ban.',
      }, 403)
    }

    if (action === 'reject-account-report') {
      const reportId = String(body.reportId || '')
      const reason = String(body.reason || '').trim()
      if (!isValidUuid(reportId) || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'A rejection reason is required.' }, 400)
      }
      if (!['tourism_officer', 'admin'].includes(normalizeStaffRole(authorization.session.role))) {
        return respond({ success: false, message: 'Only a Tourism Officer or Administrator can reject reports.' }, 403)
      }
      const { error: decisionError } = await client.rpc('decide_account_moderation_report', {
        p_report_id: reportId,
        p_reviewer_id: actorId,
        p_decision: 'reject-account-report',
        p_reason: reason,
        p_duration_days: null,
      })
      if (decisionError) {
        if (decisionError.message?.includes('already been recorded') || decisionError.message?.includes('no longer open')) {
          return respond({ success: false, message: decisionError.message }, 409)
        }
        throw decisionError
      }
      return respond({ success: true, notificationSent: true })
    }

    if (action === 'escalate-account-review') {
      const reportId = String(body.reportId || '')
      const reason = String(body.reason || '').trim()
      if (!isValidUuid(reportId) || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'An escalation reason is required.' }, 400)
      }
      if (!['tourism_officer', 'admin'].includes(normalizeStaffRole(authorization.session.role))) {
        return respond({ success: false, message: 'Only a Tourism Officer or Administrator can escalate account reviews.' }, 403)
      }
      const { error: decisionError } = await client.rpc('decide_account_moderation_report', {
        p_report_id: reportId,
        p_reviewer_id: actorId,
        p_decision: 'escalate-account-review',
        p_reason: reason,
        p_duration_days: null,
      })
      if (decisionError) {
        if (decisionError.message?.includes('already been recorded') || decisionError.message?.includes('no longer open')) {
          return respond({ success: false, message: decisionError.message }, 409)
        }
        throw decisionError
      }
      return respond({ success: true, escalated: true, administratorNotified: true })
    }

    if (action === 'record-action') {
      const label = String(body.label || '').trim().slice(0, 100)
      const targetType = String(body.targetType || 'content').trim().slice(0, 60)
      const details = String(body.details || '').trim().slice(0, 1000)
      if (!label || !details) return respond({ success: false, message: 'A moderation action and details are required.' }, 400)
      await writeAudit(client, actorId, label, targetType, body.recordId || null, { details })
      return respond({ success: true })
    }

    if (action === 'resolve-report' || action === 'reject-report') {
      const reportId = String(body.reportId || '')
      const reason = String(body.reason || '').trim()
      if (!isValidUuid(reportId) || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'A report and resolution reason are required.' }, 400)
      }
      const { data: report, error: reportError } = await client.from('info_moderation')
        .select('reported_by, reported_item_table')
        .eq('id', reportId)
        .in('status', ['pending', 'reviewing'])
        .maybeSingle()
      if (reportError) throw reportError
      if (!report) return respond({ success: false, message: 'This report is no longer open.' }, 409)
      if (action === 'resolve-report' && report.reported_item_table === 'info_users') {
        return respond({ success: false, message: 'Approve the account report to apply the suspension, or dismiss it.' }, 400)
      }
      const status = action === 'reject-report' ? 'rejected' : 'resolved'
      const { data, error } = await client.from('info_moderation')
        .update({
          status,
          resolution: reason || 'Reviewed by a moderator.',
          moderation_notes: reason || null,
          assigned_to: actorId,
          resolved_at: now,
          updated_at: now,
        })
        .eq('id', reportId)
        .in('status', ['pending', 'reviewing'])
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return respond({ success: false, message: 'This report is no longer open.' }, 409)
      if (report.reported_by && report.reported_by !== actorId) {
        await notifyUserRecipients(client, [{
          user_id: report.reported_by,
          title: 'Report reviewed',
          message: status === 'resolved'
            ? 'The team reviewed your report and marked it as resolved.'
            : 'The team reviewed your report and dismissed it.',
          type: 'report_update',
          link: '/info/user/notifications',
        }], 'Report decision')
      }
      await writeAudit(client, actorId, action, 'info_moderation', reportId, { status, reason })
      return respond({ success: true })
    }

    if (action === 'ban-user') {
      const userId = String(body.userId || '')
      const reason = String(body.reason || '').trim()
      const durationDays = body.durationDays == null || body.durationDays === '' ? null : Number(body.durationDays)
      const banType = BAN_TYPES.includes(body.banType) ? body.banType : 'posting'
      const reportId = body.reportId == null || body.reportId === '' ? null : String(body.reportId)
      const actorRole = normalizeStaffRole(authorization.session.role)
      if (!userId || userId === actorId || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'Select another user and provide a valid ban reason.' }, 400)
      }
      if (reportId && !isValidUuid(reportId)) {
        return respond({ success: false, message: 'A valid related report is required.' }, 400)
      }
      if (banType === 'suspension' && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
        return respond({ success: false, message: 'A temporary suspension must be between 1 and 365 days.' }, 400)
      }
      if (banType === 'permanent' && (durationDays !== null || body.confirmPermanentBan !== true)) {
        return respond({ success: false, message: 'Confirm the permanent account ban and do not provide a duration.' }, 400)
      }
      if (banType === 'posting' && durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
        return respond({ success: false, message: 'A temporary restriction must be between 1 and 365 days.' }, 400)
      }
      const { data: target, error: targetError } = await client.from('info_users').select('id, user_type').eq('id', userId).maybeSingle()
      if (targetError) throw targetError
      if (!target) return respond({ success: false, message: 'User not found.' }, 404)
      if (['admin', 'administrator', 'tourism_officer', 'moderator'].includes(String(target.user_type || '').toLowerCase())) {
        return respond({ success: false, message: 'Staff accounts cannot be restricted through community moderation.' }, 400)
      }
      if (banType === 'suspension' || banType === 'permanent') {
        if (!['moderator', 'admin'].includes(actorRole)) {
          return respond({ success: false, message: 'Only Moderators or System Administrators can suspend or ban accounts.' }, 403)
        }
        const newStatus = banType === 'suspension' ? 'suspended' : 'banned'
        const { data: decision, error } = await client.rpc('admin_set_account_status', {
          p_admin_id: actorId,
          p_user_id: userId,
          p_new_status: newStatus,
          p_reason: reason,
          p_duration_days: durationDays,
          p_report_id: reportId,
        })
        if (error) {
          if (/already has an active restriction|already has an active permanent ban|already has this status|not eligible|open report/i.test(error.message || '')) {
            return respond({ success: false, message: error.message }, 409)
          }
          if (/Only an active System Administrator or Moderator/i.test(error.message || '')) {
            return respond({ success: false, message: error.message }, 403)
          }
          if (/reason|required|duration|moderator|administrator|staff account/i.test(error.message || '')) {
            return respond({ success: false, message: error.message }, 400)
          }
          throw error
        }

        let sessionRevocationWarning = null
        if (newStatus === 'banned') {
          try {
            await revokeUserSessions(client, userId)
          } catch (revokeError) {
            console.error('Session revocation after moderator account ban failed:', { code: revokeError.code || null })
            sessionRevocationWarning = 'The ban was saved, but existing sessions could not be revoked.'
          }
        }
        return respond({
          success: true,
          action: decision,
          message: banType === 'suspension'
            ? 'Account suspension saved with reason, duration, notification, and audit history.'
            : 'Permanent account ban saved with reason, notification, and audit history.',
          sessionRevocationWarning,
        })
      }
      const { data: restriction, error } = await client.rpc('create_account_restriction', {
        p_user_id: userId,
        p_actor_id: actorId,
        p_reason: reason,
        p_duration_days: durationDays,
        p_ban_type: banType,
      })
      if (error) {
        if (error.message?.includes('already has an active restriction')
          || error.message?.includes('not eligible')) {
          return respond({ success: false, message: error.message }, 409)
        }
        throw error
      }
      await writeAudit(client, actorId, action, 'admin_user_bans', restriction.id, {
        userId,
        reason,
        durationDays,
        banType,
        lifted_at: null,
      })

      const untilText = durationDays ? ` for ${durationDays} day${durationDays === 1 ? '' : 's'}` : ''
      const { error: noticeError } = await client.from('info_notifications').insert({
        user_id: userId,
        title: banType === 'suspension' ? 'Account suspended' : 'Posting restricted',
        message: banType === 'suspension'
          ? `Your account has been suspended${untilText}. Reason: ${reason}`
          : `You cannot publish posts, comments or replies${untilText}. Reason: ${reason} You can appeal from Moderation appeals.`,
        type: 'warning',
        is_read: false,
        link: '/info/user/moderation-appeals',
      })
      if (noticeError) console.error('Restriction notification failed:', noticeError)

      // A suspension also ends every open session; sign-in is refused until it expires.
      if (banType === 'suspension') {
        try {
          await revokeUserSessions(client, userId)
        } catch (revokeError) {
          console.error('Session revocation after suspension failed:', revokeError)
        }
      }
      return respond({ success: true })
    }

    if (action === 'unban-user') {
      const userId = String(body.userId || '')
      const reason = String(body.reason || '').trim()
      if (!isValidUuid(userId) || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'Select an account and provide a reason for lifting its restriction.' }, 400)
      }
      const { data: activeRestriction, error: restrictionError } = await client
        .from('admin_user_bans')
        .select('ban_type')
        .eq('user_id', userId)
        .is('lifted_at', null)
        .order('banned_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (restrictionError) throw restrictionError
      if (activeRestriction && activeRestriction.ban_type !== 'posting') {
        return respond({
          success: false,
          message: activeRestriction?.ban_type === 'permanent'
            ? 'Permanent bans can only be reversed through Administrator Account Oversight.'
            : 'Account suspensions can only be lifted through Administrator Account Oversight.',
        }, 403)
      }
      const { data: lifted, error } = await client.rpc('lift_account_restriction', {
        p_user_id: userId,
        p_actor_id: actorId,
        p_reason: reason,
      })
      if (error) {
        if (error.message?.includes('no active restriction')
          || error.message?.includes('already been lifted')
          || error.message?.includes('cannot be restored')) {
          return respond({ success: false, message: error.message }, 409)
        }
        throw error
      }

      let emailNotification = { sent: false, reason: 'not_sent' }
      try {
        const { data: target, error: targetError } = await client
          .from('info_users')
          .select('email')
          .eq('id', userId)
          .maybeSingle()
        if (targetError) throw targetError
        emailNotification = await sendRestrictionLiftedEmail(target?.email, {
          banType: lifted.ban_type,
          reason,
        })
      } catch (emailError) {
        console.error('Restriction lift email notification failed:', { code: emailError.code || null })
      }

      const { error: emailAuditError } = await client
        .from('info_audit_log')
        .insert({
          user_id: actorId,
          action: 'restriction-lift-email-notification',
          table_name: 'admin_user_bans',
          record_id: lifted.id,
          changes: {
            userId,
            restrictionType: lifted.ban_type,
            restrictionReason: lifted.restriction_reason,
            liftReason: reason,
            reviewerId: actorId,
            liftedAt: lifted.lifted_at,
            ...(lifted.ban_type === 'suspension' ? { accountStatus: 'active' } : {}),
            emailNotificationSent: emailNotification.sent,
            emailNotificationReason: emailNotification.sent ? null : emailNotification.reason,
          },
        })
      if (emailAuditError) {
        console.error('Restriction lift email audit update failed:', { code: emailAuditError.code || null })
      }

      let sessionRevocationWarning = null
      if (lifted.ban_type === 'suspension') {
        try {
          await revokeUserSessions(client, userId)
        } catch (revokeError) {
          console.error('Session revocation after suspension lift failed:', revokeError)
          sessionRevocationWarning = 'The suspension was lifted, but the prior restricted session could not be revoked.'
        }
      }

      return respond({
        success: true,
        restriction: lifted,
        emailNotificationSent: emailNotification.sent,
        emailNotificationReason: emailNotification.sent ? null : emailNotification.reason,
        sessionRevocationWarning,
      })
    }

    return respond({ success: false, message: 'Unsupported moderation action.' }, 400)
  } catch (error) {
    console.error('Moderation action failed:', error)
    return respond({ success: false, message: 'Unable to save the moderation action and audit record.' }, 500)
  }
}
