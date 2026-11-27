'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/app/(subsystems)/info/components/admin/AdminShell'
import AdminPanel from '@/app/(subsystems)/info/components/admin/AdminPanel'
import AdminStatCard, { AdminStatGrid } from '@/app/(subsystems)/info/components/admin/AdminStatCard'
import AdminButton from '@/app/(subsystems)/info/components/admin/AdminButton'
import { formatSuspensionDuration, getTotalSuspensionDays, splitSuspensionDays } from '@/lib/suspensionDuration.mjs'

const PAGE_SIZE = 20
const DECISION_LABELS = {
  approve_suspension: 'Approve suspension',
  reject_recommendation: 'Reject recommendation',
  return_for_investigation: 'Return for investigation',
  escalate_to_administrator: 'Escalate to Administrator',
  approve_permanent_ban: 'Authorize permanent ban',
  reject_permanent_ban: 'Reject permanent ban request',
  approve_exceptional_suspension: 'Approve exceptional suspension',
}
const STATUS_LABELS = {
  pending_tourism_officer_review: 'Pending Tourism Officer Review',
  approved_suspension: 'Approved Suspension',
  rejected: 'Rejected',
  returned: 'Returned for Investigation',
  pending_administrator_review: 'Pending Administrator Review',
  approved_permanent_ban: 'Permanent Ban Authorized',
  reversed: 'Decision Reversed',
}
const RECOMMENDATION_LABELS = {
  no_violation: 'No Violation',
  issue_warning: 'Issue Warning',
  recommend_temporary_suspension: 'Temporary Suspension',
  recommend_permanent_ban: 'Permanent Ban',
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatDuration(recommendation) {
  if (!recommendation) return '—'
  if (recommendation.recommendation !== 'recommend_temporary_suspension') return '—'
  const days = recommendation.suspension_duration_days || recommendation.custom_duration_days
  return days ? formatSuspensionDuration(days) : 'Not specified'
}

function humanize(value) {
  return String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getDefaultDurationParts(recommendation) {
  const days = recommendation?.suspension_duration_days || recommendation?.custom_duration_days
  return splitSuspensionDays(days || 7)
}

function CaseStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-white">{value || '—'}</p>
    </div>
  )
}

function EvidenceCard({ item }) {
  const attachmentUrl = item.attachment_url
  return (
    <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{humanize(item.evidence_type)}</p>
      {item.title ? <h4 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{item.title}</h4> : null}
      {item.content ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{item.content}</p> : null}
      {attachmentUrl ? (
        <a href={attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-medium text-sky-700 underline dark:text-sky-300">
          Open attachment
        </a>
      ) : null}
      {item.metadata?.evidence?.href ? (
        <a href={item.metadata.evidence.href} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-medium text-sky-700 underline dark:text-sky-300">
          View reported content
        </a>
      ) : null}
    </article>
  )
}

export default function SuspensionCasesPage() {
  const [role, setRole] = useState('')
  const [cases, setCases] = useState([])
  const [stats, setStats] = useState({})
  const [pagination, setPagination] = useState({ page: 1, pageCount: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [recommendationFilter, setRecommendationFilter] = useState('all')
  const [selectedCase, setSelectedCase] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [decision, setDecision] = useState('')
  const [decisionReason, setDecisionReason] = useState('')
  const [durationMonths, setDurationMonths] = useState('0')
  const [durationDays, setDurationDays] = useState('7')
  const [submitting, setSubmitting] = useState(false)

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      q: query,
      status: statusFilter,
      recommendation: recommendationFilter,
    })
    return `/info/api/admin/moderation/suspension-review?${params.toString()}`
  }, [page, query, statusFilter, recommendationFilter])

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(apiUrl, { credentials: 'same-origin', cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load suspension review cases.')
      setRole(result.role || '')
      setCases(Array.isArray(result.cases) ? result.cases : [])
      setStats(result.stats || {})
      setPagination(result.pagination || { page: 1, pageCount: 1, total: 0 })
    } catch (loadError) {
      console.error('Suspension review queue load failed:', loadError)
      setError(loadError.message || 'Unable to load suspension review cases.')
    } finally {
      setLoading(false)
    }
  }, [apiUrl])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadQueue() }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadQueue])

  useEffect(() => {
    const caseId = new URLSearchParams(window.location.search).get('case')
    if (!caseId) return
    let active = true
    fetch(`/info/api/admin/moderation/suspension-review?case=${encodeURIComponent(caseId)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load the escalated case.')
        if (active) setSelectedCase(result.case)
      })
      .catch((caseError) => {
        if (active) setError(caseError.message || 'Unable to load the escalated case.')
      })
    return () => { active = false }
  }, [])

  const openCase = async (item) => {
    setNotice('')
    setDecision('')
    setDecisionReason('')
    const defaultDuration = getDefaultDurationParts(item.recommendation)
    setDurationMonths(defaultDuration.months)
    setDurationDays(defaultDuration.days)
    try {
      const response = await fetch(`/info/api/admin/moderation/suspension-review?case=${encodeURIComponent(item.id)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load this investigation.')
      setSelectedCase(result.case)
      const defaultDuration = getDefaultDurationParts(result.case.recommendation)
      setDurationMonths(defaultDuration.months)
      setDurationDays(defaultDuration.days)
    } catch (openError) {
      setError(openError.message || 'Unable to load this investigation.')
    }
  }

  const submitDecision = async () => {
    if (!selectedCase || !decision) {
      setNotice('Select a decision before submitting.')
      return
    }
    const reason = decisionReason.trim()
    if (!reason) {
      setNotice(decision === 'return_for_investigation'
        ? 'Instructions for the moderator are required.'
        : decision === 'escalate_to_administrator'
          ? 'An escalation explanation is required.'
          : decision === 'reject_recommendation' || decision === 'reject_permanent_ban'
            ? 'A rejection reason is required.'
            : 'A written approval explanation is required.')
      return
    }
    const usesDuration = ['approve_suspension', 'approve_exceptional_suspension'].includes(decision)
    const parsedDuration = usesDuration ? getTotalSuspensionDays(durationMonths, durationDays) : null
    if (usesDuration && parsedDuration === null) {
      setNotice('Enter a valid duration from 1 to 365 days. Each month is 30 days.')
      return
    }

    setSubmitting(true)
    setNotice('')
    try {
      const response = await fetch('/info/api/admin/moderation/suspension-review', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: selectedCase.id,
          decision,
          reason,
          durationDays: parsedDuration,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save this decision.')
      setNotice([
        result.message || 'Decision saved.',
        result.sessionRevocationWarning,
      ].filter(Boolean).join(' '))
      setDecision('')
      setDecisionReason('')
      setSelectedCase((current) => current ? ({
        ...current,
        status: result.decision?.review_status || current.status,
        account: { ...current.account, status: result.decision?.new_status || current.account?.status },
        decision: {
          decision_type: result.decision?.decision,
          reviewer_id: result.decision?.reviewer_id,
          reviewer_role: role,
          reason,
          previous_status: result.decision?.previous_status,
          new_status: result.decision?.new_status,
          suspension_duration_days: result.decision?.duration_days,
          expires_at: result.decision?.expires_at,
          created_at: result.decision?.reviewed_at,
        },
      }) : current)
      await loadQueue()
      const caseResponse = await fetch(`/info/api/admin/moderation/suspension-review?case=${encodeURIComponent(selectedCase.id)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const caseResult = await caseResponse.json().catch(() => ({}))
      if (caseResponse.ok && caseResult.success) setSelectedCase(caseResult.case)
    } catch (decisionError) {
      setNotice(decisionError.message || 'Unable to save this decision.')
    } finally {
      setSubmitting(false)
    }
  }

  const isOfficer = role === 'tourism_officer'
  const isAdministrator = role === 'admin' || role === 'administrator' || role === 'super_admin'
  const isPendingOfficerReview = selectedCase?.status === 'pending_tourism_officer_review'
  const isPendingAdminReview = selectedCase?.status === 'pending_administrator_review'
  const availableDecisions = isOfficer && isPendingOfficerReview
    ? selectedCase?.recommendation?.recommendation === 'recommend_temporary_suspension'
      ? ['approve_suspension', 'reject_recommendation', 'return_for_investigation']
      : selectedCase?.recommendation?.recommendation === 'recommend_permanent_ban'
        ? ['reject_recommendation', 'return_for_investigation', 'escalate_to_administrator']
        : ['reject_recommendation', 'return_for_investigation']
    : isAdministrator && isPendingAdminReview
      ? ['approve_permanent_ban', 'reject_permanent_ban', 'approve_exceptional_suspension']
      : []

  return (
    <AdminShell
      roleLabel={isAdministrator ? 'Administrator' : 'Tourism Officer'}
      eyebrow="Moderation"
      title={isAdministrator ? 'Escalated Account Cases' : 'Suspension Review'}
      description={isAdministrator
        ? 'Review permanent ban requests escalated by Tourism Officers and make the final authorization decision.'
        : 'Review moderator investigations and approve, reject, return, or escalate recommendations.'}
      headerIcon="moderation"
      actions={<AdminButton icon="refresh" onClick={() => void loadQueue()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</AdminButton>}
    >
      <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}

        <AdminStatGrid columns={3}>
          <AdminStatCard label="Pending Reviews" value={String(stats.pendingReviews || 0)} icon="moderation" tone="warning" loading={loading} />
          <AdminStatCard label="Approved Suspensions" value={String(stats.approvedSuspensions || 0)} icon="users" tone="success" loading={loading} />
          <AdminStatCard label="Rejected Recommendations" value={String(stats.rejectedRecommendations || 0)} icon="moderation" tone="danger" loading={loading} />
          <AdminStatCard label="Returned for Investigation" value={String(stats.returnedForInvestigation || 0)} icon="moderation" tone="violet" loading={loading} />
          <AdminStatCard label="Escalated Cases" value={String(stats.escalatedCases || 0)} icon="moderation" tone="info" loading={loading} />
        </AdminStatGrid>

        <AdminPanel
          title={isAdministrator ? 'Pending administrator review' : 'Account review queue'}
          description="Search and filter investigations. Case records are refreshed from the server and are not cached."
        >
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(11rem,0.7fr)_minmax(11rem,0.7fr)]">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Search
              <input
                type="search"
                value={query}
                onChange={(event) => { setPage(1); setQuery(event.target.value) }}
                placeholder="Case, user, moderator, violation…"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Review status
              <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value) }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
                <option value="all">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Recommended action
              <select value={recommendationFilter} onChange={(event) => { setPage(1); setRecommendationFilter(event.target.value) }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
                <option value="all">All recommendations</option>
                {Object.entries(RECOMMENDATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="px-3 py-3">Case ID</th>
                  <th className="px-3 py-3">User</th>
                  <th className="px-3 py-3">Violation Type</th>
                  <th className="px-3 py-3">Moderator</th>
                  <th className="px-3 py-3">Recommended Action</th>
                  <th className="px-3 py-3">Submission Date</th>
                  <th className="px-3 py-3">Review Status</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                    <td className="px-3 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{item.id.slice(0, 8)}</td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{item.account?.full_name || 'Unknown user'}</p>
                      <p className="text-xs text-slate-500">{item.account?.email || item.account?.username || ''}</p>
                    </td>
                    <td className="px-3 py-3">{item.report?.report_type || 'Account report'}</td>
                    <td className="px-3 py-3">{item.moderator?.full_name || item.moderator?.username || 'Unknown moderator'}</td>
                    <td className="px-3 py-3">
                      <p>{RECOMMENDATION_LABELS[item.recommendation?.recommendation] || '—'}</p>
                      {item.recommendation?.recommendation === 'recommend_temporary_suspension' ? <p className="text-xs text-slate-500">{formatDuration(item.recommendation)}</p> : null}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDate(item.submitted_at)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {STATUS_LABELS[item.status] || humanize(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => void openCase(item)} className="rounded-full border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-slate-800">
                        Review Case
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && cases.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">No cases match these filters.</td></tr>
                ) : null}
                {loading && cases.length === 0 ? (
                  Array.from({ length: 5 }, (_, row) => (
                    <tr key={`loading-${row}`} aria-hidden="true">
                      {Array.from({ length: 8 }, (_, column) => (
                        <td key={column} className="px-3 py-4">
                          <span className={`block h-4 animate-pulse rounded-full bg-slate-100 ${column === 0 ? 'w-4/5' : 'w-2/3'}`} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span>{pagination.total || 0} cases · Page {pagination.page || 1} of {pagination.pageCount || 1}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-full border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <button type="button" disabled={page >= (pagination.pageCount || 1) || loading} onClick={() => setPage((current) => Math.min(pagination.pageCount || 1, current + 1))} className="rounded-full border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        </AdminPanel>

        {selectedCase ? (
          <AdminPanel
            title={`Case ${selectedCase.id.slice(0, 8)}`}
            description={`${STATUS_LABELS[selectedCase.status] || humanize(selectedCase.status)} · Submitted ${formatDate(selectedCase.submitted_at)}`}
            actions={<button type="button" onClick={() => setSelectedCase(null)} className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">Close case</button>}
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-5">
                <section>
                  <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">User information</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <CaseStat label="Name" value={selectedCase.account?.full_name} />
                    <CaseStat label="Username" value={selectedCase.account?.username} />
                    <CaseStat label="Email" value={selectedCase.account?.email} />
                    <CaseStat label="Current status" value={humanize(selectedCase.account?.status)} />
                    <CaseStat label="Registered" value={formatDate(selectedCase.account?.created_at)} />
                    <CaseStat label="Reporter" value={selectedCase.reporter?.full_name || selectedCase.reporter?.email} />
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Moderator investigation</h3>
                  <p className="mt-1 text-xs text-slate-500">Submitted by {selectedCase.moderator?.full_name || selectedCase.moderator?.username || 'Moderator'} · {formatDate(selectedCase.submitted_at)}</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{selectedCase.assessment}</p>
                  {selectedCase.review_notes ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Latest reviewer instructions: {selectedCase.review_notes}</p> : null}
                </section>

                <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Original report and reported content</h3>
                  {selectedCase.report ? (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                      <p className="text-xs text-slate-500">Reported {formatDate(selectedCase.report.created_at)} · {selectedCase.report.report_type || 'Account report'}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedCase.report.reason}</p>
                      {selectedCase.report.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{selectedCase.report.description}</p> : null}
                    </div>
                  ) : <p className="mt-2 text-sm text-slate-500">Original report unavailable.</p>}
                  {selectedCase.evidence.length ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">{selectedCase.evidence.map((item) => <EvidenceCard key={item.id} item={item} />)}</div>
                  ) : null}
                  {selectedCase.evidence_snapshot?.violations?.length ? (
                    <div className="mt-3 space-y-3">
                      {selectedCase.evidence_snapshot.violations.map((violation, index) => (
                        <article key={violation.id || index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                          <p className="text-xs font-semibold text-slate-500">{violation.report_type || 'Reported violation'} · {formatDate(violation.created_at)}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{violation.reason}</p>
                          {violation.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{violation.description}</p> : null}
                          {violation.evidence ? (
                            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {JSON.stringify(violation.evidence, null, 2)}
                            </pre>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Previous violations and warnings</h3>
                    {(selectedCase.evidence_snapshot?.violations || []).length || (selectedCase.evidence_snapshot?.warnings || []).length ? (
                      <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                        {(selectedCase.evidence_snapshot?.violations || []).map((item, index) => <li key={`v-${item.id || index}`} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">{item.reason || item.report_type} · {formatDate(item.created_at)}</li>)}
                        {(selectedCase.evidence_snapshot?.warnings || []).map((item, index) => <li key={`w-${item.id || index}`} className="rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Warning: {item.reason} · {formatDate(item.created_at)}</li>)}
                      </ul>
                    ) : <p className="mt-2 text-sm text-slate-500">No previous violations or warnings were included.</p>}
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Previous suspensions</h3>
                    {(selectedCase.evidence_snapshot?.restrictions || []).length ? (
                      <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                        {selectedCase.evidence_snapshot.restrictions.map((item, index) => <li key={`r-${item.id || index}`} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">{humanize(item.ban_type)}: {item.reason} · {formatDate(item.banned_at)}{item.expires_at ? ` · until ${formatDate(item.expires_at)}` : ''}</li>)}
                      </ul>
                    ) : <p className="mt-2 text-sm text-slate-500">No previous restrictions were included.</p>}
                  </div>
                </section>

                {isAdministrator ? (
                  <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Complete account history</h3>
                    <div className="mt-3 grid gap-4 lg:grid-cols-4">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous investigations</h4>
                        <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                          {(selectedCase.accountHistory?.priorInvestigations || []).map((item) => (
                            <li key={item.id} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                              {humanize(item.status)} · {formatDate(item.submitted_at)}
                              {item.review_notes ? <p className="mt-1 text-xs">{item.review_notes}</p> : null}
                            </li>
                          ))}
                          {!selectedCase.accountHistory?.priorInvestigations?.length ? <li>No prior investigations.</li> : null}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Restrictions</h4>
                        <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                          {(selectedCase.accountHistory?.restrictions || []).map((item) => (
                            <li key={item.id} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                              {humanize(item.ban_type)} · {formatDate(item.banned_at)}{item.expires_at ? ` – ${formatDate(item.expires_at)}` : ''}
                              {item.lifted_at ? <p className="mt-1 text-xs">Lifted {formatDate(item.lifted_at)}: {item.lift_reason || item.reversal_reason || 'No reason recorded'}</p> : null}
                            </li>
                          ))}
                          {!selectedCase.accountHistory?.restrictions?.length ? <li>No restriction history.</li> : null}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reports</h4>
                        <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                          {(selectedCase.accountHistory?.reports || []).map((item) => (
                            <li key={item.id} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                              {item.report_type || 'Account report'} · {humanize(item.status)} · {formatDate(item.created_at)}
                              {item.reason ? <p className="mt-1 text-xs">{item.reason}</p> : null}
                            </li>
                          ))}
                          {!selectedCase.accountHistory?.reports?.length ? <li>No prior reports.</li> : null}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Moderation decisions</h4>
                        <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                          {(selectedCase.accountHistory?.decisions || []).map((item) => (
                            <li key={item.id} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                              {humanize(item.decision_type)} · {formatDate(item.created_at)}
                              {item.reason ? <p className="mt-1 text-xs">{item.reason}</p> : null}
                            </li>
                          ))}
                          {!selectedCase.accountHistory?.decisions?.length ? <li>No prior decisions.</li> : null}
                        </ul>
                      </div>
                    </div>
                  </section>
                ) : null}
              </div>

              <aside className="space-y-4">
                <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Moderator recommendation</h3>
                  <p className="mt-2 text-sm font-semibold text-sky-800 dark:text-sky-200">{RECOMMENDATION_LABELS[selectedCase.recommendation?.recommendation] || 'Unavailable'}</p>
                  {selectedCase.recommendation?.recommendation === 'recommend_temporary_suspension' ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Recommended duration: {formatDuration(selectedCase.recommendation)}</p> : null}
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{selectedCase.recommendation?.reason || '—'}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting explanation</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{selectedCase.recommendation?.supporting_explanation || '—'}</p>
                </section>

                {selectedCase.decision ? (
                  <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Previous decision</h3>
                    <p className="mt-2 text-sm font-semibold">{humanize(selectedCase.decision.decision_type)}</p>
                    <p className="mt-1 text-xs text-slate-500">{selectedCase.decision.reviewer_role} · {formatDate(selectedCase.decision.created_at)}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{selectedCase.decision.reason}</p>
                    {selectedCase.decision.expires_at ? <p className="mt-2 text-xs text-slate-500">Expires {formatDate(selectedCase.decision.expires_at)}</p> : null}
                  </section>
                ) : null}

                {isAdministrator && selectedCase.tourismEvaluation ? (
                  <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/20">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Tourism Officer evaluation</h3>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(selectedCase.tourismEvaluation.created_at)}</p>
                    <p className="mt-2 text-sm font-semibold">{humanize(selectedCase.tourismEvaluation.decision_type)}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{selectedCase.tourismEvaluation.reason}</p>
                  </section>
                ) : null}

                {isAdministrator && selectedCase.decisions?.length ? (
                  <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Previous moderation decisions</h3>
                    <ul className="mt-3 space-y-3">
                      {selectedCase.decisions.map((item) => (
                        <li key={item.id} className="border-l-2 border-slate-200 pl-3">
                          <p className="text-sm font-semibold">{humanize(item.decision_type)}</p>
                          <p className="text-xs text-slate-500">{item.reviewer_role || 'staff'} · {formatDate(item.created_at)}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{item.reason}</p>
                          <p className="mt-1 text-xs text-slate-500">{humanize(item.previous_status)} → {humanize(item.new_status)}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {availableDecisions.length ? (
                  <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{isOfficer ? 'Tourism Officer Decision' : 'Administrator Authorization'}</h3>
                    <label className="mt-3 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Decision
                      <select value={decision} onChange={(event) => setDecision(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
                        <option value="">Select a decision</option>
                        {availableDecisions.map((value) => <option key={value} value={value}>{DECISION_LABELS[value]}</option>)}
                      </select>
                    </label>
                    {['approve_suspension', 'approve_exceptional_suspension'].includes(decision) ? (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{decision === 'approve_exceptional_suspension' ? 'Exceptional suspension duration' : 'Approved suspension duration'} (1 month = 30 days; maximum 365 days)</p>
                        <div className="mt-1 grid grid-cols-2 gap-3">
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Months
                            <input type="number" min="0" max="12" step="1" value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
                          </label>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Additional days
                            <input type="number" min="0" max="29" step="1" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
                          </label>
                        </div>
                      </div>
                    ) : null}
                    <label className="mt-3 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {decision === 'return_for_investigation' ? 'Instructions for moderator' : decision === 'escalate_to_administrator' ? 'Escalation explanation' : decision === 'reject_recommendation' || decision === 'reject_permanent_ban' ? 'Rejection reason' : decision === 'approve_permanent_ban' ? 'Final ban justification' : 'Written explanation'}
                      <textarea value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} maxLength={5000} rows={5} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
                    </label>
                    {notice ? <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200" role="status">{notice}</p> : null}
                    <button type="button" disabled={submitting || !decision} onClick={() => void submitDecision()} className="mt-4 w-full rounded-full bg-sky-700 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
                      {submitting ? 'Saving…' : 'Submit Decision'}
                    </button>
                    {selectedCase.recommendation?.recommendation === 'recommend_permanent_ban' ? <p className="mt-3 text-xs text-slate-500">Permanent bans require final System Administrator authorization. This recommendation will not suspend the account unless that authorization is approved.</p> : null}
                  </section>
                ) : (
                  <section className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    This case is not awaiting a decision from your role.
                    {notice ? <p className="mt-2" role="status">{notice}</p> : null}
                  </section>
                )}
              </aside>
            </div>
          </AdminPanel>
        ) : null}

        {isOfficer ? <p className="text-xs text-slate-500">Private staff review data is loaded without caching. Changes appear after refreshing the case queue.</p> : null}
        {isAdministrator ? <p className="text-xs text-slate-500">Only escalated permanent-ban requests are available here. Final authorization is recorded in moderation history.</p> : null}
        <Link href={isOfficer ? '/info/admin/tourism-dashboard' : '/info/admin/dashboard'} className="text-sm font-semibold text-sky-700 underline dark:text-sky-300">
          Return to dashboard
        </Link>
      </div>
    </AdminShell>
  )
}
