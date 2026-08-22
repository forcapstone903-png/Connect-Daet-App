'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ChevronRight,
  Heart,
  MessageSquare,
  Search,
  Flame,
  Eye,
  Clock,
  User,
  Share2,
  Filter,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const categories = [
  { id: 'travel_guides', label: 'Travel Guides', icon: '✈️' },
  { id: 'cultural_insights', label: 'Cultural Insights', icon: '🏛️' },
  { id: 'food', label: 'Food', icon: '🍽️' },
  { id: 'history', label: 'History', icon: '📚' },
  { id: 'events', label: 'Events', icon: '🎉' },
  { id: 'announcement', label: 'Announcements', icon: '📢' },
]

const STORAGE_KEYS = {
  readHistory: 'daet_blog_read_history',
  newsletter: 'daet_blog_newsletter',
  offlineReads: 'daet_blog_offline_reads',
  pinnedBlogs: 'daet_blog_pinned_blogs',
}

function readLocalStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback

  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch (error) {
    return fallback
  }
}

function writeLocalStorage(key, value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    // Ignore storage errors silently
  }
}

function calculateReadTime(content) {
  if (!content) return 1
  const wordCount = content.trim().split(/\s+/).length
  const readTime = Math.ceil(wordCount / 200)
  return Math.max(1, readTime)
}

function formatDate(value) {
  if (!value) return 'Recently'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7))

  if (diffMins < 1) return 'Now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffWeeks < 4) return `${diffWeeks}w ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function getCategoryColor(category) {
  const colors = {
    travel_guides: 'bg-sky-50 text-sky-700 border-sky-200',
    cultural_insights: 'bg-purple-50 text-purple-700 border-purple-200',
    food: 'bg-orange-50 text-orange-700 border-orange-200',
    history: 'bg-amber-50 text-amber-700 border-amber-200',
    events: 'bg-rose-50 text-rose-700 border-rose-200',
    announcement: 'bg-green-50 text-green-700 border-green-200',
  }
  return colors[category] || 'bg-slate-50 text-slate-700 border-slate-200'
}

export default function BlogsPage() {
  const [blogs, setBlogs] = useState([])
  const [featuredBlogs, setFeaturedBlogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [filterOpen, setFilterOpen] = useState(false)
  const [recentReads, setRecentReads] = useState([])
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterSaved, setNewsletterSaved] = useState(false)

  useEffect(() => {
    let ignore = false

    const loadBlogs = async () => {
      try {
        // Load all published blogs
        const { data: blogsData, error: blogsError } = await supabase
          .from('info_blogs')
          .select(
            `
            *,
            info_users(id, full_name, email)
          `
          )
          .eq('status', 'published')
          .order('published_at', { ascending: false })

        if (blogsError) {
          console.error('Error loading blogs:', blogsError)
        } else if (!ignore) {
          setBlogs(blogsData || [])

          // Get featured blogs (top 3 by views/likes)
          const featured = (blogsData || [])
            .sort((a, b) => {
              const scoreA = (a.views || 0) + (a.likes || 0) * 2
              const scoreB = (b.views || 0) + (b.likes || 0) * 2
              return scoreB - scoreA
            })
            .slice(0, 3)

          setFeaturedBlogs(featured)
        }

        if (!ignore) {
          setLoading(false)
        }
      } catch (error) {
        console.error('Blog fetch failed:', error)
        if (!ignore) setLoading(false)
      }
    }

    loadBlogs()

    const storedReads = readLocalStorage(STORAGE_KEYS.readHistory, [])
    setRecentReads(storedReads.slice(0, 3))
    const savedNewsletter = readLocalStorage(STORAGE_KEYS.newsletter, null)
    if (savedNewsletter) {
      setNewsletterEmail(savedNewsletter)
      setNewsletterSaved(true)
    }

    return () => {
      ignore = true
    }
  }, [])

  const handleNewsletterSubmit = (event) => {
    event.preventDefault()
    if (!newsletterEmail.trim()) return

    writeLocalStorage(STORAGE_KEYS.newsletter, newsletterEmail.trim())
    setNewsletterSaved(true)
  }

  const filteredBlogs = useMemo(() => {
    let result = blogs

    // Category filter
    if (selectedCategory) {
      result = result.filter((blog) => blog.category === selectedCategory)
    }

    // Search filter
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter((blog) => {
        const haystack = [blog.title, blog.excerpt, blog.content, ...(blog.tags || [])].join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }

    // Sort
    if (sortBy === 'recent') {
      result.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
    } else if (sortBy === 'popular') {
      result.sort((a, b) => (b.views || 0) - (a.views || 0))
    } else if (sortBy === 'trending') {
      result.sort((a, b) => {
        const scoreA = (a.views || 0) + (a.likes || 0) * 2
        const scoreB = (b.views || 0) + (b.likes || 0) * 2
        return scoreB - scoreA
      })
    }

    return result
  }, [blogs, selectedCategory, search, sortBy])

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[1200px] px-3 pb-8 pt-3 sm:px-4 lg:px-6">
        {/* Header */}
        <header className="sticky top-3 z-30 mb-6 rounded-[20px] border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur md:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href="/user/dashboard" className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white shadow-md shadow-cyan-500/25">
                  D
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Daet</p>
                  <p className="text-base font-bold text-slate-800">Connect</p>
                </div>
              </Link>
            </div>

            <div className="hidden items-center gap-2 lg:flex">
              <Link href="/user/blogs/new" className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700">
                Write Article
              </Link>
            </div>

            <label className="hidden flex-1 items-center justify-center lg:flex">
              <div className="w-full max-w-xl rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 shadow-inner">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search articles..."
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </label>

            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              <Filter className="h-4 w-4" />
              Filter
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 lg:hidden">
            <label className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search..."
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
            <Link href="/user/blogs/new" className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700">
              New
            </Link>
          </div>
        </header>

        {/* Featured Section */}
        {!search && !selectedCategory && featuredBlogs.length > 0 && (
          <section className="mb-8">
            <div className="mb-4 flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-600" />
              <h2 className="text-xl font-bold text-slate-900">Featured Articles</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredBlogs.map((blog) => (
                <Link
                  key={blog.id}
                  href={`/user/blogs/${blog.id}`}
                  className="group overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm transition hover:shadow-lg hover:border-sky-200"
                >
                  <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-sky-400 to-blue-600">
                    {blog.featured_image ? (
                      <img
                        alt={blog.title}
                        src={blog.featured_image}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-sky-400 to-blue-600">
                        <span className="text-4xl opacity-50">📰</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition" />
                  </div>

                  <div className="p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${getCategoryColor(blog.category)}`}
                      >
                        {categories.find((c) => c.id === blog.category)?.label || blog.category}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 border border-amber-200">
                        <Flame className="h-3 w-3" />
                        Featured
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-bold text-slate-900 line-clamp-2">{blog.title}</h3>

                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{blog.excerpt || blog.content}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {calculateReadTime(blog.content)} min read
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {blog.views || 0} views
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside
            className={`space-y-4 rounded-[24px] ${
              filterOpen ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recent Reads</p>
              </div>

              {recentReads.length > 0 ? (
                <div className="space-y-2">
                  {recentReads.map((read) => (
                    <Link key={read.id} href={`/user/blogs/${read.id}`} className="block rounded-xl border border-slate-200 bg-slate-50 p-2.5 hover:border-sky-200">
                      <p className="text-sm font-semibold text-slate-800 line-clamp-1">{read.title}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{read.time}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No recently read articles yet.</p>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Newsletter</p>
              <h3 className="mt-2 text-base font-bold text-slate-800">Travel updates</h3>

              <form onSubmit={handleNewsletterSubmit} className="mt-3 space-y-3">
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(event) => setNewsletterEmail(event.target.value)}
                  placeholder="Your email"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  {newsletterSaved ? 'Subscribed' : 'Join Newsletter'}
                </button>
              </form>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Categories</p>
              </div>

              <nav className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('')}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    selectedCategory === ''
                      ? 'bg-sky-100 text-sky-700 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  All Articles
                  {selectedCategory === '' && <ChevronRight className="h-4 w-4" />}
                </button>

                {categories.map((category) => (
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
                    <span className="flex items-center gap-2">
                      <span className="text-base">{category.icon}</span>
                      {category.label}
                    </span>
                    {selectedCategory === category.id && <ChevronRight className="h-4 w-4" />}
                  </button>
                ))}
              </nav>

              <div className="mt-6 border-t border-slate-200 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sort By</p>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none"
                >
                  <option value="recent">Most Recent</option>
                  <option value="popular">Most Popular</option>
                  <option value="trending">Trending</option>
                </select>
              </div>

              <div className="mt-6 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 p-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">Content Stats</p>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Total Articles</span>
                    <strong>{blogs.length}</strong>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Total Likes</span>
                    <strong>{blogs.reduce((sum, b) => sum + (b.likes || 0), 0)}</strong>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Total Views</span>
                    <strong>{blogs.reduce((sum, b) => sum + (b.views || 0), 0).toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <section>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-4 h-40" />
                ))}
              </div>
            ) : filteredBlogs.length > 0 ? (
              <div className="space-y-4">
                {filteredBlogs.map((blog) => (
                  <Link
                    key={blog.id}
                    href={`/user/blogs/${blog.id}`}
                    className="block rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-sky-200 sm:p-5"
                  >
                    <div className="flex gap-4 sm:gap-5">
                      {/* Image */}
                      <div className="h-32 w-32 flex-shrink-0 overflow-hidden rounded-[16px] bg-gradient-to-br from-sky-400 to-blue-600 sm:h-40 sm:w-40">
                        {blog.featured_image ? (
                          <img alt={blog.title} src={blog.featured_image} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <span className="text-3xl opacity-50">📰</span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${getCategoryColor(blog.category)}`}
                          >
                            {categories.find((c) => c.id === blog.category)?.label || blog.category}
                          </span>
                        </div>

                        <h3 className="mt-2 text-lg font-bold text-slate-900 line-clamp-2">{blog.title}</h3>

                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{blog.excerpt || blog.content}</p>

                        {/* Tags */}
                        {blog.tags && blog.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {blog.tags.slice(0, 3).map((tag, idx) => (
                              <span key={idx} className="inline-block rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                #{tag}
                              </span>
                            ))}
                            {blog.tags.length > 3 && (
                              <span className="text-[10px] font-semibold text-slate-500">+{blog.tags.length - 3}</span>
                            )}
                          </div>
                        )}

                        {/* Meta */}
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {blog.info_users?.full_name || blog.info_users?.email || 'Anonymous'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {calculateReadTime(blog.content)} min read
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" />
                            {blog.views || 0} views
                          </span>
                          <span className="text-[10px]">{formatDate(blog.published_at)}</span>
                        </div>

                        {/* Stats */}
                        <div className="mt-3 flex items-center gap-4 text-sm font-semibold text-slate-700">
                          <div className="flex items-center gap-1">
                            <Heart className="h-4 w-4 text-slate-400" />
                            {blog.likes || 0}
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageSquare className="h-4 w-4 text-slate-400" />
                            {blog.comments_count || 0}
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
                <p className="text-sm text-slate-500">No articles match your search or filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setSelectedCategory('')
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
