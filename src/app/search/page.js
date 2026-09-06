'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search as SearchIcon, MapPin, CalendarDays, MessageSquare, Compass, Newspaper, X, Sparkles, ArrowRight, SlidersHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import MobileNav from '@/app/components/user/MobileNav'
import { Suspense } from 'react'

const defaultSpotImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80'
const defaultBlogImage = 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80'
const popularSearches = ['Bagasbas Beach', 'Calaguas', 'Daet events', 'local food', 'travel stories']

function SearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQuery = searchParams?.get('q') || ''
  const [query, setQuery] = useState(initialQuery)
  const [searchFocused, setSearchFocused] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [recentSearches, setRecentSearches] = useState(() => {
    if (typeof window === 'undefined') return []

    try {
      const storedSearches = JSON.parse(localStorage.getItem('daet_recent_searches') || '[]')
      return Array.isArray(storedSearches) ? storedSearches.slice(0, 5) : []
    } catch {
      return []
    }
  })
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState({
    spots: [],
    events: [],
    blogs: [],
    threads: [],
  })

  const saveRecentSearch = (value) => {
    const normalizedValue = value.trim()
    if (!normalizedValue) return
    const nextSearches = [normalizedValue, ...recentSearches.filter((entry) => entry.toLowerCase() !== normalizedValue.toLowerCase())].slice(0, 5)
    setRecentSearches(nextSearches)
    localStorage.setItem('daet_recent_searches', JSON.stringify(nextSearches))
  }

  useEffect(() => {
    const loadResults = async () => {
      setLoading(true)
      try {
        const q = query.trim().toLowerCase()

        if (!q) {
          setResults({ spots: [], events: [], blogs: [], threads: [] })
          setLoading(false)
          return
        }

        const [spotsRes, eventsRes, blogsRes, threadsRes] = await Promise.all([
          supabase
            .from('info_tourist_spots')
            .select('*')
            .eq('status', 'active')
            .or(`name.ilike.%${q}%,location.ilike.%${q}%,category.ilike.%${q}%,description.ilike.%${q}%`),
          supabase
            .from('info_events')
            .select('*')
            .eq('status', 'published')
            .or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`),
          supabase
            .from('info_blogs')
            .select('*')
            .eq('status', 'published')
            .or(`title.ilike.%${q}%,excerpt.ilike.%${q}%,content.ilike.%${q}%,category.ilike.%${q}%`),
          supabase
            .from('forum_threads')
            .select('*')
            .eq('status', 'active')
            .or(`title.ilike.%${q}%,content.ilike.%${q}%`),
        ])

        setResults({
          spots: spotsRes.data || [],
          events: eventsRes.data || [],
          blogs: blogsRes.data || [],
          threads: threadsRes.data || [],
        })
      } catch (error) {
        console.error('Search failed:', error)
        setResults({ spots: [], events: [], blogs: [], threads: [] })
      } finally {
        setLoading(false)
      }
    }

    const debounceTimer = setTimeout(loadResults, 300)
    return () => clearTimeout(debounceTimer)
  }, [query])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    saveRecentSearch(query)
    setSearchFocused(false)
    router.push(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  const suggestions = [
    ...results.spots.map((item) => item.name),
    ...results.events.map((item) => item.title),
    ...results.blogs.map((item) => item.title),
    ...results.threads.map((item) => item.title),
  ].filter((value, index, values) => value && values.indexOf(value) === index).slice(0, 5)

  const visibleSuggestions = query.trim() ? suggestions : popularSearches

  const totalCount = results.spots.length + results.events.length + results.blogs.length + results.threads.length

  const tabs = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'spots', label: 'Destinations', count: results.spots.length },
    { id: 'events', label: 'Events', count: results.events.length },
    { id: 'blogs', label: 'Blogs', count: results.blogs.length },
    { id: 'threads', label: 'Forums', count: results.threads.length },
  ]

  const formatDate = (value) => {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getImage = (item) => {
    const image = item.featured_image || item.image_url || (Array.isArray(item.images) && item.images[0])
    if (typeof image === 'string' && image.trim()) return image
    return item.category === 'blog' ? defaultBlogImage : defaultSpotImage
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_35%,_#f1f5f9_100%)] text-slate-900">
      <MobileNav />
      <div className="mx-auto max-w-[1100px] px-3 pb-28 pt-3 sm:px-4 sm:pb-12 lg:px-6">
        {/* Header */}
        <header className="sticky top-3 z-30 mb-6 rounded-[20px] border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur md:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="relative hidden flex-1 items-center justify-center lg:flex">
            <div className="flex w-full max-w-xl items-center gap-2">
            <form onSubmit={handleSubmit} className="min-w-0 flex-1">
              <div className="w-full max-w-xl rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 shadow-inner">
                <div className="flex items-center gap-2">
                  <SearchIcon className="h-4 w-4 flex-shrink-0" />
                  <input
                    value={query}
                    onFocus={() => setSearchFocused(true)}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search destinations, events, blogs, forums..."
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => { setQuery(''); router.push('/search') }}
                      className="flex-shrink-0 text-slate-400 hover:text-slate-600"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </form>
            <button type="button" onClick={() => setShowFilters((value) => !value)} aria-label="Open search filters" aria-expanded={showFilters} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${showFilters ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700'}`}>
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            </div>
            {searchFocused && (
              <div className="absolute left-1/2 top-[calc(100%+0.5rem)] z-40 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-xl">
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{query.trim() ? 'Suggestions' : recentSearches.length ? 'Recent searches' : 'Popular searches'}</p>
                {(query.trim() ? suggestions : recentSearches.length ? recentSearches : popularSearches).length ? <div className="space-y-1">{(query.trim() ? suggestions : recentSearches.length ? recentSearches : popularSearches).map((suggestion) => <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); saveRecentSearch(suggestion); setSearchFocused(false); router.push(`/search?q=${encodeURIComponent(suggestion)}`) }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-sky-50"><SearchIcon className="h-4 w-4 text-slate-400" />{suggestion}</button>)}</div> : <p className="px-3 py-2 text-sm text-slate-500">{query.trim() ? 'No suggestions yet.' : 'No popular searches yet.'}</p>}
                <button type="button" onClick={() => setSearchFocused(false)} className="mt-1 w-full border-t border-slate-100 px-3 pt-3 text-left text-xs font-bold text-sky-700">View search history</button>
              </div>
            )}
            </div>

          </div>

          <div className="mt-3 lg:hidden">
            <div className="relative flex items-center gap-2">
            <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <SearchIcon className="h-4 w-4 flex-shrink-0" />
              <input
                value={query}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="flex-shrink-0 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>
            <button type="button" onClick={() => setShowFilters((value) => !value)} aria-label="Open search filters" aria-expanded={showFilters} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${showFilters ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700'}`}>
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {searchFocused && <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{query.trim() ? 'Suggestions' : recentSearches.length ? 'Recent searches' : 'Popular searches'}</p>{(query.trim() ? suggestions : recentSearches.length ? recentSearches : popularSearches).slice(0, 5).map((suggestion) => <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); saveRecentSearch(suggestion); setSearchFocused(false); router.push(`/search?q=${encodeURIComponent(suggestion)}`) }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-sky-50"><SearchIcon className="h-4 w-4 text-slate-400" />{suggestion}</button>)}</div>}
            </div>
          </div>

          {showFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 lg:mx-auto lg:max-w-xl">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Filter by</span>
              {tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setShowFilters(false) }} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${activeTab === tab.id ? 'bg-sky-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-sky-700'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Search Results Header */}
        <div className="mb-5 rounded-[22px] border border-slate-200/80 bg-white/80 p-4 shadow-sm sm:p-5">
          <h1 className="text-2xl font-black text-slate-900">
            {query.trim() ? (
              <>
                Results for <span className="text-sky-600">&quot;{query.trim()}&quot;</span>
              </>
            ) : (
              'Search'
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {loading ? 'Searching...' : `${totalCount} result${totalCount === 1 ? '' : 's'} found`}
          </p>
          {!query.trim() && (
            <div className="mt-4 flex flex-wrap gap-2">
              {popularSearches.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); saveRecentSearch(suggestion); router.push(`/search?q=${encodeURIComponent(suggestion)}`) }} className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:border-sky-200 hover:bg-sky-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        {!loading && totalCount > 0 && (
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-700'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-4">
                <div className="h-5 w-1/3 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-full rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm sm:p-10">
            <SearchIcon className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <p className="text-sm text-slate-500">
              {query.trim() ? 'No results found. Try different keywords.' : 'Type something to search across Daet.'}
            </p>
            {!query.trim() && <div className="mt-5 flex flex-wrap justify-center gap-2">{visibleSuggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); saveRecentSearch(suggestion); router.push(`/search?q=${encodeURIComponent(suggestion)}`) }} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-700">{suggestion}<ArrowRight className="h-3 w-3" /></button>)}</div>}
            {query.trim() && (
              <button
                type="button"
                onClick={() => { setQuery(''); router.push('/search') }}
                className="mt-3 text-xs font-semibold text-sky-600 hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Spots */}
            {(activeTab === 'all' || activeTab === 'spots') && results.spots.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                  <Compass className="h-4 w-4" />
                  Destinations ({results.spots.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {results.spots.slice(0, activeTab === 'all' ? 4 : undefined).map((spot) => (
                    <Link
                      key={spot.id}
                      href={`/tourist-spots/${spot.id}`}
                      className="group flex gap-3 rounded-[16px] border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md hover:border-sky-200"
                    >
                      <img
                        src={getImage(spot)}
                        alt={spot.name}
                        className="h-20 w-24 flex-shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-700">{spot.name}</h3>
                        {spot.location && (
                          <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {spot.location}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-slate-600">{spot.description}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Events */}
            {(activeTab === 'all' || activeTab === 'events') && results.events.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                  <CalendarDays className="h-4 w-4" />
                  Events ({results.events.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {results.events.slice(0, activeTab === 'all' ? 4 : undefined).map((event) => (
                    <Link
                      key={event.id}
                      href={`/events/${event.id}`}
                      className="group flex gap-3 rounded-[16px] border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md hover:border-sky-200"
                    >
                      {event.featured_image ? (
                        <img
                          src={event.featured_image}
                          alt={event.title}
                          className="h-20 w-24 flex-shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-24 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-emerald-100">
                          <CalendarDays className="h-8 w-8 text-sky-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-700">{event.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(event.start_date)}</p>
                        {event.location && (
                          <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {event.location}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Blogs */}
            {(activeTab === 'all' || activeTab === 'blogs') && results.blogs.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                  <Newspaper className="h-4 w-4" />
                  Blogs ({results.blogs.length})
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {results.blogs.slice(0, activeTab === 'all' ? 4 : undefined).map((blog) => (
                    <Link
                      key={blog.id}
                      href={`/blog/${blog.id}`}
                      className="group flex gap-3 rounded-[16px] border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md hover:border-sky-200"
                    >
                      <img
                        src={getImage(blog)}
                        alt={blog.title}
                        className="h-20 w-24 flex-shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-700">{blog.title}</h3>
                        <p className="mt-1 text-xs text-slate-600">{blog.excerpt}</p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-sky-600">
                          {blog.category || 'Blog'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Forum Threads */}
            {(activeTab === 'all' || activeTab === 'threads') && results.threads.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                  <MessageSquare className="h-4 w-4" />
                  Forum Discussions ({results.threads.length})
                </h2>
                <div className="space-y-3">
                  {results.threads.slice(0, activeTab === 'all' ? 4 : undefined).map((thread) => (
                    <Link
                      key={thread.id}
                      href={`/forum/${thread.id}`}
                      className="group block rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-sky-200"
                    >
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-700">{thread.title}</h3>
                      <p className="mt-1 text-xs text-slate-600">{thread.content}</p>
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
                        <span>{formatDate(thread.last_activity_at || thread.created_at)}</span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {thread.reply_count || 0} replies
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#f3f5f9]"><p className="text-slate-600">Loading...</p></div>}>
      <SearchContent />
    </Suspense>
  )
}