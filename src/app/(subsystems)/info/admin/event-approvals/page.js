'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import Image from 'next/image'
import {
  AdminBadge,
  AdminEmptyState,
  AdminPagination,
  AdminPanel,
  AdminSearch,
  AdminShell,
  AdminStatCard,
  AdminStatGrid,
  AdminTable,
  AdminTableFooter,
  AdminToolbar,
} from '@/app/(subsystems)/info/components/admin'

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'history', label: 'Review history' },
]

const EMPTY_STATS = { total: 0, pending: 0, approved: 0, rejected: 0 }

function formatDate(value) {
  if (!value) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = dateOnly
    ? new Date(`${value}T00:00:00`)
    : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateOnly
    ? date.toLocaleDateString(undefined, { dateStyle: 'medium' })
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AdminEventApprovalsPage() {
  const [status, setStatus] = useState('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [events, setEvents] = useState([])
  const [history, setHistory] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 })
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [rejectingEvent, setRejectingEvent] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '10',
      ...(status === 'history' ? { view: 'history' } : { status }),
    })
    if (status !== 'history' && search.trim()) params.set('search', search.trim())

    try {
      const response = await fetch(`/info/api/admin/events?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load event approvals.')
      setStats(result.stats || EMPTY_STATS)
      setPagination(result.pagination || { page: 1, pages: 0, total: 0 })
      if (status === 'history') setHistory(result.history || [])
      else setEvents(result.events || [])
    } catch (loadError) {
      console.error('Event approvals load failed:', loadError)
      setError(loadError.message || 'Unable to load event approvals.')
      setEvents([])
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [page, search, status])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [loadData, search])

  const moderate = async (event, decision, reason = '') => {
    setActionId(event.id)
    setError('')
    try {
      const response = await fetch(`/info/api/admin/events/${event.id}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save the moderation decision.')
      setSelectedEvent(null)
      setRejectingEvent(null)
      setRejectionReason('')
      await loadData()
    } catch (actionError) {
      console.error('Event moderation action failed:', actionError)
      setError(actionError.message || 'Unable to save the moderation decision.')
    } finally {
      setActionId('')
    }
  }

  const changeTab = (nextStatus) => {
    setPage(1)
    setStatus(nextStatus)
  }

  return (
    <AdminShell
      title="Event approvals"
      eyebrow="Content management"
      description="Review event proposals submitted by community members. Events remain private until approved."
      headerIcon="events"
    >
      <div className="space-y-5">
        <AdminStatGrid className="!mb-0">
          <AdminStatCard label="Total submissions" value={stats.total} icon="events" />
          <AdminStatCard label="Pending review" value={stats.pending} icon="moderation" />
          <AdminStatCard label="Approved" value={stats.approved} icon="check" />
          <AdminStatCard label="Rejected" value={stats.rejected} icon="close" />
        </AdminStatGrid>

        <AdminPanel
          title="Submitted events"
          description="Event proposals below are loaded directly from the events database."
          bodyClassName="!p-0"
          actions={status !== 'history' ? (
            <AdminSearch value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search event titles" />
          ) : null}
        >
          <AdminToolbar className="rounded-none border-x-0 border-t-0">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Event approval status">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={status === tab.id}
                  onClick={() => changeTab(tab.id)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${status === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {tab.label}{tab.id === 'pending' ? ` (${stats.pending})` : ''}
                </button>
              ))}
            </div>
          </AdminToolbar>

          {error && <p role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {status === 'history' ? (
            loading ? <p className="p-6 text-sm text-slate-500">Loading event review history…</p> : history.length ? (
              <AdminTable wrapClassName="border-0 shadow-none">
                <thead><tr><th scope="col">Event</th><th scope="col">Author</th><th scope="col">Decision</th><th scope="col">Reason</th><th scope="col">Reviewed by</th><th scope="col">Date</th></tr></thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td className="min-w-[180px] font-semibold text-slate-800">{item.event_title}</td>
                      <td>{item.author?.full_name || item.author?.email || 'Unknown author'}</td>
                      <td><AdminBadge status={item.action} /></td>
                      <td className="max-w-xs whitespace-normal">{item.reason || '—'}</td>
                      <td>{item.reviewer?.full_name || item.reviewer?.email || 'Administrator'}</td>
                      <td className="min-w-[170px]">{formatDate(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            ) : <AdminEmptyState className="!py-6" icon="analytics" title="No moderation history yet" description="Administrator decisions will be recorded here." />
          ) : loading ? (
            <div className="space-y-3 p-5" aria-label="Loading event submissions">
              {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : events.length ? (
            <>
              <AdminTable wrapClassName="border-0 shadow-none">
                <thead>
                  <tr><th scope="col">Event</th><th scope="col">Author</th><th scope="col">Category</th><th scope="col">Event date</th><th scope="col">Submitted</th><th scope="col">Status</th><th scope="col">Actions</th></tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className="min-w-[180px]">
                        <button type="button" onClick={() => setSelectedEvent(event)} className="text-left font-semibold text-slate-800 hover:text-blue-700">{event.title}</button>
                        <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{event.location || event.venue || 'Location not specified'}</p>
                      </td>
                      <td className="min-w-[130px]">{event.author?.full_name || event.author?.email || 'Unknown author'}</td>
                      <td className="capitalize">{event.category}</td>
                      <td className="min-w-[130px]">{formatDate(event.start_date)}</td>
                      <td className="min-w-[150px]">{formatDate(event.submitted_at)}</td>
                      <td><AdminBadge status={event.approval_status} /></td>
                      <td>
                        <div className="flex min-w-[150px] gap-2">
                          <button type="button" onClick={() => setSelectedEvent(event)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Preview</button>
                          {status === 'pending' && <>
                            <button type="button" disabled={Boolean(actionId)} onClick={() => void moderate(event, 'approve')} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Check className="inline h-3.5 w-3.5" /> Approve</button>
                            <button type="button" disabled={Boolean(actionId)} onClick={() => { setRejectingEvent(event); setRejectionReason('') }} className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"><X className="inline h-3.5 w-3.5" /> Reject</button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
              {pagination.pages > 1 ? (
                <AdminTableFooter>
                  <AdminPagination
                    page={pagination.page}
                    totalPages={pagination.pages}
                    totalItems={pagination.total}
                    pageSize={10}
                    itemLabel="events"
                    onPageChange={setPage}
                  />
                </AdminTableFooter>
              ) : null}
            </>
          ) : (
            <AdminEmptyState
              className="!py-6"
              icon={status === 'pending' ? 'moderation' : 'events'}
              title={status === 'pending' ? 'No events awaiting review' : 'No events found'}
              description={status === 'pending' ? 'New submissions from the event form will appear here.' : 'There are no event submissions in this view.'}
            />
          )}
        </AdminPanel>
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedEvent(null) }}>
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="event-preview-title">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Event submission · {selectedEvent.title}</p><h2 id="event-preview-title" className="mt-2 text-xl font-black text-slate-900">{selectedEvent.title}</h2></div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close preview"><X className="h-5 w-5" /></button>
            </div>
            {selectedEvent.featured_image && <Image src={selectedEvent.featured_image} alt="" width={1200} height={600} unoptimized className="mt-5 max-h-72 w-full rounded-xl object-cover" />}
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <p><strong>Author:</strong> {selectedEvent.author?.full_name || selectedEvent.author?.email || 'Unknown author'}</p>
              <p><strong>Submitted:</strong> {formatDate(selectedEvent.submitted_at)}</p>
              <p><strong>Event date:</strong> {formatDate(selectedEvent.start_date)}{selectedEvent.end_date ? ` – ${formatDate(selectedEvent.end_date)}` : ''}</p>
              <p><strong>Time:</strong> {selectedEvent.start_time || 'Not specified'}{selectedEvent.end_time ? ` – ${selectedEvent.end_time}` : ''}</p>
              <p><strong>Location:</strong> {selectedEvent.location || selectedEvent.venue || 'Not specified'}</p>
              <p><strong>Category:</strong> <span className="capitalize">{selectedEvent.category}</span></p>
              <p><strong>Admission:</strong> {selectedEvent.is_free ? 'Free' : `Paid · ${selectedEvent.ticket_price ?? 'price not set'}`}</p>
            </div>
            <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">{selectedEvent.description || 'No description provided.'}</div>
            {selectedEvent.rejection_reason && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><strong>Rejection reason:</strong> {selectedEvent.rejection_reason}</p>}
            {selectedEvent.approval_status === 'pending' && (
              <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" disabled={Boolean(actionId)} onClick={() => { setSelectedEvent(null); setRejectingEvent(selectedEvent); setRejectionReason('') }} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">Reject</button>
                <button type="button" disabled={Boolean(actionId)} onClick={() => void moderate(selectedEvent, 'approve')} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve and publish</button>
              </div>
            )}
          </section>
        </div>
      )}

      {rejectingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !actionId) setRejectingEvent(null) }}>
          <section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="reject-event-title">
            <h2 id="reject-event-title" className="text-lg font-black text-slate-900">Reject event proposal</h2>
            <p className="mt-1 text-sm text-slate-600">{rejectingEvent.title}</p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Rejection reason
              <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} rows={4} required className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Explain what should be changed or why the event cannot be published." />
            </label>
            {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={Boolean(actionId)} onClick={() => setRejectingEvent(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={!rejectionReason.trim() || Boolean(actionId)} onClick={() => void moderate(rejectingEvent, 'reject', rejectionReason)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Reject event</button>
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  )
}
