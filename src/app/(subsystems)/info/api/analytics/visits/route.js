import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { isValidAnalyticsVisitorId, normalizeTrackedPublicPath } from '@/lib/siteAnalytics'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

function isSameOriginRequest(request) {
  const origin = request.headers.get('origin')
  if (!origin) return false

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export async function GET(request) {
  const session = getServerSession(request)
  if (!session?.user_id) {
    return response({ success: false, message: 'Administrator access is required.' }, 401)
  }

  if (String(session.role || '').trim().toLowerCase() !== 'admin') {
    return response({ success: false, message: 'Administrator access is required.' }, 403)
  }

  if (!adminSupabase) {
    return response({ success: false, message: 'Visitor analytics is not configured.' }, 500)
  }

  try {
    const [visitorResult, destinationResult] = await Promise.all([
      adminSupabase.rpc('get_site_visit_metrics', { p_days: 30 }),
      adminSupabase.rpc('get_popular_tourist_spots', { p_days: 30 }),
    ])
    if (visitorResult.error) throw visitorResult.error
    if (destinationResult.error) {
      console.error('Popular destination analytics read failed:', destinationResult.error)
    }

    return response({
      success: true,
      metrics: visitorResult.data,
      popularDestinations: destinationResult.error ? null : destinationResult.data,
    })
  } catch (error) {
    console.error('Site visit analytics read failed:', error)
    return response({ success: false, message: 'Unable to load visitor statistics.' }, 500)
  }
}

export async function POST(request) {
  if (!isSameOriginRequest(request)) {
    return response({ success: false, message: 'Same-origin request required.' }, 403)
  }

  if (!adminSupabase) {
    return response({ success: false, message: 'Visitor analytics is not configured.' }, 500)
  }

  try {
    const body = await request.json()
    const visitorId = body?.visitorId
    const pagePath = normalizeTrackedPublicPath(body?.pathname)

    if (!isValidAnalyticsVisitorId(visitorId) || !pagePath) {
      return response({ success: false, message: 'Invalid visitor analytics event.' }, 400)
    }

    const visitorHash = createHash('sha256').update(visitorId.toLowerCase()).digest('hex')
    const { error } = await adminSupabase.rpc('record_site_page_view', {
      p_visitor_hash: visitorHash,
      p_page_path: pagePath,
    })

    if (error) throw error
    return response({ success: true })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return response({ success: false, message: 'Invalid request body.' }, 400)
    }

    console.error('Site visit analytics write failed:', error)
    return response({ success: false, message: 'Unable to record this page view.' }, 500)
  }
}
