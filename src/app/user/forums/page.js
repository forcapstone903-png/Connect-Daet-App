'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronRight,
  Eye,
  MessageSquare,
  Plus,
  Search,
  X,
  Lock,
  Archive,
  Pin,
  Tag,
  Clock,
  User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const forumCategories = [
  { id: 'general', label: 'General Discussion', icon: '💬' },
  { id: 'tips', label: 'Travel Tips', icon: '✈️' },
  { id: 'questions', label: 'Questions & Answers', icon: '❓' },
  { id: 'stories', label: 'Travel Stories', icon: '📖' },
]

function formatDate(value) {
  if (!value) return 'New'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'New'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function getStatusColor(status) {
  switch (status) {
    case 'locked':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'archived':
      return 'bg-slate-50 text-slate-700 border-slate-200'
    case 'active':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

export default function ForumsPage() {
  const [threads, setThreads] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('general')
  const [sortBy, setSortBy] = useState('recent')
  const [userName, setUserName] = useState('Traveler')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    content: '',
    category_id: '',
    tags: '',
  })
  const [submittingThread, setSubmittingThread] = useState(false)

  useEffect(() => {
    let ignore = false

    const loadData = async () => {
      try {
        const sessionResult = await supabase.auth.getSession()
        const session = sessionResult?.data?.session
        if (session) {
          const fullName = session.user?.user_metadata?.full_name || session.user?.email || 'Traveler'
          setUserName(fullName.split(' ')[0] || fullName)
        }

        // Load categories
        const { data: categoriesData } = await supabase.from('forum_categories').select('*').order('name')

        // Load threads
        const { data: threadsData } = await supabase
          .from('forum_threads')
          .select(`
            *,
            forum_categories(name),
            info_users!forum_threads_created_by_fkey(full_name, email)
          `)
          .eq('status', 'active')
          .order('pinned', { ascending: false })
          .order('last_activity_at', { ascending: false })

        if (!ignore) {
          setCategories(categoriesData || [])
          setThreads(threadsData || [])
          setLoading(false)
        }
      } catch (error) {
        console.error('Error loading forums:', error)
        if (!ignore) setLoading(false)
      }
    }

    loadData()

    return () => {
      ignore = true
    }
  }, [])

  const handleCreateThread = async () => {
    if (!createForm.title.trim() || !createForm.content.trim()) {
      alert('Please fill in title and content')
      return
    }

    setSubmittingThread(true)
    try {
      const session = await supabase.auth.getSession()
      const userId = session?.data?.session?.user?.id

      if (!userId) {
        alert('You must be logged in to create a thread')
        return
      }

      const tags = createForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const { data, error } = await supabase.from('forum_threads').insert({
        title: createForm.title.trim(),
        content: createForm.content.trim(),
        category_id: createForm.category_id || null,
        tags,
        created_by: userId,
        status: 'active',
      })

      if (error) {
        console.error('Error creating thread:', error)
        alert('Failed to create thread')
      } else {
        setCreateForm({ title: '', content: '', category_id: '', tags: '' })
        setShowCreateForm(false)
        // Reload threads
        const { data: newThreads } = await supabase
          .from('forum_threads')
          .select(`
            *,
            forum_categories(name),
            info_users!forum_threads_created_by_fkey(full_name, email)
          `)
          .eq('status', 'active')
          .order('pinned', { ascending: false })
          .order('last_activity_at', { ascending: false })
        setThreads(newThreads || [])
      }
    } catch (error) {
      console.error('Error submitting thread:', error)
      alert('An error occurred. Please try again.')
    } finally {
      setSubmittingThread(false)
    }
  }

  const filteredThreads = useMemo(() => {
    let result = threads

    // Category filter
    if (selectedCategory) {
      const matchingCategory = categories.find((c) => c.id.toString() === selectedCategory || c.name.toLowerCase().includes(selectedCategory.toLowerCase()))
      if (matchingCategory) {
        result = result.filter((t) => t.category_id === matchingCategory.id)
      }
    }

    // Search filter
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter((t) => {
        const haystack = [t.title, t.content, ...(t.tags || [])].join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }

    // Sort
    if (sortBy === 'recent') {
      result.sort((a, b) => new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0))
    } else if (sortBy === 'views') {
      result.sort((a, b) => (b.views || 0) - (a.views || 0))
    } else if (sortBy === 'replies') {
      result.sort((a, b) => (b.reply_count || 0) - (a.reply_count || 0))
    }

    return result
  }, [threads, categories, selectedCategory, search, sortBy])

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[1200px] px-3 pb-8 pt-3 sm:px-4 lg:px-6">
        {/* Header */}
        <header className="sticky top-3 z-30 mb-6 rounded-[20px] border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur md:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <Link href="/user/dashboard" className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5 p-1 shadow-sm ring-1 ring-slate-200">
                  <img src="/logo.png" alt="Daet tourism logo" className="h-full w-full rounded-lg object-cover" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Daet</p>
                  <p className="text-base font-bold text-slate-800">Connect</p>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 sm:hidden"
              >
                <Plus className="h-4 w-4" />
                New
              </button>
            </div>

            <label className="hidden flex-1 items-center justify-center lg:flex">
              <div className="w-full max-w-xl rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 shadow-inner">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search discussions..."
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </label>

            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="hidden items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 sm:inline-flex"
            >
              <Plus className="h-4 w-4" />
              <span>New Thread</span>
            </button>
          </div>

          <div className="mt-3 lg:hidden">
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search..."
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Sidebar */}
          <aside className="hidden rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm lg:block">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Categories</p>
            </div>

            <nav className="space-y-1.5">
              {categories.length > 0 ? (
                categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                      selectedCategory === category.id
                        ? 'bg-sky-100 text-sky-700 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {category.name}
                    {selectedCategory === category.id && <ChevronRight className="h-4 w-4" />}
                  </button>
                ))
              ) : (
                <div className="text-xs text-slate-500">No categories</div>
              )}
            </nav>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sort By</p>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none"
              >
                <option value="recent">Most Recent</option>
                <option value="views">Most Viewed</option>
                <option value="replies">Most Replied</option>
              </select>
            </div>

            <div className="mt-6 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">Community Stats</p>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Discussions</span>
                  <strong>{threads.length}</strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Replies</span>
                  <strong>{threads.reduce((sum, t) => sum + (t.reply_count || 0), 0)}</strong>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <section>
            {/* Hero */}
            <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white">
              <div className="relative h-40 bg-gradient-to-r from-sky-600 via-cyan-500 to-emerald-500 sm:h-48">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),_transparent_30%),linear-gradient(135deg,_rgba(2,6,23,0.1),_rgba(15,23,42,0.45))]" />
                <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
                  <div>
                    <h1 className="text-2xl font-bold text-white sm:text-4xl">Community Forums</h1>
                    <p className="mt-2 text-sm text-cyan-50/90 sm:text-base">
                      Share travel tips, ask questions, and connect with the Daet community
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/30"
                  >
                    <Plus className="h-4 w-4" />
                    Start Discussion
                  </button>
                </div>
              </div>
            </div>

            {/* Create Thread Modal */}
            {showCreateForm && (
              <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">Start a New Discussion</h2>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Category</label>
                    <select
                      value={createForm.category_id}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, category_id: e.target.value }))}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
                    >
                      <option value="">Select a category...</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Title *</label>
                    <input
                      value={createForm.title}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="What's on your mind?"
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Description *</label>
                    <textarea
                      value={createForm.content}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, content: e.target.value }))}
                      placeholder="Share your thoughts, ask a question, or tell a story..."
                      rows={4}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Tags (comma-separated)</label>
                    <input
                      value={createForm.tags}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, tags: e.target.value }))}
                      placeholder="e.g., travel, tips, recommendations"
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateThread}
                      disabled={submittingThread}
                      className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {submittingThread ? 'Posting...' : 'Post Thread'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Threads List */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-4">
                    <div className="mb-2 h-4 w-2/3 rounded bg-slate-200" />
                    <div className="h-3 w-1/2 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : filteredThreads.length > 0 ? (
              <div className="space-y-3">
                {filteredThreads.map((thread) => (
                  <Link
                    key={thread.id}
                    href={`/user/forums/${thread.id}`}
                    className="block rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-sky-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {thread.pinned && <Pin className="h-4 w-4 text-amber-600 flex-shrink-0" />}
                          <h3 className="text-base font-bold text-slate-900 line-clamp-2">{thread.title}</h3>
                          {thread.status === 'locked' && <Lock className="h-4 w-4 text-red-600 flex-shrink-0" />}
                          {thread.status === 'archived' && <Archive className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                        </div>

                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{thread.content}</p>

                        {/* Tags */}
                        {thread.tags && thread.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {thread.tags.slice(0, 3).map((tag, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                <Tag className="h-3 w-3" />
                                {tag}
                              </span>
                            ))}
                            {thread.tags.length > 3 && (
                              <span className="text-[10px] font-semibold text-slate-500">+{thread.tags.length - 3}</span>
                            )}
                          </div>
                        )}

                        {/* Meta */}
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {thread.info_users?.full_name || thread.info_users?.email || 'Anonymous'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDate(thread.last_activity_at || thread.created_at)}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${getStatusColor(thread.status)}`}>
                            {thread.status === 'active' ? '✓' : thread.status === 'locked' ? '🔒' : '📦'} {thread.status}
                          </span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0 text-right">
                        <div className="flex items-center gap-4 text-sm font-semibold text-slate-700">
                          <div className="flex items-center gap-1">
                            <Eye className="h-4 w-4 text-slate-400" />
                            {thread.views || 0}
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageSquare className="h-4 w-4 text-slate-400" />
                            {thread.reply_count || 0}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm text-slate-500">No discussions match your search.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setSelectedCategory('general')
                  }}
                  className="mt-3 text-xs font-semibold text-sky-600 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
