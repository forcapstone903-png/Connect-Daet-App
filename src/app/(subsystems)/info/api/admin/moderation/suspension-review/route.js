import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { isValidUuid } from '@/lib/uuid'
import { normalizeStaffRole } from '@/lib/staffRoles.mjs'
import { revokeUserSessions } from '@/lib/sessionVersions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

function getStats(cases) {
  return cases.reduce((stats, item) => {
    switch (item.status) {
      case 'pending_tourism_officer_review':
        stats.pendingReviews += 1
        break
      case 'approved_suspension':
        stats.approvedSuspensions += 1
        break
      case 'rejected':
        stats.rejectedRecommendations += 1
        break
      case 'returned':
        stats.returnedForInvestigation += 1
        break
      case 'pending_administrator_review':
        stats.escalatedCases += 1
        break
      default:
        break
    }
    return stats
  }, {
    pendingReviews: 0,
    approvedSuspensions: 0,
    rejectedRecommendations: 0,
    returnedForInvestigation: 0,
    escalatedCases: 0,
  })
}

function matchesSearch(item, query) {
  if (!query) return true
  const haystack = [
    item.id,
    item.report?.id,
    item.report?.report_type,
    item.report?.reason,
    item.account?.full_name,
    item.account?.username,
    item.account?.email,
    item.moderator?.full_name,
    item.moderator?.username,
    item.recommendation?.recommendation,
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(query)
}

async function loadCases(client) {
  const { data: investigations, error: investigationError } = await client
    .from('account_moderation_investigations')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(2000)
  if (investigationError) throw investigationError
  if (!investigations?.length) return []

  const investigationIds = investigations.map((item) => item.id)
  const reportIds = [...new Set(investigations.map((item) => item.report_id).filter(Boolean))]
  const userIds = [...new Set(investigations.flatMap((item) => [item.affected_user_id, item.moderator_id]).filter(Boolean))]

  const [recommendationsResult, reportsResult, usersResult, decisionsResult, evidenceResult] = await Promise.all([
    client.from('account_moderation_recommendations')
      .select('*')
      .in('investigation_id', investigationIds),
    client.from('info_moderation')
      .select('id, report_type, reason, description, severity, reported_by, reported_user_id, reported_item_id, reported_item_table, status, created_at, resolved_at')
      .in('id', reportIds),
    client.from('info_users')
      .select('id, full_name, username, email, user_type, status, profile_image_url, created_at')
      .in('id', userIds),
    client.from('moderation_decisions')
      .select('id, investigation_id, reviewer_id, reviewer_role, decision_type, reason, previous_status, new_status, suspension_duration_days, effective_at, expires_at, original_decision_id, created_at')
      .in('investigation_id', investigationIds)
      .order('created_at', { ascending: false }),
    client.from('account_moderation_evidence')
      .select('id, investigation_id, evidence_type, source_table, source_id, title, content, attachment_url, metadata, created_at')
      .in('investigation_id', investigationIds)
      .order('created_at', { ascending: false }),
  ])
  const failure = [recommendationsResult, reportsResult, usersResult, decisionsResult, evidenceResult].find((result) => result.error)
  if (failure) throw failure.error

  const reports = reportsResult.data || []
  const reporterIds = [...new Set(reports.map((report) => report.reported_by).filter(Boolean))]
  const reporterResult = reporterIds.length
    ? await client.from('info_users')
      .select('id, full_name, username, email, user_type, status, created_at')
      .in('id', reporterIds)
    : { data: [], error: null }
  if (reporterResult.error) throw reporterResult.error

  const users = new Map((usersResult.data || []).map((item) => [item.id, item]))
  for (const user of reporterResult.data || []) users.set(user.id, user)
  const reportsById = new Map(reports.map((item) => [item.id, item]))
  const recommendationsById = new Map((recommendationsResult.data || []).map((item) => [item.investigation_id, item]))
  const decisionsById = new Map()
  for (const decision of decisionsResult.data || []) {
    if (!decisionsById.has(decision.investigation_id)) decisionsById.set(decision.investigation_id, decision)
  }
  const evidenceById = new Map()
  for (const item of evidenceResult.data || []) {
    const records = evidenceById.get(item.investigation_id) || []
    records.push(item)
    evidenceById.set(item.investigation_id, records)
  }

  return investigations.map((investigation) => {
    const report = reportsById.get(investigation.report_id) || null
    return {
      ...investigation,
      report,
      account: users.get(investigation.affected_user_id) || null,
      moderator: users.get(investigation.moderator_id) || null,
      reporter: users.get(report?.reported_by) || null,
      recommendation: recommendationsById.get(investigation.id) || null,
      decision: decisionsById.get(investigation.id) || null,
      evidence: evidenceById.get(investigation.id) || [],
    }
  })
}

async function loadAccountHistory(client, item) {
  const [decisionsResult, investigationsResult, restrictionsResult, reportsResult] = await Promise.all([
    client.from('moderation_decisions')
      .select('*')
      .eq('affected_user_id', item.affected_user_id)
      .order('created_at', { ascending: false })
      .limit(100),
    client.from('account_moderation_investigations')
      .select('id, report_id, moderator_id, assessment, status, submitted_at, reviewed_by, reviewed_at, review_notes')
      .eq('affected_user_id', item.affected_user_id)
      .order('submitted_at', { ascending: false })
      .limit(50),
    client.from('admin_user_bans')
      .select('id, reason, ban_type, banned_by, banned_at, expires_at, lifted_by, lifted_at, lift_reason, reversed_by, reversed_at, reversal_reason')
      .eq('user_id', item.affected_user_id)
      .order('banned_at', { ascending: false })
      .limit(50),
    client.from('info_moderation')
      .select('id, report_type, reason, status, resolution, created_at, resolved_at')
      .eq('reported_user_id', item.affected_user_id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  const failure = [decisionsResult, investigationsResult, restrictionsResult, reportsResult].find((result) => result.error)
  if (failure) throw failure.error
  const decisions = decisionsResult.data || []
  const caseDecisions = decisions.filter((decision) => decision.investigation_id === item.id)
  return {
    decisions: caseDecisions,
    decision: caseDecisions[0] || null,
    tourismEvaluation: caseDecisions.find((decision) => decision.reviewer_role === 'tourism_officer') || null,
    accountHistory: {
      decisions,
      priorInvestigations: investigationsResult.data || [],
      restrictions: restrictionsResult.data || [],
      reports: reportsResult.data || [],
    },
  }
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const role = normalizeStaffRole(authorization.session.role)
  if (!['tourism_officer', 'admin'].includes(role)) {
    return respond({ success: false, message: 'Only Tourism Officers and System Administrators can review account cases.' }, 403)
  }

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Suspension review is not configured.' }, 500)

  try {
    const allCases = await loadCases(client)
    const stats = getStats(allCases)
    const params = new URL(request.url).searchParams
    const caseId = params.get('case')
    const query = String(params.get('q') || '').trim().toLowerCase()
    const status = String(params.get('status') || 'all')
    const recommendation = String(params.get('recommendation') || 'all')

    if (caseId) {
      if (!isValidUuid(caseId)) return respond({ success: false, message: 'A valid case id is required.' }, 400)
      const item = allCases.find((entry) => entry.id === caseId)
      if (!item) return respond({ success: false, message: 'Investigation not found.' }, 404)
      if (role === 'admin') {
        const history = await loadAccountHistory(client, item)
        return respond({ success: true, role, case: { ...item, ...history } })
      }
      return respond({ success: true, role, case: item })
    }

    const visibleCases = role === 'admin'
      ? allCases.filter((item) => item.status === 'pending_administrator_review')
      : allCases
    const filtered = visibleCases.filter((item) => (
      (status === 'all' || item.status === status)
      && (recommendation === 'all' || item.recommendation?.recommendation === recommendation)
      && matchesSearch(item, query)
    ))
    const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1)
    const pageSize = Math.min(50, Math.max(5, Number.parseInt(params.get('pageSize') || '20', 10) || 20))
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
    const currentPage = Math.min(page, pageCount)
    const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    return respond({
      success: true,
      role,
      cases: rows,
      stats: role === 'admin' ? { pendingReviews: 0, ...stats } : stats,
      pagination: { page: currentPage, pageSize, total: filtered.length, pageCount },
    })
  } catch (error) {
    console.error('Suspension review queue load failed:', { code: error.code || null })
    return respond({ success: false, message: 'Unable to load account suspension cases.' }, 500)
  }
}

export async function PATCH(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const role = normalizeStaffRole(authorization.session.role)
  if (!['tourism_officer', 'admin'].includes(role)) {
    return respond({ success: false, message: 'Only Tourism Officers and System Administrators can review account cases.' }, 403)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A valid review decision is required.' }, 400)
  }

  const caseId = String(body?.caseId || '')
  const decision = String(body?.decision || '')
  const reason = String(body?.reason || '').trim()
  const durationDays = body?.durationDays == null || body.durationDays === ''
    ? null
    : Number(body.durationDays)
  const tourismOfficerDecisions = new Set([
    'approve_suspension',
    'reject_recommendation',
    'return_for_investigation',
    'escalate_to_administrator',
  ])
  const administratorDecisions = new Set(['approve_permanent_ban', 'reject_permanent_ban'])
  administratorDecisions.add('approve_exceptional_suspension')
  const allowedDecisions = role === 'admin' ? administratorDecisions : tourismOfficerDecisions

  if (!isValidUuid(caseId) || !allowedDecisions.has(decision)) {
    return respond({ success: false, message: 'The case or decision is invalid for your role.' }, 400)
  }
  if (!reason || reason.length > 5000) {
    return respond({ success: false, message: 'A written decision reason is required.' }, 400)
  }
  if (['approve_suspension', 'approve_exceptional_suspension'].includes(decision)
      && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
    return respond({ success: false, message: 'Suspension duration must be between 1 and 365 days.' }, 400)
  }
  if (!['approve_suspension', 'approve_exceptional_suspension'].includes(decision) && durationDays !== null) {
    return respond({ success: false, message: 'A suspension duration is only valid when approving a temporary suspension.' }, 400)
  }

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Suspension review is not configured.' }, 500)

  try {
    const adminDecision = role === 'admin'
    const { data, error } = adminDecision
      ? await client.rpc('admin_account_oversight_action', {
        p_admin_id: authorization.session.user_id,
        p_action: decision,
        p_investigation_id: caseId,
        p_reason: reason,
        p_duration_days: durationDays,
      })
      : await client.rpc('review_account_investigation', {
        p_investigation_id: caseId,
        p_reviewer_id: authorization.session.user_id,
        p_decision: decision,
        p_reason: reason,
        p_duration_days: durationDays,
      })
    if (error) {
      const message = error.message || ''
      if (/no longer pending|not pending|no longer available|already has an active restriction|not pending administrator review/i.test(message)) return respond({ success: false, message }, 409)
      if (/only an active tourism officer|only an active system administrator/i.test(message)) return respond({ success: false, message }, 403)
      if (/duration|reason|recommendation|instructions|required|unsupported|only permanent ban|not a permanent ban request/i.test(message)) return respond({ success: false, message }, 400)
      throw error
    }

    let sessionRevocationWarning = null
    if (['approve_suspension', 'approve_permanent_ban', 'approve_exceptional_suspension'].includes(decision)) {
      try {
        await revokeUserSessions(client, data.user_id)
      } catch (revokeError) {
        console.error('Session revocation after account suspension failed:', { code: revokeError.code || null })
        sessionRevocationWarning = 'The decision was saved, but existing sessions could not be revoked.'
      }
    }

    const messages = {
      approve_suspension: 'Suspension approved and applied.',
      reject_recommendation: 'Recommendation rejected. The account status was preserved.',
      return_for_investigation: 'Case returned to the moderator for further investigation.',
      escalate_to_administrator: 'Permanent ban request escalated to the System Administrator.',
      approve_permanent_ban: 'Permanent ban authorized and applied.',
      approve_exceptional_suspension: 'Exceptional suspension approved and applied.',
      reject_permanent_ban: 'Permanent ban request returned to the Tourism Officer. The account status was preserved.',
    }
    return respond({
      success: true,
      decision: data,
      message: messages[decision],
      sessionRevocationWarning,
    })
  } catch (error) {
    console.error('Suspension review decision failed:', { code: error.code || null })
    return respond({ success: false, message: 'Unable to save the review decision.' }, 500)
  }
}
