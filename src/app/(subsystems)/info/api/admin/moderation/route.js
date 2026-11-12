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

const MISSING_RELATION_CODES = new Set(['42P01', 'PGRST205'])
const BAN_TYPES = ['posting', 'suspension']

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
      pendingForumReplies,
      pendingComments,
      pendingBlogComments,
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
      client.from('forum_replies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      client.from('content_comments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .neq('content_type', 'blog'),
      client.from('info_comments')
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
      pendingForumReplies,
      pendingComments,
      pendingBlogComments,
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
        pendingForumReplies: pendingForumReplies.count || 0,
        pendingComments: pendingComments.count || 0,
        pendingBlogComments: pendingBlogComments.count || 0,
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
      .in('table_name', ['info_moderation', 'admin_user_bans', 'admin_comment_mutes', 'admin_app_settings', 'content', 'report', 'user', 'info_user_posts', 'forum_threads', 'forum_replies', 'content_comments', 'info_comments', 'info_blogs'])
      .order('created_at', { ascending: false })
      .limit(50),
    client.from('user_moderation_appeals')
      .select('id, user_id, reason, status, created_at')
      .eq('status', 'pending')
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
    client.from('forum_replies').select('id, user_id, content, created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    client.from('content_comments').select('id, user_id, body, content_type, content_id, created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    client.from('info_comments').select('id, user_id, content, blog_id, created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
  ])
  const pendingError = pendingResults.find((result) => result.error)
  if (pendingError) {
    console.error('Pending submission load failed:', pendingError.error)
    return respond({ success: false, message: 'Unable to load pending submissions.' }, 500)
  }
  const pendingSubmissions = [
    ...(pendingResults[0].data || []).map((item) => ({ ...item, table: 'info_user_posts', userId: item.user_id, title: item.title, content: item.content, label: 'Community post' })),
    ...(pendingResults[1].data || []).map((item) => ({ ...item, table: 'forum_threads', userId: item.created_by, title: item.title, content: item.content, label: 'Forum topic' })),
    ...(pendingResults[2].data || []).map((item) => ({ ...item, table: 'forum_replies', userId: item.user_id, title: 'Forum reply', content: item.content, label: 'Forum reply' })),
    ...(pendingResults[3].data || []).map((item) => ({ ...item, table: 'content_comments', userId: item.user_id, title: 'Comment', content: item.body, label: 'Comment' })),
    ...(pendingResults[4].data || []).map((item) => ({ ...item, table: 'info_comments', userId: item.user_id, title: 'Blog comment', content: item.content, label: 'Blog comment' })),
  ].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const pendingUserIds = [...new Set(pendingSubmissions.map((item) => item.userId).filter(Boolean))]

  const userIds = [...new Set([
    ...(reports || []).flatMap((report) => [report.reported_by, report.reported_user_id]),
    ...(bans || []).flatMap((ban) => [ban.user_id, ban.banned_by]),
    ...(appeals || []).map((appeal) => appeal.user_id),
    ...(logs || []).map((entry) => entry.user_id),
    ...pendingUserIds,
  ].filter(Boolean))]
  const { data: users, error: usersError } = userIds.length
    ? await client.from('info_users').select('id, full_name, email').in('id', userIds)
    : { data: [], error: null }
  if (usersError) return respond({ success: false, message: 'Unable to load moderation user details.' }, 500)
  const people = new Map((users || []).map((user) => [user.id, user]))

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
    appeals: (appeals || []).map((appeal) => ({ ...appeal, user: people.get(appeal.user_id) || null })),
    profanityTerms,
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
        forum_replies: { approve: 'active', reject: 'rejected' },
        content_comments: { approve: 'active', reject: 'rejected' },
        info_comments: { approve: 'approved', reject: 'rejected' },
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

    if (action === 'warn-user') {
      const userId = String(body.userId || '')
      const reason = String(body.reason || '').trim()
      if (!userId || userId === actorId || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'Select another user and provide a valid warning.' }, 400)
      }
      const { data: target, error: targetError } = await client.from('info_users').select('id, user_type').eq('id', userId).maybeSingle()
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
      await writeAudit(client, actorId, action, 'info_users', userId, { reason, reportId })
      return respond({ success: true })
    }

    if (action === 'review-appeal') {
      const appealId = String(body.appealId || '')
      const decision = String(body.decision || '')
      const reason = String(body.reason || '').trim()
      if (!isValidUuid(appealId) || !['approve', 'reject'].includes(decision) || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'Provide a valid appeal decision and reason.' }, 400)
      }
      const { data, error } = await client.rpc('review_user_moderation_appeal', {
        p_appeal_id: appealId,
        p_reviewer_id: actorId,
        p_decision: decision,
        p_reason: reason,
      })
      if (error) throw error
      return respond({ success: true, appeal: data })
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

    if (action === 'approve-account-report') {
      const reportId = String(body.reportId || '')
      const reason = String(body.reason || '').trim()
      const severity = String(body.severity || '')
      if (!isValidUuid(reportId) || !reason || reason.length > 1000 || !['low', 'medium', 'high', 'critical'].includes(severity)) {
        return respond({ success: false, message: 'Provide a valid account report decision, severity, and reason.' }, 400)
      }

      const { data: report, error: reportError } = await client.from('info_moderation')
        .select('id, reported_user_id, reported_item_id, reported_item_table, status')
        .eq('id', reportId)
        .in('status', ['pending', 'reviewing'])
        .maybeSingle()
      if (reportError) throw reportError
      if (!report) return respond({ success: false, message: 'This report is no longer open.' }, 409)
      if (report.reported_item_table !== 'info_users' || report.reported_item_id !== report.reported_user_id) {
        return respond({ success: false, message: 'Only reports against a user account can suspend an account.' }, 400)
      }

      const { data: target, error: targetError } = await client.from('info_users')
        .select('id, user_type')
        .eq('id', report.reported_user_id)
        .maybeSingle()
      if (targetError) throw targetError
      if (!target) return respond({ success: false, message: 'The reported account no longer exists.' }, 404)
      if (['admin', 'administrator', 'tourism_officer', 'moderator'].includes(String(target.user_type || '').toLowerCase())) {
        return respond({ success: false, message: 'Staff accounts cannot be suspended through community reports.' }, 400)
      }

      const { data: suspension, error: suspensionError } = await client.rpc('approve_account_report_and_suspend', {
        p_report_id: reportId,
        p_reviewer_id: actorId,
        p_reason: reason,
        p_severity: severity,
      })
      if (suspensionError) throw suspensionError

      let sessionRevocationWarning = null
      try {
        await revokeUserSessions(client, target.id)
      } catch (revokeError) {
        console.error('Session revocation after account report suspension failed:', revokeError)
        sessionRevocationWarning = 'The account suspension was saved, but existing sessions could not be revoked.'
      }
      return respond({
        success: true,
        suspension,
        sessionRevocationWarning,
      })
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
      if (action === 'resolve-report') {
        const { data: report, error: reportError } = await client.from('info_moderation')
          .select('reported_item_table')
          .eq('id', reportId)
          .in('status', ['pending', 'reviewing'])
          .maybeSingle()
        if (reportError) throw reportError
        if (!report) return respond({ success: false, message: 'This report is no longer open.' }, 409)
        if (report.reported_item_table === 'info_users') {
          return respond({ success: false, message: 'Approve the account report to apply the suspension, or dismiss it.' }, 400)
        }
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
      await writeAudit(client, actorId, action, 'info_moderation', reportId, { status, reason })
      return respond({ success: true })
    }

    if (action === 'ban-user') {
      const userId = String(body.userId || '')
      const reason = String(body.reason || '').trim()
      const durationDays = body.durationDays == null || body.durationDays === '' ? null : Number(body.durationDays)
      const banType = BAN_TYPES.includes(body.banType) ? body.banType : 'posting'
      if (!userId || userId === actorId || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'Select another user and provide a valid ban reason.' }, 400)
      }
      if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
        return respond({ success: false, message: 'A temporary restriction must be between 1 and 365 days.' }, 400)
      }
      const { data: target, error: targetError } = await client.from('info_users').select('id, user_type').eq('id', userId).maybeSingle()
      if (targetError) throw targetError
      if (!target) return respond({ success: false, message: 'User not found.' }, 404)
      if (['admin', 'administrator', 'tourism_officer', 'moderator'].includes(String(target.user_type || '').toLowerCase())) {
        return respond({ success: false, message: 'Staff accounts cannot be restricted through community moderation.' }, 400)
      }
      const { error } = await client.from('admin_user_bans').upsert({
        user_id: userId,
        reason,
        banned_by: actorId,
        banned_at: now,
        expires_at: durationDays ? new Date(Date.now() + durationDays * 86400000).toISOString() : null,
        lifted_by: null,
        lifted_at: null,
        ban_type: banType,
      }, { onConflict: 'user_id' })
      if (error) throw error
      await writeAudit(client, actorId, action, 'admin_user_bans', userId, { reason, durationDays, banType, lifted_at: null })

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
      if (!userId) return respond({ success: false, message: 'A user is required.' }, 400)
      const { data, error } = await client.from('admin_user_bans')
        .update({ lifted_by: actorId, lifted_at: now })
        .eq('user_id', userId)
        .is('lifted_at', null)
        .select('user_id')
        .maybeSingle()
      if (error) throw error
      if (!data) return respond({ success: false, message: 'This user is not currently blocked.' }, 409)
      await writeAudit(client, actorId, action, 'admin_user_bans', userId, { lifted_at: now })
      return respond({ success: true })
    }

    return respond({ success: false, message: 'Unsupported moderation action.' }, 400)
  } catch (error) {
    console.error('Moderation action failed:', error)
    return respond({ success: false, message: 'Unable to save the moderation action and audit record.' }, 500)
  }
}
