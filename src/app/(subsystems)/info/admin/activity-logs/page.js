'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, RefreshCw, Search } from 'lucide-react'
import { AdminEmptyState, AdminPagination, AdminPanel, AdminShell, AdminTable } from '@/app/(subsystems)/info/components/admin'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const INITIAL_FILTERS = { search: '', activityType: '', from: '', to: '' }
const ACTIVITY_TYPES = [
  ['login', 'Login'],
  ['new_post', 'New post'],
  ['comment', 'Comment'],
  ['react_content', 'Reaction'],
  ['share_content', 'Share'],
  ['save_content', 'Save'],
  ['follow', 'Follow'],
  ['mention', 'Mention'],
  ['message', 'Message'],
  ['event', 'Event'],
  ['visit_dashboard', 'Dashboard visit'],
  ['content_impression', 'Content impression'],
]
const AUDIT_TYPES = [
  ['login_succeeded', 'Successful sign-in'],
  ['login_failed', 'Failed sign-in'],
  ['role_change', 'Staff role changed'],
  ['account_created', 'Staff account created'],
  ['password_reset_by_admin', 'Password reset'],
  ['setting_updated', 'Administrator setting updated'],
  ['alert_sent', 'Alert sent'],
  ['alert_scheduled', 'Alert scheduled'],
  ['alert_drafted', 'Alert drafted'],
  ['alert_edited', 'Alert edited'],
  ['alert_cancelled', 'Alert cancelled'],
  ['alert_withdrawn', 'Alert withdrawn'],
  ['alert_all_clear', 'All clear'],
]

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function csvCell(value) {
  const text = String(value ?? '')
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

export default function AdminActivityLogsPage() {
  const [activities, setActivities] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [source, setSource] = useState('system')
  const [draftFilters, setDraftFilters] = useState({ search: '', activityType: '', from: '', to: '' })
  const [filters, setFilters] = useState({ search: '', activityType: '', from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const fetchActivities = useCallback(async (requestedPage, requestedPageSize, requestedFilters, before, requestedSource) => {
    const params = new URLSearchParams({
      page: String(requestedPage),
      limit: String(requestedPageSize),
    })
    if (requestedSource === 'community') params.set('scope', 'recent')
    Object.entries(requestedFilters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    if (before) params.set('before', before)

    const endpoint = requestedSource === 'system'
      ? '/info/api/admin/audit-logs'
      : '/info/api/activity/track'
    const response = await fetch(`${endpoint}?${params}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Unable to load activity logs.')
    }
    return { activities: result.activities || [], total: result.total || 0 }
  }, [])

  const loadActivities = useCallback(async (requestedPage = page, requestedPageSize = pageSize, requestedFilters = filters, requestedSource = source) => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchActivities(requestedPage, requestedPageSize, requestedFilters, undefined, requestedSource)
      setActivities(result.activities)
      setTotal(result.total)
      setPage(requestedPage)
      setPageSize(requestedPageSize)
    } catch (loadError) {
      console.error('Admin activity log load failed:', loadError)
      setError(loadError.message || 'Unable to load activity logs.')
    } finally {
      setLoading(false)
    }
  }, [fetchActivities, filters, page, pageSize, source])

  useEffect(() => {
    let active = true
    fetchActivities(1, 25, INITIAL_FILTERS, undefined, source)
      .then((result) => {
        if (!active) return
        setActivities(result.activities)
        setTotal(result.total)
      })
      .catch((loadError) => {
        console.error('Admin activity log load failed:', loadError)
        if (active) setError(loadError.message || 'Unable to load activity logs.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchActivities, source])

  const applyFilters = (event) => {
    event.preventDefault()
    const nextFilters = { ...draftFilters, search: draftFilters.search.trim() }
    setFilters(nextFilters)
    void loadActivities(1, pageSize, nextFilters)
  }

  const exportActivities = async () => {
    setExporting(true)
    setError('')
    try {
      const before = new Date().toISOString()
      const exportPageSize = 100
      const firstPage = await fetchActivities(1, exportPageSize, filters, before, source)
      const allActivities = [...firstPage.activities]
      const pageCount = Math.ceil(firstPage.total / exportPageSize)

      for (let currentPage = 2; currentPage <= pageCount; currentPage += 1) {
        const result = await fetchActivities(currentPage, exportPageSize, filters, before, source)
        allActivities.push(...result.activities)
      }

      const rows = [
        ['User', 'Email', 'Activity', 'Entity type', 'Entity ID', 'Details', 'Date'],
        ...allActivities.map((item) => [
          item.info_users?.full_name || item.info_users?.email || (source === 'system' ? 'Unidentified sign-in' : 'User'),
          item.info_users?.email || '',
          String(item.activity_type || 'activity').replace(/[_-]/g, ' '),
          item.entity_type || '',
          item.entity_id || '',
          item.description || `${item.entity_type || 'Content'} interaction`,
          item.created_at || '',
        ]),
      ]
      const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${source === 'system' ? 'system_audit' : 'community_activity'}_${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (exportError) {
      console.error('Admin activity log export failed:', exportError)
      setError(exportError.message || 'Unable to export activity logs.')
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const firstVisible = total ? (page - 1) * pageSize + 1 : 0
  const lastVisible = Math.min(page * pageSize, total)

  return (
    <AdminShell
      title="Activity logs"
      eyebrow="Administration"
      description="Review system audit events and community activity, with filtering and CSV export."
      headerIcon="analytics"
    >
      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <AdminPanel
          title={source === 'system' ? 'System audit log' : 'Community activity'}
          description={source === 'system'
            ? 'Administrative actions and sign-in events. Failed sign-ins are recorded without storing the submitted email.'
            : 'User engagement and content interactions. Export downloads all matching records.'}
          bodyClassName="!p-0"
          actions={(
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void loadActivities()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
              </button>
              <button type="button" onClick={() => void exportActivities()} disabled={exporting || loading || total === 0} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                <Download className="h-4 w-4" />{exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          )}
        >
          <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4" role="tablist" aria-label="Activity log type">
            {[
              ['system', 'System audit'],
              ['community', 'Community activity'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={source === value}
                onClick={() => {
                  const cleared = { ...INITIAL_FILTERS }
                  setSource(value)
                  setDraftFilters(cleared)
                  setFilters(cleared)
                  setPage(1)
                  void loadActivities(1, pageSize, cleared, value)
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${source === value ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={applyFilters} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-5">
            <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 xl:col-span-2">
              <Search className="h-4 w-4 shrink-0" />
              <input value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search activities or details" className="w-full bg-transparent text-slate-800 outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Activity type
              <select value={draftFilters.activityType} onChange={(event) => setDraftFilters((current) => ({ ...current, activityType: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700">
                <option value="">All activity</option>
                {(source === 'system' ? AUDIT_TYPES : ACTIVITY_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              From
              <input type="date" value={draftFilters.from} max={draftFilters.to || undefined} onChange={(event) => setDraftFilters((current) => ({ ...current, from: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              To
              <input type="date" value={draftFilters.to} min={draftFilters.from || undefined} onChange={(event) => setDraftFilters((current) => ({ ...current, to: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700" />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-5">
              <button type="submit" disabled={loading} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Apply filters</button>
              <button type="button" disabled={loading} onClick={() => {
                const cleared = { search: '', activityType: '', from: '', to: '' }
                setDraftFilters(cleared)
                setFilters(cleared)
                void loadActivities(1, pageSize, cleared)
              }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Clear</button>
            </div>
          </form>

          {error ? <p role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          {loading ? (
            <div className="space-y-3 p-5" aria-label="Loading activity logs">
              {[0, 1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : activities.length ? (
            <AdminTable wrapClassName="border-0 shadow-none">
              <thead>
                <tr><th scope="col">User</th><th scope="col">Activity</th><th scope="col">Details</th><th scope="col">Date</th></tr>
              </thead>
              <tbody>
                {activities.map((item) => (
                  <tr key={item.id}>
                    <td className="min-w-[160px] font-semibold text-slate-800">{item.info_users?.full_name || item.info_users?.email || (source === 'system' ? 'Unidentified sign-in' : 'User')}</td>
                    <td className="min-w-[130px] capitalize">{String(item.activity_type || 'activity').replace(/[_-]/g, ' ')}</td>
                    <td className="min-w-[240px] whitespace-normal">{item.description || `${item.entity_type || 'Content'} interaction`}</td>
                    <td className="min-w-[170px]">{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          ) : (
            <div className="p-8"><AdminEmptyState icon="analytics" title="No activity found" description="Try changing or clearing the filters." /></div>
          )}

          {!loading && (
            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500" aria-live="polite">Showing {firstVisible}–{lastVisible} of {total} activities</p>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  Rows per page
                  <select value={pageSize} onChange={(event) => void loadActivities(1, Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                    {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
                <AdminPagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={total}
                  pageSize={pageSize}
                  onPageChange={(nextPage) => void loadActivities(nextPage)}
                  disabled={loading}
                  showSummary={false}
                />
              </div>
            </div>
          )}
        </AdminPanel>
      </div>
    </AdminShell>
  )
}
