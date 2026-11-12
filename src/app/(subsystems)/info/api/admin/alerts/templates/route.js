import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { normalizeTemplateInput } from '@/lib/alerts.mjs'
import { fail, getServiceClient, json, missingConfig, readJsonBody, writeAudit } from '@/lib/alertsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()

  const { data, error } = await client.from('alert_templates').select('*').order('name')
  if (error) {
    console.error('Alert templates load failed:', error)
    return fail(500, 'Unable to load templates.')
  }
  return json({ success: true, templates: data || [] })
}

export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()

  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError
  const { data: template, error: validationError } = normalizeTemplateInput(body)
  if (validationError) return fail(400, validationError)

  const { data, error } = await client
    .from('alert_templates')
    .insert({ ...template, created_by: session.user_id })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return fail(409, 'A template with this name already exists.')
    if (error.code === '23503') return fail(400, 'Choose an alert category.')
    console.error('Alert template create failed:', error)
    return fail(500, 'Unable to save the template.')
  }
  await writeAudit(client, session.user_id, 'alert_template_created', data.id, { name: data.name }, 'alert_templates')
  return json({ success: true, template: data }, 201)
}
