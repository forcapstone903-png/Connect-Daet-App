import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { getSettingsClient } from '@/lib/appSettingsServer'
import { LISTING_TYPE_VALUES } from '@/lib/listings.mjs'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }
const respond = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const MISSING = 'Managed categories need database migration 102.'

async function readBody(request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return { error: respond({ success: false, message: 'Cross-origin requests are not allowed.' }, 403) }
  }
  try {
    return { body: await request.json() }
  } catch {
    return { error: respond({ success: false, message: 'A valid JSON request body is required.' }, 400) }
  }
}

function setup() {
  const client = getSettingsClient()
  return client ? { client } : { error: respond({ success: false, message: 'Categories are not configured on the server.' }, 500) }
}

async function audit(client, userId, action, recordId, changes) {
  const { error } = await client.from('info_audit_log').insert({
    user_id: userId, action, table_name: 'listing_categories', record_id: recordId, changes,
  })
  if (error) console.error('Listing category audit failed:', error)
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const { client, error: setupError } = setup()
  if (setupError) return setupError

  const [categories, usage] = await Promise.all([
    client.from('listing_categories').select('*').order('listing_type').order('sort_order').order('name'),
    client.from('info_tourist_spots').select('listing_type, category').limit(5000),
  ])
  if (categories.error) {
    console.error('Listing category list failed:', categories.error)
    return respond({ success: false, message: MISSING }, 500)
  }
  const counts = new Map()
  for (const row of usage.data || []) {
    const key = `${row.listing_type}|${String(row.category || '').trim().toLowerCase()}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return respond({
    success: true,
    categories: (categories.data || []).map((category) => ({
      ...category,
      usage: counts.get(`${category.listing_type}|${category.slug}`) || 0,
    })),
  })
}

export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const { client, error: setupError } = setup()
  if (setupError) return setupError
  const { body, error } = await readBody(request)
  if (error) return error

  const listingType = String(body?.listing_type || '')
  const name = String(body?.name || '').trim().slice(0, 60)
  const slug = name.toLowerCase().replace(/\s+/g, ' ').slice(0, 50)
  if (!LISTING_TYPE_VALUES.includes(listingType)) return respond({ success: false, message: 'Choose a listing type.' }, 400)
  if (!slug) return respond({ success: false, message: 'Category name is required.' }, 400)

  const { data, error: insertError } = await client
    .from('listing_categories')
    .upsert({ listing_type: listingType, slug, name, is_active: true, updated_at: new Date().toISOString() }, { onConflict: 'listing_type,slug' })
    .select('*')
    .single()
  if (insertError) {
    console.error('Listing category create failed:', insertError)
    return respond({ success: false, message: MISSING }, 500)
  }
  await audit(client, session.user_id, 'listing_category_saved', data.id, { listing_type: listingType, slug })
  return respond({ success: true, category: data }, 201)
}

// Body: { id, name?, is_active?, sort_order? } — renaming keeps the slug so
// listings that already use the category stay valid.
export async function PATCH(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const { client, error: setupError } = setup()
  if (setupError) return setupError
  const { body, error } = await readBody(request)
  if (error) return error

  const id = String(body?.id || '')
  if (!isValidUuid(id)) return respond({ success: false, message: 'A valid category is required.' }, 400)
  const update = { updated_at: new Date().toISOString() }
  if (body?.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60)
    if (!name) return respond({ success: false, message: 'Category name is required.' }, 400)
    update.name = name
  }
  if (typeof body?.is_active === 'boolean') update.is_active = body.is_active
  if (Number.isInteger(body?.sort_order)) update.sort_order = Math.min(Math.max(body.sort_order, 0), 10000)

  const { data, error: updateError } = await client.from('listing_categories').update(update).eq('id', id).select('*').maybeSingle()
  if (updateError) {
    console.error('Listing category update failed:', updateError)
    return respond({ success: false, message: 'Unable to save the category.' }, 500)
  }
  if (!data) return respond({ success: false, message: 'Category not found.' }, 404)
  await audit(client, session.user_id, 'listing_category_updated', id, update)
  return respond({ success: true, category: data })
}

export async function DELETE(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const { client, error: setupError } = setup()
  if (setupError) return setupError
  const { body, error } = await readBody(request)
  if (error) return error

  const id = String(body?.id || '')
  if (!isValidUuid(id)) return respond({ success: false, message: 'A valid category is required.' }, 400)
  const { data: category, error: lookupError } = await client.from('listing_categories').select('*').eq('id', id).maybeSingle()
  if (lookupError) return respond({ success: false, message: 'Unable to load the category.' }, 500)
  if (!category) return respond({ success: false, message: 'Category not found.' }, 404)

  const { count, error: usageError } = await client
    .from('info_tourist_spots')
    .select('id', { count: 'exact', head: true })
    .eq('listing_type', category.listing_type)
    .ilike('category', category.slug)
  if (usageError) return respond({ success: false, message: 'Unable to check whether the category is in use.' }, 500)
  if (count) {
    return respond({
      success: false,
      message: `${count} listing${count === 1 ? ' uses' : 's use'} this category. Hide it instead, or move those listings first.`,
    }, 409)
  }

  const { error: deleteError } = await client.from('listing_categories').delete().eq('id', id)
  if (deleteError) return respond({ success: false, message: 'Unable to delete the category.' }, 500)
  await audit(client, session.user_id, 'listing_category_deleted', id, { listing_type: category.listing_type, slug: category.slug })
  return respond({ success: true })
}
