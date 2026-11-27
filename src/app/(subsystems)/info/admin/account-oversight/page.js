'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/app/(subsystems)/info/components/admin/AdminShell'
import AdminPanel from '@/app/(subsystems)/info/components/admin/AdminPanel'
import AdminStatCard, { AdminStatGrid } from '@/app/(subsystems)/info/components/admin/AdminStatCard'
import AccountStatusSelect, {
  ACCOUNT_STATUS_DESCRIPTIONS,
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_STATUS_OPTIONS,
} from '@/app/(subsystems)/info/components/admin/AccountStatusSelect'
import { formatSuspensionDuration, getTotalSuspensionDays } from '@/lib/suspensionDuration.mjs'

const EMPTY_STATS = {
  activeAccounts: 0,
  pendingReviews: 0,
  suspendedAccounts: 0,
  permanentBans: 0,
  pendingAppeals: 0,
  recentlyLiftedSuspensions: 0,
}

const REVIEW_LABELS = {
  pending_tourism_officer_review: 'Pending Tourism Officer Review',
  pending_administrator_review: 'Pending Administrator Review',
  approved_suspension: 'Suspension Approved',
  approved_permanent_ban: 'Permanent Ban Authorized',
  rejected: 'Rejected',
  returned: 'Returned for Investigation',
  reversed: 'Decision Reversed',
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatAction(value) {
  return String(value || 'No moderation action')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function AccountOversightPage() {
  const [role, setRole] = useState('')
  const [accounts, setAccounts] = useState([])
  const [stats, setStats] = useState(EMPTY_STATS)
  const [pagination, setPagination] = useState({ page: 1, pageCount: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [historyAccount, setHistoryAccount] = useState(null)
  const [durationMonths, setDurationMonths] = useState('0')
  const [durationDays, setDurationDays] = useState('7')
  const [reportId, setReportId] = useState('')
  const [finalBanConfirmed, setFinalBanConfirmed] = useState(false)
  const [requestedUserId, setRequestedUserId] = useState('')
  const [requestedStatus, setRequestedStatus] = useState('')
  const [loadedUserId, setLoadedUserId] = useState('')
  const handledStatusRequest = useRef(false)

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      q: query,
      status,
    })
    if (requestedUserId) params.set('userId', requestedUserId)
    return `/info/api/admin/account-oversight?${params.toString()}`
  }, [page, query, requestedUserId, status])

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(apiUrl, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load account oversight data.')
      setRole(result.role || '')
      setAccounts(Array.isArray(result.accounts) ? result.accounts : [])
      setStats(result.stats || EMPTY_STATS)
      setPagination(result.pagination || { page: 1, pageCount: 1, total: 0 })
      setLoadedUserId(requestedUserId)
    } catch (loadError) {
      console.error('Account Oversight load failed:', loadError)
      setError(loadError.message || 'Unable to load account oversight data.')
    } finally {
      setLoading(false)
    }
  }, [apiUrl, requestedUserId])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadAccounts() }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadAccounts])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search)
      setRequestedUserId(params.get('userId') || '')
      setRequestedStatus(params.get('requestedStatus') || '')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const openAction = useCallback((action, account, targetStatus = '') => {
    setModal({ action, account, targetStatus })
    setReason('')
    setDurationMonths('0')
    setDurationDays('7')
    setReportId('')
    setFinalBanConfirmed(false)
    setNotice('')
  }, [])

  const continueStatusChange = (account, targetStatus) => {
    if (role === 'moderator' && !['suspended', 'banned'].includes(targetStatus)) {
      return 'Moderators can only suspend or permanently ban an account.'
    }
    if (['admin', 'administrator', 'tourism_officer', 'moderator'].includes(String(account.user_type || '').toLowerCase())) {
      return 'Staff account status must be managed through staff administration.'
    }
    openAction('set_status', account, targetStatus)
    return ''
  }

  const submitAction = async (event) => {
    event.preventDefault()
    if (!modal) return
    const isStatusAction = modal.action === 'set_status'
    const reasonRequired = !isStatusAction || modal.targetStatus !== 'pending' || !reportId
    if ((reasonRequired && !reason.trim()) || (isStatusAction && modal.targetStatus === 'pending' && !reason.trim() && !reportId)) {
      setNotice(modal.targetStatus === 'pending'
        ? 'Provide a moderation reason or select a related report.'
        : 'A detailed reason is required.')
      return
    }
    if (isStatusAction && modal.targetStatus === 'banned' && !finalBanConfirmed) {
      setNotice('Confirm the permanent ban before submitting.')
      return
    }
    const suspensionDurationDays = isStatusAction && modal.targetStatus === 'suspended'
      ? getTotalSuspensionDays(durationMonths, durationDays)
      : null
    if (isStatusAction && modal.targetStatus === 'suspended' && suspensionDurationDays === null) {
      setNotice('Enter a valid duration from 1 to 365 days. Each month is 30 days.')
      return
    }
    setSubmitting(true)
    setNotice('')
    try {
      const response = await fetch('/info/api/admin/account-oversight', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: modal.action,
          userId: modal.account.id,
          investigationId: modal.account.reversible_investigation_id || modal.account.latest_investigation_id,
          status: isStatusAction ? modal.targetStatus : undefined,
          reportId: isStatusAction ? reportId || null : undefined,
          durationDays: suspensionDurationDays ?? undefined,
          reason: reason.trim(),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save this action.')
      setNotice([result.message, result.sessionRevocationWarning].filter(Boolean).join(' '))
      setModal(null)
      await loadAccounts()
    } catch (actionError) {
      setNotice(actionError.message || 'Unable to save this action.')
    } finally {
      setSubmitting(false)
    }
  }

  const activePage = Math.min(pagination.page || page, pagination.pageCount || 1)

  useEffect(() => {
    if (loading || loadedUserId !== requestedUserId || handledStatusRequest.current || !requestedUserId || !requestedStatus) return
    handledStatusRequest.current = true
    const timer = window.setTimeout(() => {
      if (!ACCOUNT_STATUS_OPTIONS.includes(requestedStatus)) {
        setNotice('The requested account status is not supported.')
        return
      }
      const account = accounts.find((item) => item.id === requestedUserId)
      if (!account) {
        setNotice('The selected account could not be found in Account Oversight.')
        return
      }
      openAction('set_status', account, requestedStatus)
      window.history.replaceState(null, '', '/info/admin/account-oversight')
      setRequestedUserId('')
      setRequestedStatus('')
    }, 0)
    return () => window.clearTimeout(timer)
  }, [accounts, loadedUserId, loading, openAction, requestedStatus, requestedUserId])

  return (
    <AdminShell
      roleLabel={role === 'tourism_officer' ? 'Tourism Officer' : role === 'moderator' ? 'Moderator' : 'Administrator'}
      eyebrow={role === 'admin' ? 'System Administration' : 'Moderation'}
      title="Account Oversight"
      description={role === 'tourism_officer'
        ? 'View community account status and open suspension cases for Tourism Officer review.'
        : role === 'moderator'
          ? 'Review community account status and apply reasoned suspensions or permanent bans.'
          : 'Review account status, escalated cases, restrictions, and appeal activity.'}
      headerIcon="users"
    >
      <div className="space-y-6">
        {role === 'tourism_officer' ? (
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Account status is read-only here. Review and decide suspension cases in{' '}
            <Link href="/info/admin/suspension-cases" className="font-semibold underline">Suspension Cases</Link>.
          </p>
        ) : null}
        <AdminStatGrid>
          <AdminStatCard label="Total Active Accounts" value={stats.activeAccounts} icon="users" tone="success" />
          <AdminStatCard label="Pending Reviews" value={stats.pendingReviews} icon="moderation" tone="warning" />
          <AdminStatCard label="Suspended Accounts" value={stats.suspendedAccounts} icon="lock" tone="danger" />
          <AdminStatCard label="Permanent Bans" value={stats.permanentBans} icon="lock" tone="danger" />
          <AdminStatCard label="Pending Appeals" value={stats.pendingAppeals} icon="feedback" tone="warning" />
          <AdminStatCard label="Recently Lifted Suspensions" value={stats.recentlyLiftedSuspensions} icon="analytics" tone="success" />
        </AdminStatGrid>

        {notice ? (
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" role="status">{notice}</p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>
        ) : null}

        <AdminPanel
          title="Account Management"
          description="Account status changes require an audited moderation workflow."
        >
          <details className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Account status definitions</summary>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              {ACCOUNT_STATUS_OPTIONS.map((item) => (
                <div key={item}>
                  <dt className="font-semibold text-slate-800">{ACCOUNT_STATUS_LABELS[item]}</dt>
                  <dd className="mt-1 leading-5 text-slate-600">{ACCOUNT_STATUS_DESCRIPTIONS[item]}</dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="account-search">Search accounts</label>
            <input
              id="account-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Search name, username, or email"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-600"
            />
            <label className="sr-only" htmlFor="account-status-filter">Filter by account status</label>
            <select
              id="account-status-filter"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setPage(1)
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-600"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3 font-semibold">User Name</th>
                  <th className="px-3 py-3 font-semibold">Email</th>
                  <th className="px-3 py-3 font-semibold">Account Status</th>
                  <th className="px-3 py-3 font-semibold">Violation Count</th>
                  <th className="px-3 py-3 font-semibold">Latest Moderation Action</th>
                  <th className="px-3 py-3 font-semibold">Suspension Expiration</th>
                  <th className="px-3 py-3 font-semibold">Review Status</th>
                  <th className="px-3 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 5 }, (_, row) => (
                    <tr key={`loading-${row}`} aria-hidden="true">
                      {Array.from({ length: 8 }, (_, column) => (
                        <td key={column} className="px-3 py-4">
                          <span className={`block h-4 animate-pulse rounded-full bg-slate-100 ${column === 0 ? 'w-4/5' : 'w-2/3'}`} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : accounts.length ? accounts.map((account) => {
                  const pendingAdminReview = account.review_status === 'pending_administrator_review'
                  return (
                    <tr key={account.id} className="align-top text-sm text-slate-700">
                      <td className="px-3 py-4 font-semibold text-slate-900">{account.full_name || account.username || '—'}</td>
                      <td className="px-3 py-4">{account.email || '—'}</td>
                      <td className="px-3 py-4">
                        {role === 'tourism_officer' ? (
                          <span className="inline-flex rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                            {ACCOUNT_STATUS_LABELS[account.status] || account.status}
                          </span>
                        ) : (
                          <AccountStatusSelect
                            key={`${account.id}-${account.status}`}
                            account={account}
                            statusOptions={role === 'moderator' ? ['suspended', 'banned'] : ACCOUNT_STATUS_OPTIONS}
                            onContinue={continueStatusChange}
                          />
                        )}
                      </td>
                      <td className="px-3 py-4">{account.violation_count}</td>
                      <td className="px-3 py-4">
                        {account.latest_moderation_action ? (
                          <span title={account.latest_moderation_action.reason}>
                            {formatAction(account.latest_moderation_action.decision_type)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-4">{formatDate(account.suspension_expires_at)}</td>
                      <td className="px-3 py-4">
                        {REVIEW_LABELS[account.review_status] || (account.review_status ? formatAction(account.review_status) : 'No review')}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-col items-start gap-2">
                          {role === 'admin' && pendingAdminReview ? (
                            <Link
                              href={`/info/admin/suspension-cases?case=${encodeURIComponent(account.latest_investigation_id)}`}
                              className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                            >
                              Review case
                            </Link>
                          ) : null}
                          {role === 'admin' && account.status === 'suspended' ? (
                            <button type="button" onClick={() => openAction('lift_suspension', account)} className="font-semibold text-sky-700 hover:text-sky-900">
                              Lift suspension
                            </button>
                          ) : null}
                          {role === 'admin' && ['suspended', 'banned'].includes(account.status) && account.reversible_investigation_id ? (
                            <button type="button" onClick={() => openAction('reverse_decision', account)} className="font-semibold text-amber-700 hover:text-amber-900">
                              Reverse decision
                            </button>
                          ) : null}
                          {role === 'tourism_officer' && account.review_status === 'pending_tourism_officer_review' && account.latest_investigation_id ? (
                            <Link
                              href={`/info/admin/suspension-cases?case=${encodeURIComponent(account.latest_investigation_id)}`}
                              className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                            >
                              Review suspension case
                            </Link>
                          ) : null}
                          <button type="button" onClick={() => setHistoryAccount(account)} className="font-semibold text-slate-600 hover:text-slate-900">
                            Moderation history
                          </button>
                          {role !== 'tourism_officer' && role !== 'admin' && !pendingAdminReview && account.status !== 'suspended' && !(['banned'].includes(account.status) && account.reversible_investigation_id) ? <span className="text-xs text-slate-400">No action available</span> : null}
                        </div>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">No accounts match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <p>{pagination.total || 0} accounts · Page {activePage} of {pagination.pageCount || 1}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading || activePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={loading || activePage >= (pagination.pageCount || 1)}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </AdminPanel>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <form onSubmit={submitAction} role={modal.action === 'set_status' && modal.targetStatus === 'banned' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="account-action-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="account-action-title" className="text-lg font-bold text-slate-900">
              {modal.action === 'set_status'
                ? modal.targetStatus === 'banned' ? 'Confirm Permanent Ban' : `Change Account Status to ${ACCOUNT_STATUS_LABELS[modal.targetStatus]}`
                : modal.action === 'lift_suspension' ? 'Lift Suspension' : 'Reverse Moderation Decision'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {modal.account.full_name || modal.account.email} · {ACCOUNT_STATUS_LABELS[modal.account.status] || modal.account.status}
            </p>
            {modal.action === 'set_status' && modal.targetStatus === 'pending' ? (
              <>
                <label htmlFor="account-related-report" className="mt-5 block text-sm font-semibold text-slate-800">Related open report (optional)</label>
                <select
                  id="account-related-report"
                  value={reportId}
                  onChange={(event) => setReportId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <option value="">No report selected</option>
                  {(modal.account.open_reports || []).map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.report_type || 'Report'} · {report.reason || 'No reason'} · {formatDate(report.created_at)}
                    </option>
                  ))}
                </select>
                {!(modal.account.open_reports || []).length ? <p className="mt-1 text-xs text-slate-500">No open report is currently linked to this account.</p> : null}
              </>
            ) : null}
            {modal.action === 'set_status' && modal.targetStatus === 'suspended' ? (
              <>
                <p className="mt-5 text-sm font-semibold text-slate-800">Suspension duration (1 month = 30 days; maximum 365 days)</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label htmlFor="account-suspension-months" className="text-xs font-medium text-slate-600">
                    Months
                    <input id="account-suspension-months" type="number" min="0" max="12" step="1" value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" />
                  </label>
                  <label htmlFor="account-suspension-days" className="text-xs font-medium text-slate-600">
                    Additional days
                    <input id="account-suspension-days" type="number" min="0" max="29" step="1" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" />
                  </label>
                </div>
                <p className="mt-2 text-xs text-slate-500">The account will be restored automatically when the approved suspension expires, unless another restriction remains.</p>
              </>
            ) : null}
            <label htmlFor="account-action-reason" className="mt-5 block text-sm font-semibold text-slate-800">
              {modal.action === 'set_status'
                ? modal.targetStatus === 'pending'
                  ? 'Moderation reason or context'
                  : modal.targetStatus === 'active'
                    ? 'Reason for restoring account access'
                    : modal.targetStatus === 'banned'
                      ? 'Final ban reason'
                      : 'Suspension reason'
                : modal.action === 'lift_suspension' ? 'Reason for lifting the suspension' : 'Detailed reversal explanation'}
            </label>
            <textarea
              id="account-action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={5000}
              required={!(modal.action === 'set_status' && modal.targetStatus === 'pending' && reportId)}
              rows={5}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-600"
            />
            {modal.action === 'set_status' && modal.targetStatus === 'banned' ? (
              <label className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <input
                  type="checkbox"
                  checked={finalBanConfirmed}
                  onChange={(event) => setFinalBanConfirmed(event.target.checked)}
                  className="mt-1"
                />
                <span>I understand this permanently restricts this account from logging in and will send a ban notification.</span>
              </label>
            ) : null}
            {modal.action === 'set_status' && modal.targetStatus === 'active' ? (
              <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Account-level suspensions or bans will be lifted. Separate posting-only restrictions remain in effect.</p>
            ) : null}
            {notice ? <p className="mt-3 text-sm text-red-700" role="alert">{notice}</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={submitting} onClick={() => setModal(null)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting
                  || (!reason.trim() && !(modal.action === 'set_status' && modal.targetStatus === 'pending' && reportId))
                  || (modal.action === 'set_status' && modal.targetStatus === 'banned' && !finalBanConfirmed)}
                className={`rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 ${modal.action === 'set_status' && modal.targetStatus === 'banned' ? 'bg-red-700 hover:bg-red-800' : 'bg-sky-700'}`}
              >
                {submitting ? 'Saving…' : modal.action === 'set_status' && modal.targetStatus === 'banned' ? 'Confirm Permanent Ban' : 'Confirm Status Change'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {historyAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="moderation-history-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="moderation-history-title" className="text-lg font-bold text-slate-900">Moderation History</h2>
            <p className="mt-1 text-sm text-slate-600">{historyAccount.full_name || historyAccount.username || historyAccount.email}</p>
            {(historyAccount.moderation_history || []).length ? (
              <div className="mt-4 divide-y divide-slate-100">
                {historyAccount.moderation_history.map((item) => (
                  <article key={item.id} className="py-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-semibold text-slate-900">{formatAction(item.decision_type)} · {formatDate(item.created_at)}</p>
                      <p className="text-xs text-slate-500">Admin ID: {item.reviewer_id || 'System'}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {ACCOUNT_STATUS_LABELS[item.previous_status] || item.previous_status || '—'} → {ACCOUNT_STATUS_LABELS[item.new_status] || item.new_status || '—'}
                      {item.suspension_duration_days ? ` · ${formatSuspensionDuration(item.suspension_duration_days)}` : ''}
                      {item.expires_at ? ` · Expires ${formatDate(item.expires_at)}` : ''}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.reason}</p>
                  </article>
                ))}
              </div>
            ) : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No moderation decisions have been recorded for this account.</p>}
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setHistoryAccount(null)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </AdminShell>
  )
}
