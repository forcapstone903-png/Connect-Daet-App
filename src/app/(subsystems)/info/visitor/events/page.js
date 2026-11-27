'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, MapPin, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useScrollReveal, staggerDelay } from '@/lib/useScrollReveal'
import RealtimeStatus from '@/app/(subsystems)/info/components/user/RealtimeStatus'
import VisitorBackButton from '@/app/(subsystems)/info/components/visitor/VisitorBackButton'
import VisitorPagination, { useVisitorPage } from '@/app/(subsystems)/info/components/visitor/VisitorPagination'
import daetImage from '@/app/(subsystems)/info/assets/images/daet.jpg'
import { getInterestMatchScore, normalizeUserInterests } from '@/lib/userInterests'

const EVENTS_PAGE_SIZE = 9

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
    festival: 'bg-purple-100 text-purple-700 border-purple-200',
    concert: 'bg-red-100 text-red-700 border-red-200',
    exhibition: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    workshop: 'bg-blue-100 text-blue-700 border-blue-200',
    sports: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    cultural: 'bg-pink-100 text-pink-700 border-pink-200',
  }
  return colors[category] || 'bg-slate-100 text-slate-700 border-slate-200'
}

export default function EventsIndexPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [location, setLocation] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [preferredCategories, setPreferredCategories] = useState([])
  const refreshEventsRef = useRef(null)
  const realtime = useRealtimeRefresh({
    channelName: 'visitor-events-index',
    tables: ['info_events'],
  })
  const { setRefreshCallback } = realtime
  const { observe } = useScrollReveal()
  const paginationKey = JSON.stringify([search, category, location, preferredCategories])
  const [page, setPage] = useVisitorPage(paginationKey)

  useEffect(() => {
    let ignore = false

    const loadEvents = async (silent = false) => {
      if (!silent) setLoading(true)
      setError('')
      try {
        const { data, error } = await supabase
          .from('info_events')
          .select('id, title, description, location, venue, start_date, end_date, start_time, category, featured_image, is_free, ticket_price')
          .eq('status', 'published')
          .eq('approval_status', 'approved')
          .order('start_date', { ascending: false })

        if (error) {
          console.error('Events index load failed:', error)
          if (!ignore) setError('We could not load events right now. Please try again in a moment.')
          return false
        }
        if (!ignore) setEvents(data || [])
        return true
      } catch (err) {
        console.error('Events index fetch failed:', err)
        if (!ignore) setError('We could not load events right now. Please try again in a moment.')
        return false
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    refreshEventsRef.current = () => loadEvents(true)
    void loadEvents()

    return () => {
      ignore = true
      refreshEventsRef.current = null
    }
  }, [retryKey])

  useEffect(() => {
    let active = true
    const loadInterests = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const userId = sessionData?.session?.user?.id
      if (!userId) return
      const { data, error } = await supabase
        .from('user_feed_preferences')
        .select('preferred_categories')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      if (active) setPreferredCategories(normalizeUserInterests(data?.preferred_categories || []))
    }

    void loadInterests().catch((interestError) => {
      console.error('Event recommendations interests load failed:', interestError)
    })
    const handleInterestsUpdated = (event) => {
      setPreferredCategories(normalizeUserInterests(event.detail?.interests))
    }
    window.addEventListener('daet-user-interests-updated', handleInterestsUpdated)
    return () => {
      active = false
      window.removeEventListener('daet-user-interests-updated', handleInterestsUpdated)
    }
  }, [])

  useEffect(() => {
    setRefreshCallback(() => refreshEventsRef.current?.() ?? false)
  }, [setRefreshCallback])

  const categories = useMemo(() => {
    const set = new Set(events.filter((event) => event.category).map((event) => event.category))
    return ['all', ...set]
  }, [events])

  const locations = useMemo(() => {
    const values = events.flatMap((event) => [event.location, event.venue])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
    return [...new Set(values)].sort((a, b) => a.localeCompare(b))
  }, [events])

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((event) => {
      const matchesCategory = category === 'all' || event.category === category
      const matchesLocation = location === 'all'
        || event.location?.trim() === location
        || event.venue?.trim() === location
      const matchesSearch =
        !q ||
        event.title?.toLowerCase().includes(q) ||
        event.description?.toLowerCase().includes(q) ||
        event.location?.toLowerCase().includes(q) ||
        event.venue?.toLowerCase().includes(q)
      return matchesCategory && matchesLocation && matchesSearch
    }).sort((left, right) => (
      getInterestMatchScore([right.category, right.title], preferredCategories)
      - getInterestMatchScore([left.category, left.title], preferredCategories)
      || new Date(right.start_date || 0) - new Date(left.start_date || 0)
    ))
  }, [events, search, category, location, preferredCategories])

  const hasActiveFilters = search.trim() || category !== 'all' || location !== 'all'
  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleEvents = filteredEvents.slice((currentPage - 1) * EVENTS_PAGE_SIZE, currentPage * EVENTS_PAGE_SIZE)
  const clearFilters = () => {
    setSearch('')
    setCategory('all')
    setLocation('all')
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[1200px] px-3 pb-12 pt-3 sm:px-4 lg:px-6">
        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} className="mb-3" />

        {/* Mobile header */}
        <header className="visitor-local-header sticky top-3 z-30 mb-6 rounded-[20px] border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur md:px-5 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/info/visitor" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5 p-1 shadow-sm ring-1 ring-slate-200">
                <img src="/logo.png" alt="Daet tourism logo" className="h-full w-full rounded-lg object-cover" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Daet</p>
                <p className="text-base font-bold text-slate-800">Connect</p>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${showFilters ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-500'}`}
                aria-label="Toggle event filters"
                aria-expanded={showFilters}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              <VisitorBackButton className="shrink-0" />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 transition focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100">
            <Search className="h-4 w-4" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events..."
              aria-label="Search events"
              className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </header>

        {/* Desktop top bar */}
        <div className="mb-6 hidden items-center justify-between gap-4 lg:flex">
          <VisitorBackButton />
          <label className="flex w-full max-w-xl items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm transition focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100">
            <Search className="h-4 w-4" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events..."
              aria-label="Search events"
              className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            className={`flex h-11 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition ${showFilters ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200'}`}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
        </div>

        {/* Photo hero */}
        <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div
            className="relative h-56 overflow-hidden bg-cover bg-center sm:h-64"
            style={{
              backgroundImage: `linear-gradient(90deg, rgba(6, 26, 75, 0.92) 0%, rgba(9, 41, 107, 0.72) 58%, rgba(6, 26, 75, 0.40) 100%), url("${daetImage.src}")`,
            }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
            <div className="relative flex h-full flex-col justify-between p-5 sm:p-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-200">Daet, Camarines Norte</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">Upcoming events in Daet</h1>
                <p className="mt-2 max-w-xl text-sm text-cyan-50/90 sm:text-base">
                  Festivals, concerts, workshops, and community gatherings happening across Camarines Norte.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-50 backdrop-blur-sm">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
                </span>
                {hasActiveFilters && (
                  <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-50 backdrop-blur-sm transition hover:bg-white/20">
                    <X className="h-3 w-3" />
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Category tabs */}
        <div className="mb-4 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="tablist" aria-label="Event categories">
          <button
            type="button"
            role="tab"
            aria-selected={category === 'all'}
            onClick={() => setCategory('all')}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-all duration-200 ${category === 'all' ? 'bg-slate-900 text-white shadow-md' : 'border border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:text-sky-700'}`}
          >
            All events
            <span className={`text-xs tabular-nums ${category === 'all' ? 'text-white/70' : 'text-slate-400'}`}>{events.length}</span>
          </button>
          {categories.filter((item) => item !== 'all').map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={category === item}
              onClick={() => setCategory(item)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-all duration-200 ${category === item ? 'bg-slate-900 text-white shadow-md' : 'border border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:text-sky-700'}`}
            >
              {item}
              <span className={`text-xs tabular-nums ${category === item ? 'text-white/70' : 'text-slate-400'}`}>
                {events.filter((event) => event.category === item).length}
              </span>
            </button>
          ))}
        </div>

        {/* Collapsible location filter */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showFilters ? 'mb-4 max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-[480px]:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              Location
              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                <option value="all">All locations</option>
                {locations.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-3">
                <div className="aspect-[4/3] rounded-xl bg-slate-200" />
                <div className="mt-3 h-4 w-2/3 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-200" />
              </div>
            ))}
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
              {hasActiveFilters ? 'No events match your filters.' : 'No upcoming events have been published yet.'}
            </p>
            <p className="mt-1 text-sm text-slate-500">Check back soon — new events are added regularly.</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-sm font-semibold text-sky-600 transition hover:text-sky-800"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Event Grid */}
        {!loading && !error && filteredEvents.length > 0 && (
          <div className="mt-4 grid auto-rows-fr grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {visibleEvents.map((event, index) => (
              <Link
                key={event.id}
                href={`/info/visitor/events/${event.id}`}
                ref={observe}
                style={staggerDelay(index, 60, 500)}
                className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm opacity-0 translate-y-5 transition-all duration-500 [&[data-revealed='true']]:opacity-100 [&[data-revealed='true']]:translate-y-0 hover:-translate-y-1 hover:shadow-lg hover:border-sky-200"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <img
                    src={event.featured_image || daetImage.src}
                    alt={event.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  <span className={`absolute right-3 top-3 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${getCategoryColor(event.category)}`}>
                    {event.category || 'General'}
                  </span>
                  {event.is_free && (
                    <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                      <Sparkles className="h-3 w-3" />
                      Free
                    </span>
                  )}
                  {/* Gradient overlay at bottom of image */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="line-clamp-2 h-12 text-base font-black text-slate-900 transition group-hover:text-sky-700">{event.title}</h2>
                  <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                    <p className="flex min-w-0 items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-sky-600" />
                      <span className="truncate">
                        {formatDateRange(event.start_date, event.end_date)}
                        {event.start_time ? ` · ${event.start_time}` : ''}
                      </span>
                    </p>
                    <p className="flex min-h-[18px] items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                      <span className="truncate">{event.location || event.venue || 'Location to be announced'}</span>
                    </p>
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs font-bold text-sky-700">
                      {event.is_free ? 'Free entry' : event.ticket_price ? `₱${event.ticket_price}` : 'Details inside'}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-slate-400 transition group-hover:text-sky-600 group-hover:gap-2">
                      View <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        {!loading && !error && (
          <VisitorPagination
            page={currentPage}
            totalItems={filteredEvents.length}
            pageSize={EVENTS_PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="events"
          />
        )}
      </div>
    </main>
  )
}
