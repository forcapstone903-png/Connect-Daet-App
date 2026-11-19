'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Clock,
  Eye,
  Loader,
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

        {/* Hero Header */}
        <div className="mb-8 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#081c49] via-[#0e327a] to-[#041235] p-6 text-white shadow-xl sm:p-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-xs font-bold text-sky-300 backdrop-blur-md">
                <Users className="h-3.5 w-3.5" />
                <span>Daet Community Forum</span>
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Travel Questions &amp; Stories
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-200 sm:text-base">
                Discover insider travel tips, surf forecasts, food recommendations, and local insights shared by visitors and residents.
              </p>
            </div>

            <div className="shrink-0">
              <Link
                href="/info/login"
                className="inline-flex items-center gap-2 rounded-full bg-[#1d68ed] px-6 py-3 text-xs font-bold text-white shadow-lg transition hover:bg-blue-600 hover:scale-105 active:scale-95"
              >
                <span>Join the Discussion</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
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

        {/* Counter */}
        <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
          <span>
            {loading ? 'Finding discussions...' : `${filteredThreads.length} discussion${filteredThreads.length === 1 ? '' : 's'}`}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setSearch(''); setCategory('all') }}
              className="font-bold text-[#1d68ed] hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="mt-12 flex flex-col items-center justify-center gap-3">
            <Loader className="h-8 w-8 animate-spin text-[#1d68ed]" />
            <p className="text-xs text-slate-500">Loading community conversations...</p>
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
          <div className="mt-4 space-y-3">
            {filteredThreads.map((thread, index) => (
              <Link
                key={thread.id}
                href={`/info/visitor/forum/${thread.id}`}
                ref={observe}
                style={staggerDelay(index, 50, 400)}
                className="group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sky-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {thread.pinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                          <Pin className="h-3 w-3" />
                          Pinned
                        </span>
                      )}
                      <h2 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {thread.title}
                      </h2>
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
                      {getPostPreview(thread.content)}
                    </p>
                  </div>

                  {thread.forum_categories?.name && (
                    <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700">
                      {thread.forum_categories.name}
                    </span>
                  )}
                </div>

                {/* Footer Metadata */}
                <div className="mt-4 flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2 text-slate-700 font-semibold">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-600">
                      {thread.info_users?.profile_image_url ? (
                        <img src={thread.info_users.profile_image_url} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <User className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <span>{thread.info_users?.full_name || 'Community Member'}</span>
                  </div>

                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(thread.last_activity_at || thread.created_at)}
                    </span>
                    <span className="flex items-center gap-1 text-blue-600 font-bold">
                      <MessageSquare className="h-3 w-3" />
                      {thread.reply_count || 0} replies
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {thread.views || 0}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
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
