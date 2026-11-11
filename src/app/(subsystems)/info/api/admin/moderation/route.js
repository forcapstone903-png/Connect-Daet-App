import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

async function writeAudit(client, actorId, action, tableName, recordId, changes) {
  const { error } = await client.from('info_audit_log').insert({
    user_id: actorId,
    action,
    table_name: tableName,
    record_id: recordId,
    changes,
  })
  if (error) throw error
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation is not configured.' }, 500)

  const [
    { data: reports, error: reportsError },
    { data: bans, error: bansError },
    { data: logs, error: logsError },
  ] = await Promise.all([
    client.from('info_moderation')
      .select('id, report_type, reason, description, severity, reported_by, reported_user_id, reported_item_id, reported_item_table, status, moderation_notes, created_at')
      .in('status', ['pending', 'reviewing'])
      .order('created_at', { ascending: false })
      .limit(100),
    client.from('admin_user_bans')
      .select('user_id, reason, banned_by, banned_at')
      .is('lifted_at', null)
      .order('banned_at', { ascending: false })
      .limit(100),
    client.from('info_audit_log')
      .select('id, user_id, action, table_name, record_id, changes, created_at')
      .in('table_name', ['info_moderation', 'admin_user_bans', 'content', 'report', 'user'])
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  if (reportsError || bansError || logsError) {
    console.error('Moderation data load failed:', reportsError?.message || bansError?.message || logsError?.message)
    return respond({ success: false, message: 'Unable to load moderation data.' }, 500)
  }

  const userIds = [...new Set([
    ...(reports || []).flatMap((report) => [report.reported_by, report.reported_user_id]),
    ...(bans || []).flatMap((ban) => [ban.user_id, ban.banned_by]),
    ...(logs || []).map((entry) => entry.user_id),
  ].filter(Boolean))]
  const { data: users, error: usersError } = userIds.length
    ? await client.from('info_users').select('id, full_name, email').in('id', userIds)
    : { data: [], error: null }
  if (usersError) return respond({ success: false, message: 'Unable to load moderation user details.' }, 500)
  const people = new Map((users || []).map((user) => [user.id, user]))

  return respond({
    success: true,
    reports: (reports || []).map((report) => ({
      ...report,
      reporter: people.get(report.reported_by) || null,
      reportedUser: people.get(report.reported_user_id) || null,
    })),
    blockedUsers: (bans || []).map((ban) => ({
      ...ban,
      user: people.get(ban.user_id) || null,
      moderator: people.get(ban.banned_by) || null,
    })),
    logs: (logs || []).map((entry) => ({ ...entry, actor: people.get(entry.user_id) || null })),
  })
}

export async function PATCH(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation is not configured.' }, 500)

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A moderation action is required.' }, 400)
  }
  const actorId = authorization.session.user_id
  const action = String(body?.action || '')
  const now = new Date().toISOString()

  try {
    if (action === 'record-action') {
      const label = String(body.label || '').trim().slice(0, 100)
      const targetType = String(body.targetType || 'content').trim().slice(0, 60)
      const details = String(body.details || '').trim().slice(0, 1000)
      if (!label || !details) return respond({ success: false, message: 'A moderation action and details are required.' }, 400)
      await writeAudit(client, actorId, label, targetType, body.recordId || null, { details })
      return respond({ success: true })
    }

    if (action === 'resolve-report' || action === 'reject-report') {
      const reportId = String(body.reportId || '')
      const reason = String(body.reason || '').trim()
      if (!reportId || (action === 'reject-report' && !reason)) {
        return respond({ success: false, message: 'A report and resolution reason are required.' }, 400)
      }
      const status = action === 'reject-report' ? 'rejected' : 'resolved'
      const { data, error } = await client.from('info_moderation')
        .update({
          status,
          resolution: reason || 'Reviewed by a moderator.',
          moderation_notes: reason || null,
          assigned_to: actorId,
          resolved_at: now,
          updated_at: now,
        })
        .eq('id', reportId)
        .in('status', ['pending', 'reviewing'])
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return respond({ success: false, message: 'This report is no longer open.' }, 409)
      await writeAudit(client, actorId, action, 'info_moderation', reportId, { status, reason })
      return respond({ success: true })
    }

    if (action === 'ban-user') {
      const userId = String(body.userId || '')
      const reason = String(body.reason || '').trim()
      if (!userId || userId === actorId || !reason || reason.length > 1000) {
        return respond({ success: false, message: 'Select another user and provide a valid ban reason.' }, 400)
      }
      const { data: target, error: targetError } = await client.from('info_users').select('id').eq('id', userId).maybeSingle()
      if (targetError) throw targetError
      if (!target) return respond({ success: false, message: 'User not found.' }, 404)
      const { error } = await client.from('admin_user_bans').upsert({
        user_id: userId,
        reason,
        banned_by: actorId,
        banned_at: now,
        lifted_by: null,
        lifted_at: null,
      }, { onConflict: 'user_id' })
      if (error) throw error
      await writeAudit(client, actorId, action, 'admin_user_bans', userId, { reason, lifted_at: null })
      return respond({ success: true })
    }

    if (action === 'unban-user') {
      const userId = String(body.userId || '')
      if (!userId) return respond({ success: false, message: 'A user is required.' }, 400)
      const { data, error } = await client.from('admin_user_bans')
        .update({ lifted_by: actorId, lifted_at: now })
        .eq('user_id', userId)
        .is('lifted_at', null)
        .select('user_id')
        .maybeSingle()
      if (error) throw error
      if (!data) return respond({ success: false, message: 'This user is not currently blocked.' }, 409)
      await writeAudit(client, actorId, action, 'admin_user_bans', userId, { lifted_at: now })
      return respond({ success: true })
    }

    return respond({ success: false, message: 'Unsupported moderation action.' }, 400)
  } catch (error) {
    console.error('Moderation action failed:', error)
    return respond({ success: false, message: 'Unable to save the moderation action and audit record.' }, 500)
  }
}
