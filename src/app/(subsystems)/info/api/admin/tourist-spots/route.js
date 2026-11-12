import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import {
  BULK_ACTIONS,
  LISTING_TYPE_VALUES,
  formatListingRow,
  normalizeListingInput,
} from '@/lib/listings.mjs'
import { validateListingCategory } from '@/lib/listingCategoriesServer'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const dynamic = 'force-dynamic'

const PRIVATE_NO_STORE = { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }

function json(body, status = 200) {
  return NextResponse.json(body, { status, ...PRIVATE_NO_STORE })
}

function missingConfig() {
  return json({ success: false, message: 'Server is not configured for listings administration.' }, 500)
}

async function readBody(request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return { error: json({ success: false, message: 'Cross-origin requests are not allowed.' }, 403) }
  }
  try {
    return { body: await request.json() }
  } catch {
    return { error: json({ success: false, message: 'A valid JSON request body is required.' }, 400) }
  }
}

function readIds(body) {
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.map(String))] : []
  if (!ids.length || ids.length > 200 || !ids.every((id) => UUID_PATTERN.test(id))) return null
  return ids
}

async function audit(userId, action, recordId, changes = {}) {
  const { error } = await adminSupabase.from('info_audit_log').insert({
    user_id: userId,
    action,
    table_name: 'info_tourist_spots',
    record_id: recordId,
    changes,
  })
  if (error) console.error('Listing audit log write failed:', error)
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const type = searchParams.get('type')

    let query = adminSupabase
      .from('info_tourist_spots')
      .select('*')
      .order('created_at', { ascending: false })

    if (type && LISTING_TYPE_VALUES.includes(type)) query = query.eq('listing_type', type)
    if (category && category !== 'all') query = query.eq('category', category)
    if (status && status !== 'all') query = query.eq('status', status)
    if (search) query = query.ilike('name', `%${search.replace(/[%_]/g, '\\$&')}%`)

    const { data, error } = await query
    if (error) {
      console.error('Listings fetch error:', error)
      return json({ success: false, message: 'Unable to load listings.' }, 500)
    }

    const { data: accountViewCounts, error: accountViewError } = await adminSupabase
      .rpc('get_tourist_spot_account_view_counts', { p_days: 90 })
    if (accountViewError) {
      console.error('Listing account view counts fetch error:', accountViewError)
      return json({ success: false, message: 'Unable to load listing view counts.' }, 500)
    }

    const viewCountsBySpotId = new Map(
      (accountViewCounts || []).map((item) => [String(item.tourist_spot_id), Number(item.view_count) || 0])
    )
    const spots = (data || []).map((spot) => formatListingRow(spot, viewCountsBySpotId.get(String(spot.id)) || 0))

    return json({ success: true, spots })
  } catch (error) {
    console.error('Listings list error:', error)
    return json({ success: false, message: 'Unable to fetch listings.' }, 500)
  }
}

export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  const { body, error: bodyError } = await readBody(request)
  if (bodyError) return bodyError

  const { data: listing, error: validationError } = normalizeListingInput(body)
  if (validationError) return json({ success: false, message: validationError }, 400)
  try {
    const categoryError = await validateListingCategory(adminSupabase, listing.listing_type, listing.category)
    if (categoryError) return json({ success: false, message: categoryError }, 400)
  } catch (categoryLookupError) {
    console.error('Listing category check failed:', categoryLookupError)
    return json({ success: false, message: 'Unable to verify the category right now.' }, 503)
  }

  const now = new Date().toISOString()
  const { data, error } = await adminSupabase
    .from('info_tourist_spots')
    .insert([{ ...listing, created_by: session.user_id, created_at: now, updated_at: now }])
    .select()
    .single()

  if (error) {
    console.error('Listing create error:', error)
    return json({ success: false, message: 'Unable to create the listing.' }, 500)
  }

  await audit(session.user_id, 'listing_created', data.id, { name: data.name, listing_type: data.listing_type })
  return json({ success: true, spot: formatListingRow(data) }, 201)
}

// Bulk feature / unfeature / archive / restore. Body: { ids: uuid[], action }
export async function PATCH(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  const { body, error: bodyError } = await readBody(request)
  if (bodyError) return bodyError

  const ids = readIds(body)
  const changes = BULK_ACTIONS[body?.action]
  if (!ids) return json({ success: false, message: 'Select between 1 and 200 listings.' }, 400)
  if (!changes) return json({ success: false, message: `Action must be one of: ${Object.keys(BULK_ACTIONS).join(', ')}.` }, 400)

  const { data, error } = await adminSupabase
    .from('info_tourist_spots')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id')

  if (error) {
    console.error('Listing bulk update error:', error)
    return json({ success: false, message: 'Unable to update the selected listings.' }, 500)
  }

  await audit(session.user_id, `listing_bulk_${body.action}`, null, { ids })
  return json({ success: true, updated: data?.length || 0 })
}

// Bulk delete. Body: { ids: uuid[] }
export async function DELETE(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  const { body, error: bodyError } = await readBody(request)
  if (bodyError) return bodyError

  const ids = readIds(body)
  if (!ids) return json({ success: false, message: 'Select between 1 and 200 listings.' }, 400)

  const { data, error } = await adminSupabase
    .from('info_tourist_spots')
    .delete()
    .in('id', ids)
    .select('id, name')

  if (error) {
    console.error('Listing bulk delete error:', error)
    return json({ success: false, message: 'Unable to delete the selected listings.' }, 500)
  }

  await audit(session.user_id, 'listing_bulk_deleted', null, { ids, names: (data || []).map((row) => row.name) })
  return json({ success: true, deleted: data?.length || 0 })
}
