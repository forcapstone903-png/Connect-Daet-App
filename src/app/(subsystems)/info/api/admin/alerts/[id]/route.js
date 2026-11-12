import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { ALERT_LIMITS, normalizeAlertInput, normalizeSentAlertEdit } from '@/lib/alerts.mjs'
import {
  UUID_PATTERN,
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

async function readAlertId(params) {
  const { id } = await params
  return UUID_PATTERN.test(String(id)) ? String(id) : null
}

async function loadAlert(client, id) {
  const { data, error } = await client.from('alerts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function GET(request, { params }) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()
  const id = await readAlertId(params)
  if (!id) return fail(400, 'Invalid alert ID.')

  try {
    const alert = await loadAlert(client, id)
    if (!alert) return fail(404, 'Alert not found.')
    const { data: reach } = alert.sent_at ? await client.rpc('get_alert_reach', { p_alert_ids: [id] }) : { data: [] }
    return json({ success: true, alert: { ...alert, reach: reach?.[0] || null } })
  } catch (error) {
    console.error('Alert detail failed:', error)
    return fail(500, 'Unable to load the alert.')
  }
}

// Edit. Drafts and scheduled alerts can change everything (including when
// they go out). Sent alerts can correct wording/area only; they are flagged
// "updated" publicly and are NOT pushed again.
export async function PUT(request, { params }) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()
  const id = await readAlertId(params)
  if (!id) return fail(400, 'Invalid alert ID.')

  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  try {
    const existing = await loadAlert(client, id)
    if (!existing) return fail(404, 'Alert not found.')
    if (existing.status === 'cancelled') return fail(409, 'A cancelled alert cannot be edited.')

    let changes
    let delivery = null
    if (existing.status === 'sent') {
      if (existing.all_clear_at) return fail(409, 'This alert is already marked all clear.')
      const { data, error } = normalizeSentAlertEdit(body)
      if (error) return fail(400, error)
      changes = data
    } else {
      const categories = await loadActiveCategorySlugs(client)
      const { data, delivery: requested, error } = normalizeAlertInput(body, { categories })
      if (error) return fail(400, error)
      changes = data
      delivery = requested
    }

    // Only update rows still in the state we validated against.
    const { data: updated, error } = await client
      .from('alerts')
      .update({ ...changes, updated_by: session.user_id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', existing.status)
      .select()
      .maybeSingle()
    if (error) throw error
    if (!updated) return fail(409, 'The alert changed while you were editing. Reload and try again.')

    await writeAudit(client, session.user_id, 'alert_edited', id, { before: existing.status, title: updated.title })

    if (delivery === 'now') {
      const { data: result, error: sendError } = await client.rpc('deliver_alert', { p_alert_id: id })
      if (sendError) return rpcError(sendError, 'Saved, but the alert could not be sent.')
      await writeAudit(client, session.user_id, 'alert_sent', id, { recipients: result?.recipients })
      return json({ success: true, alert: { ...updated, status: 'sent' }, message: `Alert sent to ${Number(result?.recipients || 0).toLocaleString()} inboxes.` })
    }

    return json({ success: true, alert: updated, message: existing.status === 'sent' ? 'Alert updated. Recipients are not notified again.' : 'Alert saved.' })
  } catch (error) {
    console.error('Alert update failed:', error)
    return fail(500, 'Unable to update the alert.')
  }
}

// Actions: send_now | cancel | all_clear
export async function PATCH(request, { params }) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()
  const id = await readAlertId(params)
  if (!id) return fail(400, 'Invalid alert ID.')

  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError
  const action = String(body?.action || '')

  try {
    const existing = await loadAlert(client, id)
    if (!existing) return fail(404, 'Alert not found.')

    if (action === 'send_now') {
      if (!['draft', 'scheduled'].includes(existing.status)) return fail(409, 'This alert has already been sent or cancelled.')
      if (existing.expires_at && new Date(existing.expires_at) <= new Date()) return fail(409, 'The end time has passed. Edit the alert first.')
      const { error } = await client.from('alerts')
        .update({ status: 'scheduled', scheduled_for: new Date().toISOString(), updated_by: session.user_id, updated_at: new Date().toISOString() })
        .eq('id', id).in('status', ['draft', 'scheduled'])
      if (error) throw error
      const { data: result, error: sendError } = await client.rpc('deliver_alert', { p_alert_id: id })
      if (sendError) return rpcError(sendError, 'The alert could not be sent.')
      await writeAudit(client, session.user_id, 'alert_sent', id, { recipients: result?.recipients })
      return json({ success: true, delivery: result, message: `Alert sent to ${Number(result?.recipients || 0).toLocaleString()} inboxes.` })
    }

    if (action === 'cancel') {
      if (existing.status === 'cancelled') return fail(409, 'This alert is already cancelled.')
      if (existing.all_clear_at) return fail(409, 'This alert is already marked all clear.')
      const reason = String(body?.reason || '').trim().slice(0, 300)
      if (existing.status === 'sent' && reason.length < 3) {
        return fail(400, 'Give a short reason for withdrawing a sent alert; it is shown on the public alert page.')
      }
      const { error } = await client.from('alerts')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason || null,
          updated_by: session.user_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id).eq('status', existing.status)
      if (error) throw error
      await writeAudit(client, session.user_id, existing.status === 'sent' ? 'alert_withdrawn' : 'alert_cancelled', id, { reason })
      return json({ success: true, message: existing.status === 'sent' ? 'Alert withdrawn.' : 'Alert cancelled; it will not be sent.' })
    }

    if (action === 'all_clear') {
      const message = String(body?.message || '').trim().slice(0, ALERT_LIMITS.allClear)
      const { data: result, error } = await client.rpc('mark_alert_all_clear', {
        p_alert_id: id, p_actor_id: session.user_id, p_message: message,
      })
      if (error) return rpcError(error, 'Unable to mark the alert all clear.')
      await writeAudit(client, session.user_id, 'alert_all_clear', id, { recipients: result?.recipients })
      return json({ success: true, message: `All clear sent to ${Number(result?.recipients || 0).toLocaleString()} recipients.` })
    }

    return fail(400, 'Action must be send_now, cancel or all_clear.')
  } catch (error) {
    console.error('Alert action failed:', error)
    return fail(500, 'Unable to update the alert.')
  }
}

// Only drafts can be deleted; anything that was scheduled or sent stays in
// the history (cancel or withdraw it instead).
export async function DELETE(request, { params }) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getServiceClient()
  if (!client) return missingConfig()
  const id = await readAlertId(params)
  if (!id) return fail(400, 'Invalid alert ID.')

  const { data, error } = await client.from('alerts').delete().eq('id', id).eq('status', 'draft').select('id, title').maybeSingle()
  if (error) {
    console.error('Alert delete failed:', error)
    return fail(500, 'Unable to delete the draft.')
  }
  if (!data) return fail(409, 'Only drafts can be deleted. Cancel or withdraw other alerts instead.')
  await writeAudit(client, session.user_id, 'alert_draft_deleted', id, { title: data.title })
  return json({ success: true, message: 'Draft deleted.' })
}
