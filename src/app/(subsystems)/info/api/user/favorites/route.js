import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FAVORITE_TYPES = new Set(['blog', 'event', 'spot', 'forum', 'user_post', 'announcement'])
const FAVORITES_PAGE_SIZE = 100
const noCacheHeaders = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
}

function failure(message, status) {
  return NextResponse.json({ success: false, message }, { status, headers: noCacheHeaders })
}

function normalizeFavoriteType(value) {
  if (value === 'post') return 'user_post'
  if (value === 'tourist_spot') return 'spot'
  if (value === 'forum_thread') return 'forum'
  return value
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return failure('User session is required.', 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return failure('Saved items service is not configured.', 500)

  try {
    const params = new URL(request.url).searchParams
    const page = params.has('page') ? Number(params.get('page')) : 1
    const requestedPageSize = params.has('pageSize')
      ? Number(params.get('pageSize'))
      : FAVORITES_PAGE_SIZE
    if (!Number.isSafeInteger(page) || page < 1) return failure('A valid page number is required.', 400)
    if (!Number.isSafeInteger(requestedPageSize) || requestedPageSize < 1) {
      return failure('A valid page size is required.', 400)
    }

    const pageSize = Math.min(FAVORITES_PAGE_SIZE, requestedPageSize)
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      return failure('The requested page is out of range.', 400)
    }

    const listFavorites = (columns) => adminSupabase
      .from('user_favorites')
      .select(columns, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(start, end)
    let { data, count, error } = await listFavorites('item_type, item_id, planned_visit_date, trip_notes')
    // Trip fields need migration 102; keep saved items working without them.
    if (error?.code === '42703') ({ data, count, error } = await listFavorites('item_type, item_id'))
    if (error) throw error

    return NextResponse.json({
      success: true,
      favorites: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        pages: Math.ceil((count || 0) / pageSize),
      },
    }, { headers: noCacheHeaders })
  } catch (error) {
    console.error('Saved items fetch failed:', error)
    return failure(error.message || 'Unable to load saved items.', 500)
  }
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return failure('User session is required.', 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return failure('Saved items service is not configured.', 500)

  let body
  try {
    body = await request.json()
  } catch {
    return failure('A valid saved item is required.', 400)
  }

  const itemType = normalizeFavoriteType(body?.itemType)
  const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : ''
  if (!FAVORITE_TYPES.has(itemType) || !isValidUuid(itemId)) {
    return failure('A valid saved item is required.', 400)
  }
  if (!['save', 'remove'].includes(body?.action)) {
    return failure('A valid saved item action is required.', 400)
  }

  try {
    const result = body.action === 'save'
      ? await adminSupabase
        .from('user_favorites')
        .upsert({ user_id: userId, item_type: itemType, item_id: itemId }, { onConflict: 'user_id,item_type,item_id' })
      : await adminSupabase
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('item_type', itemType)
        .eq('item_id', itemId)
    if (result.error) throw result.error

    return NextResponse.json({ success: true }, { headers: noCacheHeaders })
  } catch (error) {
    console.error('Saved item update failed:', error)
    return failure(error.message || 'Unable to update saved items.', 500)
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Trip planner: set or clear the planned visit date and notes on a saved item.
// Body: { itemType, itemId, plannedVisitDate: 'YYYY-MM-DD' | null, tripNotes: string }
export async function PATCH(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return failure('User session is required.', 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return failure('Saved items service is not configured.', 500)

  let body
  try {
    body = await request.json()
  } catch {
    return failure('A valid trip plan is required.', 400)
  }

  const itemType = normalizeFavoriteType(body?.itemType)
  const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : ''
  if (!FAVORITE_TYPES.has(itemType) || !isValidUuid(itemId)) return failure('A valid saved item is required.', 400)

  const plannedVisitDate = body?.plannedVisitDate ? String(body.plannedVisitDate) : null
  if (plannedVisitDate && (!DATE_PATTERN.test(plannedVisitDate) || Number.isNaN(Date.parse(`${plannedVisitDate}T00:00:00Z`)))) {
    return failure('Use a valid date (YYYY-MM-DD).', 400)
  }
  const tripNotes = typeof body?.tripNotes === 'string' ? body.tripNotes.trim().slice(0, 500) : ''

  const { data, error } = await adminSupabase
    .from('user_favorites')
    .update({ planned_visit_date: plannedVisitDate, trip_notes: tripNotes || null })
    .eq('user_id', userId)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .select('item_type, item_id, planned_visit_date, trip_notes')
    .maybeSingle()
  if (error) {
    console.error('Trip plan update failed:', error)
    return failure(error.code === '42703' ? 'Trip planning needs database migration 102.' : 'Unable to save your trip plan.', 500)
  }
  if (!data) return failure('Save this item first, then add it to your trip.', 404)
  return NextResponse.json({ success: true, favorite: data }, { headers: noCacheHeaders })
}
