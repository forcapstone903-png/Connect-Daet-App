'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, CircleCheck, Clock3, LoaderCircle, Pencil, Plus, X, XCircle } from 'lucide-react'

const STATUS_STYLES = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-rose-200 bg-rose-50 text-rose-800',
}

function formatDate(value) {
  if (!value) return 'Date to be announced'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? 'Date to be announced'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatSubmittedAt(value) {
  if (!value) return 'Submission date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Submission date unavailable'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EventSubmissionsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingEvent, setEditingEvent] = useState(null)
  const [savingEvent, setSavingEvent] = useState(false)

  useEffect(() => {
    let active = true
    const loadEvents = async () => {
      try {
        const response = await fetch('/info/api/user/events', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        if (response.status === 401) {
          window.location.assign('/info/login')
          return
        }
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to load your event submissions.')
        }
        if (active) setEvents(result.events || [])
      } catch (loadError) {
        console.error('Event submissions load failed:', loadError)
        if (active) setError(loadError.message || 'Unable to load your event submissions.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadEvents()
    return () => { active = false }
  }, [])

  const updateEventField = (field, value) => {
    setEditingEvent((current) => current ? { ...current, [field]: value } : current)
  }

  const resubmitEvent = async (event) => {
    event.preventDefault()
    if (!editingEvent) return
    setSavingEvent(true)
    setError('')
    try {
      const response = await fetch(`/info/api/user/events/${editingEvent.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingEvent),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to resubmit your event.')
      setEvents((current) => current.map((item) => item.id === editingEvent.id
        ? { ...item, ...editingEvent, approval_status: 'pending', submitted_at: result.event.submitted_at, rejection_reason: null, reviewed_at: null }
        : item))
      setEditingEvent(null)
    } catch (saveError) {
      console.error('Event resubmission failed:', saveError)
      setError(saveError.message || 'Unable to resubmit your event.')
    } finally {
      setSavingEvent(false)
    }
  }

  return (
    <main className="usr-section-page min-h-screen px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/info/user/blogs/new" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" />Create content
        </Link>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Event proposals</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">My event submissions</h1>
            <p className="mt-2 text-sm text-slate-600">Events stay private until an administrator approves them.</p>
          </div>
          <Link href="/info/user/blogs/new" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />Submit event
          </Link>
        </header>

        {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        {loading ? (
          <div className="space-y-3" aria-label="Loading event submissions">
            {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-200" />)}
          </div>
        ) : !events.length && !error ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-slate-400" />
            <h2 className="mt-3 text-base font-bold text-slate-800">No event proposals yet</h2>
            <p className="mt-1 text-sm text-slate-500">Submit an event and track its review status here.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => {
              const status = ['pending', 'approved', 'rejected'].includes(event.approval_status)
                ? event.approval_status
                : 'pending'
              const StatusIcon = status === 'approved' ? CircleCheck : status === 'rejected' ? XCircle : Clock3
              return (
                <li key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-bold text-slate-900">{event.title}</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(event.start_date)}{event.location ? ` · ${event.location}` : ''} · Submitted {formatSubmittedAt(event.submitted_at)}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[status]}`}>
                      <StatusIcon className="h-3.5 w-3.5" />{status === 'pending' ? 'Pending approval' : status}
                    </span>
                  </div>
                  {status === 'rejected' && event.rejection_reason && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <p className="text-xs font-bold text-rose-800">Administrator feedback</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-rose-700">{event.rejection_reason}</p>
                    </div>
                  )}
                  {status === 'rejected' && (
                    <button
                      type="button"
                      onClick={() => setEditingEvent({
                        ...event,
                        end_date: event.end_date || event.start_date || '',
                        start_time: event.start_time || '',
                        end_time: event.end_time || '',
                        location: event.location || '',
                        organizer: event.organizer || '',
                        category: event.category || 'festival',
                        is_free: event.is_free !== false,
                        ticket_price: event.is_free === false ? String(event.ticket_price ?? '') : '',
                      })}
                      className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 hover:bg-blue-100"
                    >
                      <Pencil className="h-4 w-4" />Edit and resubmit
                    </button>
                  )}
                  {status === 'approved' && (
                    <Link href={`/info/user/events/${event.id}`} className="mt-3 inline-flex text-xs font-bold text-blue-700 hover:text-blue-900">
                      View published event
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {editingEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
            <form onSubmit={resubmitEvent} className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Administrator feedback</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">Edit and resubmit event</h2>
                </div>
                <button type="button" onClick={() => setEditingEvent(null)} aria-label="Close event editor" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Event title
                  <input required maxLength={180} value={editingEvent.title || ''} onChange={(e) => updateEventField('title', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">Category
                  <select required value={editingEvent.category} onChange={(e) => updateEventField('category', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal">
                    {['festival', 'concert', 'exhibition', 'workshop', 'sports', 'cultural'].map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">Organizer
                  <input maxLength={180} value={editingEvent.organizer} onChange={(e) => updateEventField('organizer', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">Start date
                  <input required type="date" value={editingEvent.start_date || ''} onChange={(e) => updateEventField('start_date', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">End date
                  <input type="date" min={editingEvent.start_date || undefined} value={editingEvent.end_date} onChange={(e) => updateEventField('end_date', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">Start time
                  <input type="time" value={editingEvent.start_time} onChange={(e) => updateEventField('start_time', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-semibold text-slate-700">End time
                  <input type="time" value={editingEvent.end_time} onChange={(e) => updateEventField('end_time', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Location
                  <input maxLength={240} value={editingEvent.location} onChange={(e) => updateEventField('location', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Description
                  <textarea required maxLength={10000} rows={6} value={editingEvent.description || ''} onChange={(e) => updateEventField('description', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                </label>
                <label className="sm:col-span-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={editingEvent.is_free} onChange={(e) => setEditingEvent((current) => ({ ...current, is_free: e.target.checked, ticket_price: e.target.checked ? '' : current.ticket_price }))} />
                  This event is free
                </label>
                {!editingEvent.is_free && (
                  <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Ticket price
                    <input required type="number" min="0" step="0.01" value={editingEvent.ticket_price} onChange={(e) => updateEventField('ticket_price', e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
                  </label>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingEvent(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button>
                <button type="submit" disabled={savingEvent} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                  {savingEvent && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {savingEvent ? 'Submitting…' : 'Resubmit for approval'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}
