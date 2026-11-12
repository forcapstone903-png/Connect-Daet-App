import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

async function getCount(client, status, adminId) {
  let query = client.from('info_blogs').select('id', { count: 'exact', head: true })
  if (status) query = query.eq('approval_status', status)
  if (status === 'approved') query = query.eq('status', 'published')
  if (status === 'draft') query = query.eq('created_by', adminId)
  if (!status) query = query.or(`approval_status.neq.draft,created_by.eq.${adminId}`)
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

async function getPeople(client, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map()

  const { data, error } = await client
    .from('info_users')
    .select('id, full_name, email, profile_image_url')
    .in('id', ids)
  if (error) throw error
  return new Map((data || []).map((person) => [person.id, person]))
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response

  const client = getAdminClient()
  if (!client) {
    return NextResponse.json({ success: false, message: 'Blog moderation is not configured.' }, { status: 500 })
  }

  const params = new URL(request.url).searchParams
  try {
    const [totalPosts, pendingApprovals, approvedPosts, rejectedPosts, changesRequested, draftPosts, reportedResult] = await Promise.all([
      getCount(client, null, authorization.session.user_id),
      getCount(client, 'pending', authorization.session.user_id),
      getCount(client, 'approved', authorization.session.user_id),
      getCount(client, 'rejected', authorization.session.user_id),
      getCount(client, 'changes_requested', authorization.session.user_id),
      getCount(client, 'draft', authorization.session.user_id),
      client.from('info_moderation')
        .select('id', { count: 'exact', head: true })
        .eq('reported_item_table', 'info_blogs')
        .in('status', ['pending', 'reviewing']),
    ])
    if (reportedResult.error) throw reportedResult.error

    if (params.get('view') === 'history') {
      const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1)
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(params.get('pageSize') || '25', 10) || 25))
      let historyQuery = client
        .from('blog_moderation_history')
        .select('id, blog_id, blog_title, blog_author_id, reviewed_by, action, reason, previous_status, new_status, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
      const blogId = params.get('blogId')
      if (blogId) historyQuery = historyQuery.eq('blog_id', blogId)
      const { data, count, error } = await historyQuery.range((page - 1) * pageSize, page * pageSize - 1)
      if (error) throw error

      const people = await getPeople(client, (data || []).flatMap((entry) => [entry.blog_author_id, entry.reviewed_by]))
      const history = (data || []).map((entry) => ({
        ...entry,
        author: people.get(entry.blog_author_id) || null,
        reviewer: people.get(entry.reviewed_by) || null,
      }))
      return NextResponse.json({
        success: true,
        history,
        pagination: { page, pageSize, total: count || 0, pages: Math.ceil((count || 0) / pageSize) },
        stats: { totalPosts, pendingApprovals, approvedPosts, rejectedPosts, changesRequested, draftPosts, reportedPosts: reportedResult.count || 0 },
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const status = params.get('status') || 'pending'
    if (!['all', 'pending', 'approved', 'rejected', 'changes_requested', 'reported', 'draft'].includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid approval status filter.' }, { status: 400 })
    }
    const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(params.get('pageSize') || '10', 10) || 10))
    const search = (params.get('search') || '').trim().slice(0, 120)
    const category = (params.get('category') || '').trim().slice(0, 80)
    const submittedFrom = params.get('submittedFrom') || ''
    const submittedTo = params.get('submittedTo') || ''
    const direction = params.get('direction') === 'asc'
    const isDate = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const date = new Date(`${value}T00:00:00.000Z`)
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    }

    if ((submittedFrom && !isDate(submittedFrom)) || (submittedTo && !isDate(submittedTo))) {
      return NextResponse.json({ success: false, message: 'Invalid submission date filter.' }, { status: 400 })
    }
    if (submittedFrom && submittedTo && submittedFrom > submittedTo) {
      return NextResponse.json({ success: false, message: 'The start date must be on or before the end date.' }, { status: 400 })
    }

    let reportedIds = null
    let reportsByBlog = new Map()
    if (status === 'reported') {
      const { data: reports, error: reportsError } = await client
        .from('info_moderation')
        .select('id, reported_item_id, reason, description, created_at')
        .eq('reported_item_table', 'info_blogs')
        .in('status', ['pending', 'reviewing'])
        .not('reported_item_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (reportsError) throw reportsError
      reportsByBlog = new Map()
      for (const report of reports || []) {
        const existing = reportsByBlog.get(report.reported_item_id) || []
        existing.push(report)
        reportsByBlog.set(report.reported_item_id, existing)
      }
      reportedIds = [...reportsByBlog.keys()]
      if (!reportedIds.length) {
        return NextResponse.json({
          success: true,
          posts: [],
          pagination: { page, pageSize, total: 0, pages: 0 },
          stats: { totalPosts, pendingApprovals, approvedPosts, rejectedPosts, changesRequested, draftPosts, reportedPosts: reportedResult.count || 0 },
        }, { headers: { 'Cache-Control': 'private, no-store' } })
      }
    }

    let authorIds = []
    if (search) {
      const authorPattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
      const [nameResult, emailResult] = await Promise.all([
        client.from('info_users').select('id').ilike('full_name', authorPattern).limit(1000),
        client.from('info_users').select('id').ilike('email', authorPattern).limit(1000),
      ])
      if (nameResult.error) throw nameResult.error
      if (emailResult.error) throw emailResult.error
      authorIds = [...new Set([...(nameResult.data || []), ...(emailResult.data || [])].map((person) => person.id))]
    }

    let query = client
      .from('info_blogs')
      .select('id, title, excerpt, content, category, featured_image, status, approval_status, submitted_at, reviewed_at, reviewed_by, rejection_reason, created_by, created_at, updated_at, published_at', { count: 'exact' })
      .order('submitted_at', { ascending: direction, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (status !== 'all' && status !== 'reported') query = query.eq('approval_status', status)
    if (status === 'approved') query = query.eq('status', 'published')
    if (reportedIds) query = query.in('id', reportedIds)
    if (search) {
      const titleTerm = search.replace(/[\\,*()]/g, '\\$&')
      const adminId = authorization.session.user_id
      const searchFilters = [
        `and(approval_status.neq.draft,title.ilike.*${titleTerm}*)`,
        `and(created_by.eq.${adminId},title.ilike.*${titleTerm}*)`,
      ]
      if (authorIds.length) {
        const authorsFilter = `created_by.in.(${authorIds.join(',')})`
        searchFilters.push(
          `and(approval_status.neq.draft,${authorsFilter})`,
          `and(created_by.eq.${adminId},${authorsFilter})`,
        )
      }
      query = query.or(searchFilters.join(','))
    } else {
      query = query.or(`approval_status.neq.draft,created_by.eq.${authorization.session.user_id}`)
    }
    if (category) query = query.eq('category', category)
    if (submittedFrom) query = query.gte('submitted_at', `${submittedFrom}T00:00:00.000Z`)
    if (submittedTo) {
      const endExclusive = new Date(`${submittedTo}T00:00:00.000Z`)
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
      query = query.lt('submitted_at', endExclusive.toISOString())
    }

    const { data, count, error } = await query
    if (error) throw error

    const people = await getPeople(client, (data || []).flatMap((post) => [post.created_by, post.reviewed_by]))
    const posts = (data || []).map((post) => ({
      ...post,
      author: people.get(post.created_by) || null,
      reviewer: people.get(post.reviewed_by) || null,
      reports: reportsByBlog.get(post.id) || [],
    }))

    return NextResponse.json({
      success: true,
      posts,
      adminId: authorization.session.user_id,
      pagination: { page, pageSize, total: count || 0, pages: Math.ceil((count || 0) / pageSize) },
      stats: { totalPosts, pendingApprovals, approvedPosts, rejectedPosts, changesRequested, draftPosts, reportedPosts: reportedResult.count || 0 },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Admin blog moderation list failed:', error)
    return NextResponse.json({ success: false, message: 'Unable to load blog moderation data.' }, { status: 500 })
  }
}
