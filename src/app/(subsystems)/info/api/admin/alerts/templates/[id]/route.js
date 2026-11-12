import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { normalizeTemplateInput } from '@/lib/alerts.mjs'
import { UUID_PATTERN, fail, getServiceClient, json, missingConfig, readJsonBody, writeAudit } from '@/lib/alertsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function readTemplateId(params) {
  const { id } = await params
  return UUID_PATTERN.test(String(id)) ? String(id) : null
}

export async function PUT(request, { params }) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()
  const id = await readTemplateId(params)
  if (!id) return fail(400, 'Invalid template ID.')

  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError
  const { data: template, error: validationError } = normalizeTemplateInput(body)
  if (validationError) return fail(400, validationError)

  const { data, error } = await client
    .from('alert_templates')
    .update({ ...template, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    if (error.code === '23505') return fail(409, 'A template with this name already exists.')
    if (error.code === '23503') return fail(400, 'Choose an alert category.')
    console.error('Alert template update failed:', error)
    return fail(500, 'Unable to save the template.')
  }
  if (!data) return fail(404, 'Template not found.')
  await writeAudit(client, session.user_id, 'alert_template_updated', id, { name: data.name }, 'alert_templates')
  return json({ success: true, template: data })
}

export async function DELETE(request, { params }) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()
  const id = await readTemplateId(params)
  if (!id) return fail(400, 'Invalid template ID.')

  const { data, error } = await client.from('alert_templates').delete().eq('id', id).select('id, name').maybeSingle()
  if (error) {
    console.error('Alert template delete failed:', error)
    return fail(500, 'Unable to delete the template.')
  }
  if (!data) return fail(404, 'Template not found.')
  await writeAudit(client, session.user_id, 'alert_template_deleted', id, { name: data.name }, 'alert_templates')
  return json({ success: true, message: 'Template deleted.' })
}
