'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, Loader, MapPin, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function formatDateRange(startDate, endDate) {
  if (!startDate) return 'TBA'
  const start = new Date(`${startDate}T00:00:00`)
  const label = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  if (endDate && endDate !== startDate) {
    const end = new Date(`${endDate}T00:00:00`)
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' })}`
    }
    return `${label} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  return label
}

function getCategoryColor(category) {
  const colors = {
    festival: 'bg-purple-100 text-purple-700',
    concert: 'bg-red-100 text-red-700',
    exhibition: 'bg-yellow-100 text-yellow-700',
    workshop: 'bg-blue-100 text-blue-700',
    sports: 'bg-cyan-100 text-cyan-700',
    cultural: 'bg-pink-100 text-pink-700',
  }
  return colors[category] || 'bg-slate-100 text-slate-700'
}

export default function EventsIndexPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let ignore = false

    const loadEvents = async () => {
      setLoading(true)
      setError('')
      try {
        const today = new Date().toISOString().slice(0, 10)
        const { data, error } = await supabase
          .from('info_events')
          .select('id, title, description, location, venue, start_date, end_date, start_time, category, featured_image, is_free, ticket_price')
          .eq('status', 'published')
          .gte('end_date', today)
          .order('start_date', { ascending: true })

        if (error) {
          console.error('Events index load failed:', error)
          if (!ignore) setError('We could not load events right now. Please try again in a moment.')
          return
        }
        if (!ignore) setEvents(data || [])
      } catch (err) {
        console.error('Events index fetch failed:', err)
        if (!ignore) setError('We could not load events right now. Please try again in a moment.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    void loadEvents()

    return () => {
      ignore = true
    }
  }, [retryKey])

  const categories = useMemo(() => {
    const set = new Set(events.filter((event) => event.category).map((event) => event.category))
    return ['all', ...set]
  }, [events])

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((event) => {
      const matchesCategory = category === 'all' || event.category === category
      const matchesSearch =
        !q ||
        event.title?.toLowerCase().includes(q) ||
        event.description?.toLowerCase().includes(q) ||
        event.location?.toLowerCase().includes(q) ||
        event.venue?.toLowerCase().includes(q)
      return matchesCategory && matchesSearch
    })
  }, [events, search, category])

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[1200px] px-3 pb-12 pt-3 sm:px-4 lg:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/visitor"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-sky-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>

        {/* Hero */}
        <div className="rounded-[24px] bg-gradient-to-br from-sky-600 via-sky-700 to-emerald-700 p-6 text-white shadow-lg sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-200">Daet Events</p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.02em] sm:text-4xl">Upcoming events in Daet</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-sky-100">
            Festivals, concerts, workshops, and community gatherings happening across Camarines Norte.
          </p>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events..."
              aria-label="Search events"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${category === 'all' ? 'bg-sky-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              All
            </button>
            {categories.filter((item) => item !== 'all').map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${category === item ? 'bg-sky-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
{/* States */}
        {loading && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <Loader className="h-8 w-8 animate-spin text-sky-600" />
            <p className="text-sm text-slate-500">Loading events...</p>
          </div>
        )}

        {!loading && error && (
          <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => setRetryKey((value) => value + 1)}
              className="mt-4 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && filteredEvents.length === 0 && (
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {search || category !== 'all' ? 'No events match your filters.' : 'No upcoming events have been published yet.'}
            </p>
            <p className="mt-1 text-sm text-slate-500">Check back soon — new events are added regularly.</p>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setCategory('all')
                }}
                className="mt-4 text-sm font-semibold text-sky-600 transition hover:text-sky-800"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Event Grid */}
        {!loading && !error && filteredEvents.length > 0 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="group overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative h-44 w-full">
                  {event.featured_image ? (
                    <img
                      src={event.featured_image}
                      alt={event.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 to-emerald-100">
                      <CalendarDays className="h-12 w-12 text-sky-400" />
                    </div>
                  )}
                  <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getCategoryColor(event.category)}`}>
                    {event.category || 'General'}
                  </span>
                  {event.is_free && (
                    <span className="absolute left-3 top-3 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      Free
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="line-clamp-2 text-base font-black text-slate-900">{event.title}</h2>
                  <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                    <p className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-sky-600" />
                      {formatDateRange(event.start_date, event.end_date)}
                      {event.start_time ? ` · ${event.start_time}` : ''}
                    </p>
                    {(event.location || event.venue) && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-sky-600" />
                        <span className="truncate">{event.location || event.venue}</span>
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs font-bold text-sky-700">
                      {event.is_free ? 'Free entry' : event.ticket_price ? `₱${event.ticket_price}` : 'Details inside'}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 transition group-hover:text-sky-600">View →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}