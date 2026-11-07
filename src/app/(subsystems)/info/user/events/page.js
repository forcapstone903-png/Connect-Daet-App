'use client'

import { useEffect, useMemo, useState } from 'react'
import UserSectionHeader from '@/app/components/user/UserSectionHeader'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronRight, Loader, MapPin, Ticket } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import UserTopHeader from '@/app/components/user/UserTopHeader'

export default function UserEventsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [events, setEvents] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [loadError, setLoadError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  const categories = useMemo(() => {
    const catSet = new Set(events.filter(e => e.category).map(e => e.category))
    return ['all', ...catSet]
  }, [events])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const cookieSession = getAuthCookieFromDocument()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const activeSession = session || (cookieSession?.logged_in ? { user: { id: cookieSession.user_id } } : null)

        if (!activeSession?.user) {
          router.push('/login')
          return
        }

        setAuthChecking(false)

        const { data, error } = await supabase
          .from('info_events')
          .select('*')
          .eq('status', 'published')
          .order('start_date', { ascending: true })

        if (error) throw error
        setEvents(data || [])
      } catch (err) {
        console.error('Error loading events:', err)
        setLoadError('We could not load events right now. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router, retryKey])

  const filteredEvents = useMemo(() => {
    let result = events
    if (categoryFilter !== 'all') {
      result = result.filter(e => e.category === categoryFilter)
    }
    return result
  }, [events, categoryFilter])

  const eventSummary = useMemo(() => {
    const now = new Date()
    const summary = { upcoming: [], ongoing: [], past: [] }

    events.forEach((event) => {
      const start = event.start_date ? new Date(event.start_date) : null
      const end = event.end_date ? new Date(event.end_date) : start
      if (!start || Number.isNaN(start.getTime())) return
      if (end && !Number.isNaN(end.getTime()) && end < start) end.setTime(start.getTime())

      if (start > now) summary.upcoming.push(event)
      else if (end && !Number.isNaN(end.getTime()) && end >= now) summary.ongoing.push(event)
      else summary.past.push(event)
    })

    return summary
  }, [events])

  const getMediaUrl = (value, fallback = null) => {
    if (Array.isArray(value) && value.length > 0 && value[0]) return value[0]
    if (typeof value === 'string' && value.trim()) return value
    return fallback
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBA'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getCategoryColor = (category) => {
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

  if (authChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Loader className="mx-auto mb-4 animate-spin text-slate-600" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="tourism-shell usr-section-page usr-events min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-[1200px] px-3 pb-10 pt-2 sm:px-4 lg:px-6">

        <UserSectionHeader eyebrow="Make room for something memorable" title="Discover local events" description="Festivals, workshops, and community gatherings. Find your next reason to get out and explore Daet." emoji="🎉">
          <span className="usr-section-counter">{loading ? 'Finding events…' : `${eventSummary.upcoming.length} upcoming`}</span>
        </UserSectionHeader>

        <section className="mb-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="event-calendar-heading">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><CalendarDays className="h-4 w-4" /></span>
            <div>
              <h2 id="event-calendar-heading" className="text-sm font-black text-slate-950">Event calendar</h2>
              <p className="text-xs text-slate-500">A quick look at what is happening around Daet</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ['Upcoming', eventSummary.upcoming.length, 'bg-sky-50 text-sky-700'],
              ['Ongoing', eventSummary.ongoing.length, 'bg-emerald-50 text-emerald-700'],
              ['Past', eventSummary.past.length, 'bg-slate-100 text-slate-600'],
            ].map(([label, count, tone]) => (
              <div key={label} className={`rounded-xl px-3 py-2.5 ${tone}`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]">{label}</p>
                <p className="mt-1 text-xl font-black">{count}</p>
              </div>
            ))}
          </div>

          {(eventSummary.ongoing.length > 0 || eventSummary.upcoming.length > 0) && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="space-y-1.5">
                {[...eventSummary.ongoing, ...eventSummary.upcoming].slice(0, 3).map((event) => (
                  <Link key={event.id} href={`/user/events/${event.id}`} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 transition hover:bg-sky-50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm"><CalendarDays className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-800">{event.title}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{eventSummary.ongoing.some((item) => item.id === event.id) ? 'Ongoing now' : formatDate(event.start_date)}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Category filter */}
        <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-sky-300"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Events List */}
        {loading ? (
          <div className="space-y-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-5">
                <div className="h-5 w-1/3 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-full rounded bg-slate-200" />
                <div className="mt-2 h-3 w-2/3 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-[20px] border border-red-200 bg-red-50 p-10 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-red-300" />
            <p className="text-sm font-semibold text-red-700">{loadError}</p>
            <button
              type="button"
              onClick={() => setRetryKey((value) => value + 1)}
              className="mt-4 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-500">No events found</p>
            <p className="mt-1 text-xs text-slate-400">Check back later for upcoming events in Daet</p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {filteredEvents.map((event) => {
              const firstImage = getMediaUrl(event.featured_image || event.images)
              const firstVideo = getMediaUrl(event.videos || event.video_url)
              const primaryMedia = firstVideo || firstImage

              return (
              <Link
                key={event.id}
                href={`/user/events/${event.id}`}
                className="usr-event-card group min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                {primaryMedia ? (
                  <div className="relative h-40 w-full overflow-hidden">
                    {firstVideo ? (
                      <video src={firstVideo} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" preload="metadata" controls />
                    ) : (
                      <img
                        src={firstImage}
                        alt={event.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    )}
                    {event.is_free && (
                      <span className="absolute left-3 top-3 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                        Free
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-sky-100 to-emerald-100">
                    <CalendarDays className="h-12 w-12 text-sky-400" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getCategoryColor(event.category)}`}>
                      {event.category || 'General'}
                    </span>
                    <span className="text-xs font-medium text-slate-500">{formatDate(event.start_date)}</span>
                  </div>
                  <h3 className="mt-2 line-clamp-1 text-base font-bold text-slate-900 group-hover:text-sky-700">{event.title}</h3>
                  {event.location && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{event.location}</span>
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                    {!event.is_free && event.ticket_price ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                        <Ticket className="h-3.5 w-3.5 text-sky-600" />
                        ₱{Number(event.ticket_price).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-600">Free Entry</span>
                    )}
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}