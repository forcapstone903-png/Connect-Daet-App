import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { fail, getServiceClient, json, missingConfig, readJsonBody, writeAudit } from '@/lib/alertsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Alert categories: anyone who sends alerts can read the full list (GET);
// only administrators can change it (staffRoles API rule: system.manage).
// Categories referenced by alerts or templates cannot be deleted, only hidden,
// because the alert history keeps pointing at them.
const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,30}$/
const ICONS = ['bell', 'siren', 'cloud-rain', 'waves', 'traffic-cone', 'zap', 'heart-pulse', 'calendar', 'flame', 'mountain', 'info']

function readFields(body, { requireName }) {
  const fields = {}
  if (body?.name !== undefined || requireName) {
    const name = String(body?.name || '').trim().slice(0, 60)
    if (!name) return { error: 'Category name is required.' }
    fields.name = name
  }
  if (body?.description !== undefined) fields.description = String(body.description || '').trim().slice(0, 200)
  if (body?.icon !== undefined) {
    if (!ICONS.includes(body.icon)) return { error: `Icon must be one of: ${ICONS.join(', ')}.` }
    fields.icon = body.icon
  }
  if (body?.sort_order !== undefined) {
    const order = Number(body.sort_order)
    if (!Number.isInteger(order) || order < 0 || order > 10000) return { error: 'Sort order must be 0 to 10000.' }
    fields.sort_order = order
  }
  if (body?.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return { error: 'is_active must be true or false.' }
    fields.is_active = body.is_active
  }
  return { fields }
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()

  const [categories, alerts, templates] = await Promise.all([
    client.from('alert_categories').select('*').order('sort_order').order('name'),
    client.from('alerts').select('category').limit(10000),
    client.from('alert_templates').select('category').limit(1000),
  ])
  if (categories.error) {
    console.error('Alert category list failed:', categories.error)
    return fail(500, 'Unable to load alert categories.')
  }
  const usage = new Map()
  for (const row of [...(alerts.data || []), ...(templates.data || [])]) {
    usage.set(row.category, (usage.get(row.category) || 0) + 1)
  }
  return json({
    success: true,
    icons: ICONS,
    categories: (categories.data || []).map((category) => ({ ...category, usage: usage.get(category.slug) || 0 })),
  })
}

export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()
  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  const { fields, error } = readFields(body, { requireName: true })
  if (error) return fail(400, error)
  const slug = String(body?.slug || fields.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31)
  if (!SLUG_PATTERN.test(slug)) return fail(400, 'Use a short code of letters, numbers and underscores that starts with a letter.')

  const { data, error: insertError } = await client
    .from('alert_categories')
    .insert({ slug, icon: 'bell', sort_order: 100, ...fields })
    .select('*')
    .single()
  if (insertError) {
    if (insertError.code === '23505') return fail(409, 'A category with this code already exists.')
    console.error('Alert category create failed:', insertError)
    return fail(500, 'Unable to create the category.')
  }
  await writeAudit(client, session.user_id, 'alert_category_created', null, { slug, ...fields }, 'alert_categories')
  return json({ success: true, category: data }, 201)
}

// Body: { slug, name?, description?, icon?, sort_order?, is_active? }
export async function PATCH(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()
  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  const slug = String(body?.slug || '')
  if (!SLUG_PATTERN.test(slug)) return fail(400, 'A valid category is required.')
  const { fields, error } = readFields(body, { requireName: false })
  if (error) return fail(400, error)
  if (!Object.keys(fields).length) return fail(400, 'Nothing to update.')

  if (fields.is_active === false) {
    const { count, error: countError } = await client
      .from('alert_categories')
      .select('slug', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('slug', slug)
    if (countError) return fail(500, 'Unable to check the remaining categories.')
    if (!count) return fail(409, 'At least one alert category must stay active.')
  }

  const { data, error: updateError } = await client.from('alert_categories').update(fields).eq('slug', slug).select('*').maybeSingle()
  if (updateError) {
    console.error('Alert category update failed:', updateError)
    return fail(500, 'Unable to save the category.')
  }
  if (!data) return fail(404, 'Category not found.')
  await writeAudit(client, session.user_id, 'alert_category_updated', null, { slug, ...fields }, 'alert_categories')
  return json({ success: true, category: data })
}

export async function DELETE(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()
  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  const slug = String(body?.slug || '')
  if (!SLUG_PATTERN.test(slug)) return fail(400, 'A valid category is required.')

  const [alerts, templates] = await Promise.all([
    client.from('alerts').select('id', { count: 'exact', head: true }).eq('category', slug),
    client.from('alert_templates').select('id', { count: 'exact', head: true }).eq('category', slug),
  ])
  if (alerts.error || templates.error) return fail(500, 'Unable to check whether the category is in use.')
  if ((alerts.count || 0) + (templates.count || 0) > 0) {
    return fail(409, 'This category is used by past alerts or templates. Hide it instead so history stays intact.')
  }

  const { error } = await client.from('alert_categories').delete().eq('slug', slug)
  if (error) {
    console.error('Alert category delete failed:', error)
    return fail(500, 'Unable to delete the category.')
  }
  await writeAudit(client, session.user_id, 'alert_category_deleted', null, { slug }, 'alert_categories')
  return json({ success: true })
}
