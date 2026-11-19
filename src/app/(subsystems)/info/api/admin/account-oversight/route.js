import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { normalizeStaffRole } from '@/lib/staffRoles.mjs'
import { isValidUuid } from '@/lib/uuid'
import { revokeUserSessions } from '@/lib/sessionVersions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const COMMUNITY_ROLES = ['tourist', 'business']
const ACCOUNT_STATUSES = ['active', 'pending', 'suspended', 'banned']

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function asErrorResponse(error) {
  const message = error?.message || ''
  if (/only an active system administrator/i.test(message)) {
    return respond({ success: false, message }, 403)
  }
  if (/no longer pending|not pending|no active suspension|no reversible|restriction.*no longer active|already has an active restriction|already permanently banned|already has this status|active account restriction|active suspension must be lifted|permanent ban must be reversed|active permanent ban/i.test(message)) {
    return respond({ success: false, message }, 409)
  }
  if (/reason|required|duration|valid|unsupported|staff account|open report|not eligible|original case/i.test(message)) {
    return respond({ success: false, message }, 400)
  }
  return null
}

function normalizeAccount(row, reportsByUser, decisionsByUser, investigationsByUser, restrictionsByUser) {
  const decisions = decisionsByUser.get(row.id) || []
  const reports = reportsByUser.get(row.id) || []
  const restrictions = restrictionsByUser.get(row.id) || []
  const reversibleDecision = decisions.find((item) => (
    item.new_status === row.status
    && ['SUSPENSION_APPROVED', 'EXCEPTIONAL_SUSPENSION_APPROVED', 'PERMANENT_BAN_APPROVED'].includes(item.decision_type)
    && !decisions.some((reversal) => reversal.original_decision_id === item.id)
  ))
  const activeRestriction = restrictions.find((item) => (
    !item.lifted_at && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now())
  ))
  const latestInvestigation = (investigationsByUser.get(row.id) || [])[0] || null

  return {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    email: row.email,
    status: row.status,
    created_at: row.created_at,
    violation_count: decisions.filter((item) => [
      'WARNING_ISSUED',
      'SUSPENSION_APPROVED',
      'EXCEPTIONAL_SUSPENSION_APPROVED',
      'PERMANENT_BAN_APPROVED',
    ].includes(item.decision_type)).length,
    latest_moderation_action: decisions[0] || null,
    suspension_expires_at: activeRestriction?.expires_at || null,
    active_restriction: activeRestriction || null,
    review_status: latestInvestigation?.status || reports[0]?.status || null,
    latest_investigation_id: latestInvestigation?.id || null,
    reversible_investigation_id: reversibleDecision?.investigation_id || null,
    open_reports: reports
      .filter((report) => ['open', 'pending', 'reviewing'].includes(report.status))
      .map(({ id, report_type, reason, description, status, created_at }) => ({
        id,
        report_type,
        reason,
        description,
        status,
        created_at,
      })),
    moderation_history: decisions.slice(0, 30),
  }
}

async function loadStats(client) {
  const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const results = await Promise.all([
    client.from('info_users').select('id', { count: 'exact', head: true }).in('user_type', COMMUNITY_ROLES).eq('status', 'active'),
    client.from('account_moderation_investigations').select('id', { count: 'exact', head: true }).eq('status', 'pending_administrator_review'),
    client.from('info_users').select('id', { count: 'exact', head: true }).in('user_type', COMMUNITY_ROLES).eq('status', 'suspended'),
    client.from('admin_user_bans').select('id', { count: 'exact', head: true }).eq('ban_type', 'permanent').is('lifted_at', null),
    client.from('user_moderation_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('admin_user_bans').select('id', { count: 'exact', head: true }).eq('ban_type', 'suspension').not('lifted_at', 'is', null).gte('lifted_at', recentDate),
  ])
  const error = results.find((result) => result.error)
  if (error) throw error.error

  return {
    activeAccounts: results[0].count || 0,
    pendingReviews: results[1].count || 0,
    suspendedAccounts: results[2].count || 0,
    permanentBans: results[3].count || 0,
    pendingAppeals: results[4].count || 0,
    recentlyLiftedSuspensions: results[5].count || 0,
  }
}

async function loadAccountRows(client, params) {
  const requestedPage = Number.parseInt(params.get('page') || '1', 10)
  const requestedPageSize = Number.parseInt(params.get('pageSize') || '20', 10)
  const pageSize = Number.isInteger(requestedPageSize) ? Math.min(50, Math.max(5, requestedPageSize)) : 20
  const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1
  const status = params.get('status') || 'all'
  const requestedUserId = params.get('userId') || ''
  const search = String(params.get('q') || '').trim().replace(/[^a-zA-Z0-9\s@.+_-]/g, '').slice(0, 100)

  if (status !== 'all' && !ACCOUNT_STATUSES.includes(status)) {
    return { error: respond({ success: false, message: 'Select a supported account status filter.' }, 400) }
  }
  if (requestedUserId && !isValidUuid(requestedUserId)) {
    return { error: respond({ success: false, message: 'A valid user id is required.' }, 400) }
  }

  let query = client.from('info_users')
    .select('id, full_name, username, email, status, created_at', { count: 'exact' })
    .in('user_type', COMMUNITY_ROLES)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (status !== 'all') query = query.eq('status', status)
  if (requestedUserId) query = query.eq('id', requestedUserId)
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,username.ilike.%${search}%`)

  const { data: accounts, error, count } = await query
  if (error) throw error
  const accountIds = (accounts || []).map((item) => item.id)
  if (!accountIds.length) {
    return { accounts: [], pagination: { page, pageSize, total: count || 0, pageCount: Math.max(1, Math.ceil((count || 0) / pageSize)) } }
  }

  const [reportsResult, decisionsResult, investigationsResult, restrictionsResult] = await Promise.all([
    client.from('info_moderation').select('id, reported_user_id, report_type, reason, description, status, created_at').in('reported_user_id', accountIds).order('created_at', { ascending: false }),
    client.from('moderation_decisions')
      .select('id, case_id, investigation_id, affected_user_id, reviewer_id, reviewer_role, decision_type, reason, previous_status, new_status, suspension_duration_days, effective_at, expires_at, created_at')
      .in('affected_user_id', accountIds)
      .order('created_at', { ascending: false }),
    client.from('account_moderation_investigations')
      .select('id, report_id, affected_user_id, status, submitted_at')
      .in('affected_user_id', accountIds)
      .order('submitted_at', { ascending: false }),
    client.from('admin_user_bans')
      .select('id, user_id, reason, ban_type, banned_at, expires_at, lifted_at')
      .in('user_id', accountIds)
      .order('banned_at', { ascending: false }),
  ])
  const relatedError = [reportsResult, decisionsResult, investigationsResult, restrictionsResult].find((result) => result.error)
  if (relatedError) throw relatedError.error

  const groupBy = (items, key) => {
    const grouped = new Map()
    for (const item of items || []) {
      const current = grouped.get(item[key]) || []
      current.push(item)
      grouped.set(item[key], current)
    }
    return grouped
  }
  const reportsByUser = groupBy(reportsResult.data, 'reported_user_id')
  return {
    accounts: (accounts || []).map((row) => normalizeAccount(
      row,
      reportsByUser,
      groupBy(decisionsResult.data, 'affected_user_id'),
      groupBy(investigationsResult.data, 'affected_user_id'),
      groupBy(restrictionsResult.data, 'user_id'),
    )),
    pagination: {
      page,
      pageSize,
      total: count || 0,
      pageCount: Math.max(1, Math.ceil((count || 0) / pageSize)),
    },
  }
}

async function loadCaseDetail(client, investigationId) {
  const { data: investigation, error } = await client
    .from('account_moderation_investigations')
    .select('*')
    .eq('id', investigationId)
    .maybeSingle()
  if (error) throw error
  if (!investigation) return { error: respond({ success: false, message: 'Escalated investigation not found.' }, 404) }

  const [reportResult, accountResult, moderatorResult, recommendationResult, evidenceResult, decisionsResult, priorCasesResult, restrictionsResult] = await Promise.all([
    client.from('info_moderation')
      .select('id, report_type, reason, description, severity, reported_by, reported_user_id, reported_item_id, reported_item_table, status, resolution, created_at, resolved_at')
      .eq('id', investigation.report_id).maybeSingle(),
    client.from('info_users')
      .select('id, full_name, username, email, user_type, status, phone_number, bio, address, city, country, profile_image_url, created_at, last_login, account_deactivated_at')
      .eq('id', investigation.affected_user_id).maybeSingle(),
    client.from('info_users')
      .select('id, full_name, username, email, user_type')
      .eq('id', investigation.moderator_id).maybeSingle(),
    client.from('account_moderation_recommendations')
      .select('*')
      .eq('investigation_id', investigation.id).maybeSingle(),
    client.from('account_moderation_evidence')
      .select('*')
      .eq('investigation_id', investigation.id)
      .order('created_at', { ascending: false }),
    client.from('moderation_decisions')
      .select('*')
      .eq('affected_user_id', investigation.affected_user_id)
      .order('created_at', { ascending: false })
      .limit(100),
    client.from('account_moderation_investigations')
      .select('id, report_id, moderator_id, assessment, status, submitted_at, reviewed_by, reviewed_at, review_notes')
      .eq('affected_user_id', investigation.affected_user_id)
      .order('submitted_at', { ascending: false })
      .limit(50),
    client.from('admin_user_bans')
      .select('id, reason, ban_type, banned_by, banned_at, expires_at, lifted_by, lifted_at, lift_reason, reversed_by, reversed_at, reversal_reason')
      .eq('user_id', investigation.affected_user_id)
      .order('banned_at', { ascending: false })
      .limit(50),
  ])
  const failure = [reportResult, accountResult, moderatorResult, recommendationResult, evidenceResult, decisionsResult, priorCasesResult, restrictionsResult].find((result) => result.error)
  if (failure) throw failure.error
  const report = reportResult.data

  let reporter = null
  if (report?.reported_by) {
    const { data, error: reporterError } = await client.from('info_users')
      .select('id, full_name, username, email, user_type')
      .eq('id', report.reported_by)
      .maybeSingle()
    if (reporterError) throw reporterError
    reporter = data
  }

  const decisions = decisionsResult.data || []
  const caseDecisions = decisions.filter((item) => item.investigation_id === investigation.id)
  return {
    ...investigation,
    report,
    account: accountResult.data,
    moderator: moderatorResult.data,
    reporter,
    recommendation: recommendationResult.data,
    evidence: evidenceResult.data || [],
    decisions: caseDecisions,
    decision: caseDecisions[0] || null,
    tourismEvaluation: caseDecisions.find((item) => item.reviewer_role === 'tourism_officer') || null,
    accountHistory: {
      decisions,
      priorInvestigations: priorCasesResult.data || [],
      restrictions: restrictionsResult.data || [],
    },
  }
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  if (normalizeStaffRole(authorization.session.role) !== 'admin') {
    return respond({ success: false, message: 'Only System Administrators can access Account Oversight.' }, 403)
  }

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Account Oversight is not configured.' }, 503)

  try {
    const params = new URL(request.url).searchParams
    const investigationId = params.get('case')
    if (investigationId) {
      if (!isValidUuid(investigationId)) return respond({ success: false, message: 'A valid case id is required.' }, 400)
      const result = await loadCaseDetail(client, investigationId)
      if (result.error) return result.error
      return respond({ success: true, case: result })
    }

    const [stats, rows] = await Promise.all([
      loadStats(client),
      loadAccountRows(client, params),
    ])
    if (rows.error) return rows.error
    return respond({ success: true, stats, ...rows })
  } catch (error) {
    console.error('Account Oversight data load failed:', { code: error.code || null })
    return respond({ success: false, message: 'Unable to load Account Oversight data.' }, 500)
  }
}

export async function PATCH(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  if (normalizeStaffRole(authorization.session.role) !== 'admin') {
    return respond({ success: false, message: 'Only System Administrators can manage account status.' }, 403)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A valid administrator action is required.' }, 400)
  }

  const action = String(body?.action || '')
  const reason = String(body?.reason || '').trim()
  const userId = body?.userId == null ? null : String(body.userId)
  const investigationId = body?.investigationId == null ? null : String(body.investigationId)
  const reportId = body?.reportId == null || body.reportId === '' ? null : String(body.reportId)
  const requestedStatus = String(body?.status || '')
  const durationDays = body?.durationDays == null || body.durationDays === '' ? null : Number(body.durationDays)
  const validActions = new Set([
    'approve_permanent_ban',
    'reject_permanent_ban',
    'approve_exceptional_suspension',
    'lift_suspension',
    'reverse_decision',
    'set_status',
  ])

  if (!validActions.has(action)) return respond({ success: false, message: 'Choose a supported administrator action.' }, 400)
  if (reason.length > 5000) return respond({ success: false, message: 'The detailed reason is too long.' }, 400)
  if (userId && !isValidUuid(userId)) return respond({ success: false, message: 'A valid user id is required.' }, 400)
  if (investigationId && !isValidUuid(investigationId)) return respond({ success: false, message: 'A valid investigation id is required.' }, 400)
  if (reportId && !isValidUuid(reportId)) return respond({ success: false, message: 'A valid related report id is required.' }, 400)
  if (action !== 'set_status' && !reason) return respond({ success: false, message: 'A detailed reason is required.' }, 400)
  if (action === 'set_status') {
    if (!userId) return respond({ success: false, message: 'A user account is required.' }, 400)
    if (!ACCOUNT_STATUSES.includes(requestedStatus)) return respond({ success: false, message: 'Choose a supported account status.' }, 400)
    if (requestedStatus === 'pending' && !reason && !reportId) {
      return respond({ success: false, message: 'Provide a moderation reason or select a related open report.' }, 400)
    }
    if (requestedStatus !== 'pending' && !reason) {
      return respond({ success: false, message: 'A detailed moderation reason is required.' }, 400)
    }
    if (requestedStatus === 'suspended' && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
      return respond({ success: false, message: 'Choose a suspension duration between 1 and 365 days.' }, 400)
    }
    if (requestedStatus !== 'suspended' && durationDays !== null) {
      return respond({ success: false, message: 'A duration is only valid for a temporary suspension.' }, 400)
    }
  }
  if (['approve_permanent_ban', 'reject_permanent_ban', 'approve_exceptional_suspension'].includes(action) && !investigationId) {
    return respond({ success: false, message: 'An escalated investigation is required.' }, 400)
  }
  if (['lift_suspension', 'reverse_decision'].includes(action) && !userId) {
    return respond({ success: false, message: 'A user account is required.' }, 400)
  }
  if (action === 'reverse_decision' && !investigationId) {
    return respond({ success: false, message: 'The original case is required to reverse a moderation decision.' }, 400)
  }
  if (action === 'approve_exceptional_suspension' && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
    return respond({ success: false, message: 'Suspension duration must be between 1 and 365 days.' }, 400)
  }
  if (action !== 'approve_exceptional_suspension' && action !== 'set_status' && durationDays !== null) {
    return respond({ success: false, message: 'A duration is only valid for an exceptional suspension approval.' }, 400)
  }

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Account Oversight is not configured.' }, 503)

  try {
    const { data, error } = action === 'set_status'
      ? await client.rpc('admin_set_account_status', {
        p_admin_id: authorization.session.user_id,
        p_user_id: userId,
        p_new_status: requestedStatus,
        p_reason: reason || null,
        p_duration_days: durationDays,
        p_report_id: reportId,
      })
      : await client.rpc('admin_account_oversight_action', {
        p_admin_id: authorization.session.user_id,
        p_action: action,
        p_user_id: userId,
        p_investigation_id: investigationId,
        p_reason: reason,
        p_duration_days: durationDays,
      })
    if (error) {
      const response = asErrorResponse(error)
      if (response) return response
      throw error
    }

    let sessionRevocationWarning = null
    if (data.previous_status !== data.new_status
      && (action !== 'set_status' || requestedStatus === 'banned')) {
      try {
        await revokeUserSessions(client, data.user_id)
      } catch (revokeError) {
        console.error('Session revocation after administrator account action failed:', { code: revokeError.code || null })
        sessionRevocationWarning = 'The action was saved, but existing sessions could not be revoked.'
      }
    }

    const labels = {
      approve_permanent_ban: 'Permanent ban authorized.',
      reject_permanent_ban: 'Permanent ban rejected and returned to the Tourism Officer. The account status was preserved.',
      approve_exceptional_suspension: 'Exceptional suspension approved.',
      lift_suspension: 'Suspension lifted.',
      reverse_decision: 'Moderation decision reversed and recorded.',
      set_status: `Account status changed to ${requestedStatus}. The moderation decision, notification, and audit history were saved.`,
    }
    return respond({
      success: true,
      action: data,
      message: labels[action],
      sessionRevocationWarning,
    })
  } catch (error) {
    console.error('Administrator account action failed:', { code: error.code || null })
    return respond({ success: false, message: 'Unable to save the administrator account action.' }, 500)
  }
}
