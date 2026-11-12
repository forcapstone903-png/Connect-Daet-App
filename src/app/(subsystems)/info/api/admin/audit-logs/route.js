import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  : null

function jsonResponse(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function isDate(value) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return jsonResponse({ success: false, message: 'System audit logs are not configured.' }, 503)

  const params = new URL(request.url).searchParams
  const requestedPage = Number.parseInt(params.get('page') || '1', 10)
  const requestedLimit = Number.parseInt(params.get('limit') || '25', 10)
  const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1
  const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 25
  const action = String(params.get('activityType') || '').trim().slice(0, 60)
  const search = String(params.get('search') || '').trim().replace(/[^a-zA-Z0-9\s@.-]/g, '').slice(0, 100)
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  const before = params.get('before') || ''

  if (!isDate(from) || !isDate(to)) {
    return jsonResponse({ success: false, message: 'Date filters must use YYYY-MM-DD format.' }, 400)
  }
  if (from && to && from > to) {
    return jsonResponse({ success: false, message: 'The start date must be on or before the end date.' }, 400)
  }
  if (before && (before.length > 40 || Number.isNaN(Date.parse(before)))) {
    return jsonResponse({ success: false, message: 'The export snapshot timestamp is invalid.' }, 400)
  }

  try {
    let query = adminSupabase
      .from('info_audit_log')
      .select('id, user_id, action, table_name, record_id, changes, created_at, info_users!info_audit_log_user_id_fkey(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (action) query = query.eq('action', action)
    if (search) query = query.or(`action.ilike.%${search}%,table_name.ilike.%${search}%`)
    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`)
    if (before) query = query.lte('created_at', before)
    if (to) {
      const toExclusive = new Date(`${to}T00:00:00.000Z`)
      toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)
      query = query.lt('created_at', toExclusive.toISOString())
    }

    const start = (page - 1) * limit
    const { data, error, count } = await query.range(start, start + limit - 1)
    if (error) throw error

    return jsonResponse({
      success: true,
      activities: (data || []).map((item) => ({
        id: item.id,
        user_id: item.user_id,
        activity_type: item.action,
        entity_type: item.table_name,
        entity_id: item.record_id,
        description: item.changes && Object.keys(item.changes).length
          ? JSON.stringify(item.changes)
          : '',
        created_at: item.created_at,
        info_users: item.info_users,
      })),
      total: count || 0,
      page,
      limit,
    })
  } catch (error) {
    console.error('System audit log read failed:', { code: error.code || null })
    return jsonResponse({ success: false, message: 'Unable to load system audit logs.' }, 500)
  }
}
