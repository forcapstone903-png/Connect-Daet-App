'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Clock,
  Eye,
  MessageSquare,
  Pin,
  Search,
  SlidersHorizontal,
  User,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useScrollReveal, staggerDelay } from '@/lib/useScrollReveal'
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
  const { observe } = useScrollReveal()

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
        .select('id, title, content, created_at, last_activity_at, reply_count, views, pinned, tags, category_id, forum_categories(name), info_users!forum_threads_created_by_fkey(full_name, profile_image_url)')
        .in('status', ['published', 'closed'])
        .order('last_activity_at', { ascending: false })

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

  const hasActiveFilters = search.trim() || category !== 'all'

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900 pb-16">
      <div className="mx-auto max-w-5xl px-3 pt-6 sm:px-6">
        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} className="mb-4" />

        {/* Forum Header */}
        <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#081c49] via-[#0e327a] to-[#041235] p-5 text-white shadow-lg sm:p-7">
          <div className="flex items-start gap-4">
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-sky-200 sm:flex">
              <MessageSquare className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-sky-200">
                <Users className="h-3.5 w-3.5" />
                Daet Community Forum
              </div>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Forum Discussions
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200">
                Browse questions, local advice, and stories shared by the Daet community.
              </p>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search discussions, questions, tags..."
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Dropdown */}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="shrink-0 text-slate-400">Category:</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-sky-400"
              >
                <option value="all">All Categories</option>
                {categories.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            {/* Sort Dropdown */}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="shrink-0 text-slate-400">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-sky-400"
              >
                <option value="recent">Most Recent</option>
                <option value="views">Most Viewed</option>
                <option value="replies">Most Replied</option>
              </select>
            </label>
          </div>

          {/* Category Quick Badges */}
          {categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                  category === 'all'
                    ? 'bg-[#1d68ed] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {categories.map((catName) => (
                <button
                  key={catName}
                  type="button"
                  onClick={() => setCategory(catName)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                    category === catName
                      ? 'bg-[#1d68ed] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {catName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Discussion list heading */}
        <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Community discussions</h2>
            <p className="mt-1 text-sm text-slate-500">
              {loading ? (
                <span role="status" className="inline-block h-3 w-36 animate-pulse rounded-full bg-slate-200 align-middle">
                  <span className="sr-only">Loading discussion count</span>
                </span>
              ) : `${filteredThreads.length} topic${filteredThreads.length === 1 ? '' : 's'} in the forum`}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setSearch(''); setCategory('all') }}
              className="rounded-full px-3 py-1.5 text-sm font-bold text-[#1d68ed] transition hover:bg-blue-50"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div role="status" className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="sr-only">Loading community conversations</span>
            <div aria-hidden="true" className="hidden animate-pulse grid-cols-[minmax(0,1fr)_82px_72px_132px] gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 md:grid">
              <div className="h-3 w-16 rounded-full bg-slate-200" />
              <div className="h-3 w-12 rounded-full bg-slate-200" />
              <div className="h-3 w-10 rounded-full bg-slate-200" />
              <div className="ml-auto h-3 w-20 rounded-full bg-slate-200" />
            </div>
            <div aria-hidden="true" className="divide-y divide-slate-100">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="animate-pulse px-4 py-4 sm:px-5 sm:py-5">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-1/4 rounded-full bg-slate-200" />
                      <div className="h-4 w-3/4 rounded-full bg-slate-200" />
                      <div className="h-3 w-full rounded-full bg-slate-200" />
                      <div className="h-3 w-2/3 rounded-full bg-slate-200" />
                      <div className="mt-3 h-3 w-1/3 rounded-full bg-slate-200" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-bold text-red-800">{error}</p>
            <button
              type="button"
              onClick={() => setRetryKey((v) => v + 1)}
              className="mt-3 rounded-full bg-red-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Threads List */}
        {!loading && !error && filteredThreads.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[minmax(0,1fr)_82px_72px_132px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:grid">
              <span>Topic</span>
              <span className="text-center">Replies</span>
              <span className="text-center">Views</span>
              <span className="text-right">Last activity</span>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredThreads.map((thread, index) => (
                <Link
                  key={thread.id}
                  href={`/info/visitor/forum/${thread.id}`}
                  ref={observe}
                  style={staggerDelay(index, 50, 400)}
                  className="group grid grid-cols-1 items-center gap-3 px-4 py-4 transition-colors hover:bg-sky-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-5 md:grid-cols-[minmax(0,1fr)_82px_72px_132px] md:gap-2 md:py-5"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${thread.pinned ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
                      {thread.pinned
                        ? <Pin className="h-4 w-4" aria-hidden="true" />
                        : <MessageSquare className="h-4 w-4" aria-hidden="true" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        {thread.pinned && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                            Pinned
                          </span>
                        )}
                        {thread.forum_categories?.name && (
                          <span className="text-[11px] font-semibold text-sky-700">
                            {thread.forum_categories.name}
                          </span>
                        )}
                      </div>
                      <h3 className="break-words text-base font-bold leading-snug text-slate-900 transition-colors group-hover:text-blue-700 sm:text-lg">
                        {thread.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600">
                        {getPostPreview(thread.content)}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-500">
                        <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                          {thread.info_users?.profile_image_url ? (
                            <img src={thread.info_users.profile_image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </span>
                        <span className="font-semibold text-slate-700">{thread.info_users?.full_name || 'Community member'}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span>Started {formatDate(thread.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <span className="hidden text-center md:block">
                    <strong className="block text-sm font-bold text-slate-800">{thread.reply_count || 0}</strong>
                    <span className="text-[11px] text-slate-500">replies</span>
                  </span>
                  <span className="hidden text-center md:block">
                    <strong className="block text-sm font-bold text-slate-800">{thread.views || 0}</strong>
                    <span className="text-[11px] text-slate-500">views</span>
                  </span>
                  <span className="hidden text-right text-xs text-slate-600 md:block">
                    {formatDate(thread.last_activity_at || thread.created_at)}
                  </span>

                  <span className="ml-12 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:hidden">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-sky-700">
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      {thread.reply_count || 0} replies
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-500">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      {thread.views || 0} views
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-500">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDate(thread.last_activity_at || thread.created_at)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredThreads.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-3 text-base font-bold text-slate-800">No discussions found</h3>
            <p className="mt-1 text-xs text-slate-500">
              {hasActiveFilters ? 'Try adjusting your search query or category filter.' : 'Be the first to share an insight or ask a question.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setSearch(''); setCategory('all') }}
                className="mt-4 rounded-full bg-[#1d68ed] px-5 py-2 text-xs font-bold text-white shadow"
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
