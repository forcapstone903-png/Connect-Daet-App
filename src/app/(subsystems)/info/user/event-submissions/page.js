'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, CircleCheck, Clock3, Plus, XCircle } from 'lucide-react'

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
      </div>
    </main>
  )
}
