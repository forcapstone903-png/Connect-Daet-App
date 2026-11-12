import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { buildAnalyticsTables, parseAnalyticsDays, parseTrafficBucket } from '@/lib/adminAnalytics.mjs'
import { normalizeStaffRole } from '@/lib/staffRoles.mjs'
import { createPdfBuffer, createWorkbookBuffer } from '@/lib/reportExport'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function respond(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function createWorkbook(report, isAdministrator) {
  return createWorkbookBuffer(buildAnalyticsTables(report, { includeStaffActivity: isAdministrator }), {
    creator: 'Connect Daet Analytics',
    createdAt: new Date(report.generatedAt),
  })
}

function createPdf(report, isAdministrator) {
  const grouping = { day: 'daily', week: 'weekly', month: 'monthly' }[report.trafficBucket] || 'daily'
  return createPdfBuffer({
    title: 'Connect Daet - Analytics Report',
    subtitle: `Last ${report.days} days (${grouping} traffic) | Generated ${new Date(report.generatedAt).toLocaleString('en-PH', { timeZone: 'UTC' })} UTC`,
    tables: buildAnalyticsTables(report, { includeStaffActivity: isAdministrator }),
  })
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response

  const query = new URL(request.url).searchParams
  const days = parseAnalyticsDays(query.get('days'))
  const format = query.get('format')
  const bucket = parseTrafficBucket(query.get('bucket'))
  if (bucket == null) return respond({ success: false, message: 'Choose daily, weekly, or monthly traffic.' }, 400)
  if (days == null) return respond({ success: false, message: 'Choose a 7, 30, or 90 day reporting period.' }, 400)
  if (format && !['xlsx', 'pdf'].includes(format)) {
    return respond({ success: false, message: 'Choose a supported export format.' }, 400)
  }

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Analytics are not configured.' }, 500)

  try {
    const countRows = (table, column, values) => client.from(table).select('id', { count: 'exact', head: true }).in(column, values)
    const [reportResult, bucketResult, forumResult, communityResult, alertsResult] = await Promise.all([
      client.rpc('get_admin_analytics_report', { p_days: days }),
      bucket === 'day' ? Promise.resolve({ data: null, error: null }) : client.rpc('get_site_traffic_buckets', { p_days: days, p_bucket: bucket }),
      countRows('forum_threads', 'status', ['published', 'closed']),
      countRows('info_user_posts', 'status', ['published', 'approved']),
      client.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
    ])
    const { data, error } = reportResult
    if (error) throw error
    if (!data || typeof data !== 'object') throw new Error('The analytics report returned no data.')
    if (bucketResult.error) {
      console.error('Traffic bucket query failed:', bucketResult.error)
      return respond({ success: false, message: 'Weekly and monthly traffic need database migration 102.' }, 500)
    }
    for (const result of [forumResult, communityResult, alertsResult]) {
      if (result.error) console.error('Analytics total count failed:', { code: result.error.code || null })
    }
    const totalBlogs = Number(data.summary?.totalBlogs) || 0
    const totalForumThreads = forumResult.error ? null : forumResult.count || 0
    const totalCommunityPosts = communityResult.error ? null : communityResult.count || 0

    const isAdministrator = normalizeStaffRole(authorization.session.role) === 'admin'
    const analytics = {
      ...data,
      staffActivity: isAdministrator ? (data.staffActivity || []) : [],
      trafficBucket: bucket,
      traffic: bucket === 'day' ? data.traffic || [] : bucketResult.data || [],
      summary: {
        ...data.summary,
        totalForumThreads,
        totalCommunityPosts,
        totalPosts: totalBlogs + (totalForumThreads || 0) + (totalCommunityPosts || 0),
        totalAlertsSent: alertsResult.error ? null : alertsResult.count || 0,
      },
    }

    if (!format) return respond({ success: true, analytics })

    const date = new Date().toISOString().slice(0, 10)
    const filename = `connect-daet-analytics-${days}-days-${bucket}-${date}.${format}`
    if (format === 'xlsx') {
      const workbook = await createWorkbook(analytics, isAdministrator)
      return new NextResponse(workbook, {
        headers: {
          ...NO_STORE_HEADERS,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    const pdf = await createPdf(analytics, isAdministrator)
    return new NextResponse(pdf, {
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Admin analytics report failed:', error)
    return respond({ success: false, message: 'Unable to load or export analytics right now.' }, 500)
  }
}
