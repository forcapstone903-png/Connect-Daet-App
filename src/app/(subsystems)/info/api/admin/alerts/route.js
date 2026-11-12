import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { normalizeAlertInput } from '@/lib/alerts.mjs'
import {
  fail,
  getServiceClient,
  json,
  loadActiveCategorySlugs,
  missingConfig,
  readJsonBody,
  rpcError,
  writeAudit,
} from '@/lib/alertsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Alert history + everything the compose form needs.
export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()

  try {
    // Fallback scheduler: if pg_cron is not running, opening the Alerts page
    // still sends anything that is due.
    const { error: dueError } = await client.rpc('deliver_due_alerts')
    if (dueError) console.error('deliver_due_alerts fallback failed:', dueError)

    const [alertsResult, categoriesResult, templatesResult] = await Promise.all([
      client.from('alerts').select('*').order('created_at', { ascending: false }).limit(200),
      client.from('alert_categories').select('slug, name, description, icon, sort_order, is_active').order('sort_order'),
      client.from('alert_templates').select('*').order('name'),
    ])
    for (const result of [alertsResult, categoriesResult, templatesResult]) {
      if (result.error) throw result.error
    }

    const alerts = alertsResult.data || []
    const sentIds = alerts.filter((alert) => alert.sent_at).map((alert) => alert.id)
    const { data: reachRows, error: reachError } = sentIds.length
      ? await client.rpc('get_alert_reach', { p_alert_ids: sentIds })
      : { data: [], error: null }
    if (reachError) throw reachError

    const reachById = Object.fromEntries((reachRows || []).map((row) => [row.alert_id, row]))
    return json({
      success: true,
      alerts: alerts.map((alert) => ({ ...alert, reach: reachById[alert.id] || null })),
      categories: categoriesResult.data || [],
      templates: templatesResult.data || [],
    })
  } catch (error) {
    console.error('Alert list failed:', error)
    return fail(500, 'Unable to load alerts. Has migration 098 been applied?')
  }
}

// Create an alert: save as draft, schedule it, or send it now.
export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()

  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  let categories
  try {
    categories = await loadActiveCategorySlugs(client)
  } catch (error) {
    console.error('Alert categories load failed:', error)
    return fail(500, 'Unable to load alert categories.')
  }

  const { data: alertData, delivery, error: validationError } = normalizeAlertInput(body, { categories })
  if (validationError) return fail(400, validationError)

  const { data: alert, error } = await client
    .from('alerts')
    .insert({ ...alertData, created_by: session.user_id, updated_by: session.user_id })
    .select()
    .single()
  if (error) {
    console.error('Alert create failed:', error)
    return fail(500, 'Unable to save the alert.')
  }

  await writeAudit(client, session.user_id, `alert_${delivery === 'now' ? 'sent' : delivery === 'schedule' ? 'scheduled' : 'drafted'}`, alert.id, {
    title: alert.title, category: alert.category, severity: alert.severity, audience: alert.audience,
  })

  if (delivery !== 'now') {
    return json({ success: true, alert, message: delivery === 'schedule' ? 'Alert scheduled.' : 'Draft saved.' }, 201)
  }

  const { data: result, error: sendError } = await client.rpc('deliver_alert', { p_alert_id: alert.id })
  if (sendError) return rpcError(sendError, 'The alert was saved but could not be sent. Open it and choose Send now.')

  const pushNote = result?.push_requested === false
    ? ' Push delivery is not configured, so only inbox notifications were created.'
    : ''
  return json({
    success: true,
    alert: { ...alert, status: 'sent' },
    delivery: result,
    message: `Alert sent to ${Number(result?.recipients || 0).toLocaleString()} inboxes.${pushNote}`,
  }, 201)
}
