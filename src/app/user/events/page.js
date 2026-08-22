'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronRight, Loader, MapPin, Search, Ticket } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'

export default function UserEventsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authChecking, setAuthChecking] = useState(true)
  const [events, setEvents] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

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
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const filteredEvents = useMemo(() => {
    let result = events
    if (categoryFilter !== 'all') {
      result = result.filter(e => e.category === categoryFilter)
    }
    if (search) {
      const query = search.toLowerCase()
      result = result.filter(e =>
        (e.title || '').toLowerCase().includes(query) ||
        (e.description || '').toLowerCase().includes(query) ||
        (e.location || '').toLowerCase().includes(query)
      )
    }
    return result
  }, [events, categoryFilter, search])

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
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[1200px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        <header className="sticky top-3 z-30 mb-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
          <div className="px-3 py-3 sm:px-4 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white shadow-md">
                  D
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Explore</p>
                  <p className="text-sm font-bold text-slate-800">CONNECT Daet</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/user/dashboard" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
                  Back to Dashboard
                </Link>
                <Link href="/user/profile" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100">
                  <CalendarDays className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </header>

        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">Events</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 md:text-3xl">Discover Local Events</h1>
          <p className="mt-1 text-sm text-slate-600">Festivals, concerts, workshops, and more happening in Daet</p>
        </div>

        {/* Search & Filter */}
        <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events..."
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
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
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-5">
                <div className="h-5 w-1/3 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-full rounded bg-slate-200" />
                <div className="mt-2 h-3 w-2/3 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-500">No events found</p>
            <p className="mt-1 text-xs text-slate-400">Check back later for upcoming events in Daet</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredEvents.map((event) => (
              <Link
                key={event.id}
                href={`/user/events/${event.id}`}
                className="group overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                {event.featured_image ? (
                  <div className="relative h-40 w-full overflow-hidden">
                    <img
                      src={event.featured_image}
                      alt={event.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
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
            ))}
          </div>
        )}
      </div>
    </main>
  )
}