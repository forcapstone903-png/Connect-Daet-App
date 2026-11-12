'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Clock, Eye, Loader, MessageSquare, Pin, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import RealtimeStatus from '@/app/(subsystems)/info/components/user/RealtimeStatus'
import { getPostPreview } from '@/lib/postContent'

function formatDate(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

export default function PublicForumPage() {
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [retryKey, setRetryKey] = useState(0)
  const refreshThreadsRef = useRef(null)
  const realtime = useRealtimeRefresh({
    channelName: 'visitor-forum-index',
    tables: ['forum_threads', 'forum_replies'],
  })
  const { setRefreshCallback } = realtime

  useEffect(() => {
    let ignore = false

    async function loadThreads(silent = false) {
      if (!silent) setLoading(true)
      setError('')

      const { data, error: queryError } = await supabase
        .from('forum_threads')
        .select('id, title, content, created_at, last_activity_at, reply_count, views, pinned, tags, category_id, forum_categories(name), info_users!forum_threads_created_by_fkey(full_name)')
        .in('status', ['published', 'closed'])
        .order('last_activity_at', { ascending: false })
        .limit(100)

      if (ignore) return

      if (queryError) {
        console.error('Public forum load failed:', queryError)
        setError('We could not load public discussions. Please try again.')
        setLoading(false)
        return false
      } else {
        setThreads(data || [])
      }

      setLoading(false)
      return true
    }

    refreshThreadsRef.current = () => loadThreads(true)
    void loadThreads()

    return () => {
      ignore = true
      refreshThreadsRef.current = null
    }
  }, [retryKey])

  useEffect(() => {
    setRefreshCallback(() => refreshThreadsRef.current?.() ?? false)
  }, [setRefreshCallback])

  const categories = useMemo(() => (
    [...new Set(threads.map((thread) => thread.forum_categories?.name).filter(Boolean))]
  ), [threads])

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = threads.filter((thread) => {
      const matchesCategory = category === 'all' || thread.forum_categories?.name === category
      const matchesQuery = !query || [
        thread.title,
        thread.content,
        thread.forum_categories?.name,
        ...(Array.isArray(thread.tags) ? thread.tags : []),
      ].some((value) => String(value || '').toLowerCase().includes(query))

      return matchesCategory && matchesQuery
    })

    return filtered.sort((left, right) => {
      if (sortBy === 'views') return (right.views || 0) - (left.views || 0)
      if (sortBy === 'replies') return (right.reply_count || 0) - (left.reply_count || 0)
      return new Date(right.last_activity_at || right.created_at || 0) - new Date(left.last_activity_at || left.created_at || 0)
    })
  }, [threads, search, category, sortBy])

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-4xl px-3 py-5 sm:px-5 sm:py-8">
        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} className="mb-3" />
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/info/visitor" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <ChevronLeft className="h-4 w-4" />
            Visitor home
          </Link>
          <Link href="/info/login" className="inline-flex min-h-11 items-center rounded-full bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
            Join the discussion
          </Link>
        </div>

        <header className="rounded-2xl bg-gradient-to-br from-slate-950 to-emerald-900 p-5 text-white sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Daet community</p>
          <h1 className="mt-2 text-2xl font-black sm:text-4xl">Public discussions</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
            Browse published travel questions, local recommendations, and community conversations. Sign in to reply or start a discussion.
          </p>
        </header>

        <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:p-4">
          <label className="relative block">
            <span className="sr-only">Search discussions</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search discussions..."
              className="min-h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-slate-500">
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:flex-none">
              <option value="all">All categories</option>
              {categories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-slate-500">
            Sort
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="min-h-11 flex-1 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-700 sm:flex-none">
              <option value="recent">Recent</option>
              <option value="views">Most viewed</option>
              <option value="replies">Most replied</option>
            </select>
          </label>
        </div>

        <p className="mt-4 text-sm text-slate-500" aria-live="polite">
          {loading ? 'Loading discussions...' : `${filteredThreads.length} published discussion${filteredThreads.length === 1 ? '' : 's'}`}
        </p>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <Loader className="h-7 w-7 animate-spin text-emerald-700" aria-label="Loading discussions" />
          </div>
        ) : error ? (
          <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
            <p className="text-sm font-semibold text-red-800">{error}</p>
            <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-3 min-h-11 rounded-full bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700">
              Try again
            </button>
          </div>
        ) : filteredThreads.length ? (
          <div className="mt-3 space-y-3">
            {filteredThreads.map((thread) => (
              <Link key={thread.id} href={`/info/visitor/forum/${thread.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {thread.pinned && <Pin className="h-4 w-4 text-amber-600" aria-label="Pinned" />}
                      <h2 className="text-base font-bold text-slate-900 sm:text-lg">{thread.title}</h2>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-600">{getPostPreview(thread.content)}</p>
                  </div>
                  {thread.forum_categories?.name && <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{thread.forum_categories.name}</span>}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>{thread.info_users?.full_name || 'Community member'}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(thread.last_activity_at || thread.created_at)}</span>
                  <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{thread.reply_count || 0} replies</span>
                  <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{thread.views || 0} views</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-700">{threads.length ? 'No discussions match these filters.' : 'No public discussions have been published yet.'}</p>
            {(search || category !== 'all') && <button type="button" onClick={() => { setSearch(''); setCategory('all') }} className="mt-3 min-h-11 rounded-full px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50">Clear filters</button>}
          </div>
        )}
      </div>
    </main>
  )
}
