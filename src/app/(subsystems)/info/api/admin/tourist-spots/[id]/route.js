import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { BULK_ACTIONS, formatListingRow, normalizeListingInput } from '@/lib/listings.mjs'
import { validateListingCategory } from '@/lib/listingCategoriesServer'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRIVATE_NO_STORE = { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }

export const dynamic = 'force-dynamic'

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

async function readSpotId(params) {
  const { id } = await params
  return UUID_PATTERN.test(String(id)) ? String(id) : null
}

async function getAccountViewCount(spotId) {
  const { data, error } = await adminSupabase.rpc('get_tourist_spot_account_view_counts', { p_days: 90 })
  if (error) throw error
  const spotViews = (data || []).find((item) => String(item.tourist_spot_id) === String(spotId))
  return Number(spotViews?.view_count) || 0
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

export async function GET(request, { params }) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()
  const spotId = await readSpotId(params)
  if (!spotId) return json({ success: false, message: 'Invalid listing ID.' }, 400)

  try {
    const { data, error } = await adminSupabase.from('info_tourist_spots').select('*').eq('id', spotId).maybeSingle()
    if (error) throw error
    if (!data) return json({ success: false, message: 'Listing not found.' }, 404)
    return json({ success: true, spot: formatListingRow(data, await getAccountViewCount(spotId)) })
  } catch (error) {
    console.error('Listing detail error:', error)
    return json({ success: false, message: 'Unable to load the listing.' }, 500)
  }
}

// Full update from the edit form.
export async function PUT(request, { params }) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()
  const spotId = await readSpotId(params)
  if (!spotId) return json({ success: false, message: 'Invalid listing ID.' }, 400)

  const { body, error: bodyError } = await readBody(request)
  if (bodyError) return bodyError

  const { data: listing, error: validationError } = normalizeListingInput(body)
  if (validationError) return json({ success: false, message: validationError }, 400)
  try {
    const categoryError = await validateListingCategory(adminSupabase, listing.listing_type, listing.category, { allowHidden: true })
    if (categoryError) return json({ success: false, message: categoryError }, 400)
  } catch (categoryLookupError) {
    console.error('Listing category check failed:', categoryLookupError)
    return json({ success: false, message: 'Unable to verify the category right now.' }, 503)
  }

  try {
    const { data, error } = await adminSupabase
      .from('info_tourist_spots')
      .update({ ...listing, updated_at: new Date().toISOString() })
      .eq('id', spotId)
      .select()
      .maybeSingle()
    if (error) throw error
    if (!data) return json({ success: false, message: 'Listing not found.' }, 404)

    await audit(session.user_id, 'listing_updated', spotId, { name: data.name })
    return json({ success: true, spot: formatListingRow(data, await getAccountViewCount(spotId)) })
  } catch (error) {
    console.error('Listing update error:', error)
    return json({ success: false, message: 'Unable to update the listing.' }, 500)
  }
}

// Quick actions without resending the whole form. Body: { action }
// (feature | unfeature | archive | restore)
export async function PATCH(request, { params }) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()
  const spotId = await readSpotId(params)
  if (!spotId) return json({ success: false, message: 'Invalid listing ID.' }, 400)

  const { body, error: bodyError } = await readBody(request)
  if (bodyError) return bodyError
  const changes = BULK_ACTIONS[body?.action]
  if (!changes) return json({ success: false, message: `Action must be one of: ${Object.keys(BULK_ACTIONS).join(', ')}.` }, 400)

  const { data, error } = await adminSupabase
    .from('info_tourist_spots')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', spotId)
    .select()
    .maybeSingle()
  if (error) {
    console.error('Listing quick action error:', error)
    return json({ success: false, message: 'Unable to update the listing.' }, 500)
  }
  if (!data) return json({ success: false, message: 'Listing not found.' }, 404)

  await audit(session.user_id, `listing_${body.action}`, spotId, { name: data.name })
  return json({ success: true, spot: formatListingRow(data) })
}

export async function DELETE(request, { params }) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()
  const spotId = await readSpotId(params)
  if (!spotId) return json({ success: false, message: 'Invalid listing ID.' }, 400)

  const { data, error } = await adminSupabase
    .from('info_tourist_spots')
    .delete()
    .eq('id', spotId)
    .select('id, name')
    .maybeSingle()
  if (error) {
    console.error('Listing delete error:', error)
    return json({ success: false, message: 'Unable to delete the listing.' }, 500)
  }
  if (!data) return json({ success: false, message: 'Listing not found.' }, 404)

  await audit(session.user_id, 'listing_deleted', spotId, { name: data.name })
  return json({ success: true, message: 'Listing deleted.' })
}
