// A signed-in user's alert categories. No row = all categories (default),
// so new users never silently miss alerts.
import { getServerSession } from '@/lib/serverAuth'
import { fail, getServiceClient, json, loadActiveCategorySlugs, missingConfig, readJsonBody } from '@/lib/alertsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return fail(401, 'Sign in to manage alert preferences.')
  const client = getServiceClient()
  if (!client) return missingConfig()

  const [{ data: preference, error }, { data: categories, error: categoryError }] = await Promise.all([
    client.from('alert_preferences').select('categories, updated_at').eq('user_id', session.user_id).maybeSingle(),
    client.from('alert_categories').select('slug, name, description, icon').eq('is_active', true).order('sort_order'),
  ])
  if (error || categoryError) {
    console.error('Alert preferences load failed:', error || categoryError)
    return fail(500, 'Unable to load alert preferences.')
  }

  const all = (categories || []).map((category) => category.slug)
  return json({
    success: true,
    categories: categories || [],
    selected: preference ? preference.categories.filter((slug) => all.includes(slug)) : all,
    isDefault: !preference,
  })
}

export async function PUT(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return fail(401, 'Sign in to manage alert preferences.')
  const client = getServiceClient()
  if (!client) return missingConfig()

  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  try {
    const active = await loadActiveCategorySlugs(client)
    const selected = Array.isArray(body?.categories)
      ? [...new Set(body.categories.map(String).filter((slug) => active.includes(slug)))]
      : null
    if (!selected) return fail(400, 'categories must be a list.')

    const { error } = await client.from('alert_preferences').upsert({
      user_id: session.user_id,
      categories: selected,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) throw error

    return json({
      success: true,
      selected,
      message: selected.length
        ? 'Alert preferences saved.'
        : 'Saved. You will still receive alerts the tourism office sends to everyone.',
    })
  } catch (error) {
    console.error('Alert preferences save failed:', error)
    return fail(500, 'Unable to save alert preferences.')
  }
}
