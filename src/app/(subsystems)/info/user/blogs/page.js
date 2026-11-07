'use client'

import { useEffect, useMemo, useState } from 'react'
import UserSectionHeader from '@/app/components/user/UserSectionHeader'
import Link from 'next/link'
import {
  ChevronRight,
  Heart,
  MessageSquare,
  Flame,
  Eye,
  Clock,
  Share2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { filterValidUuidValues } from '@/lib/uuid'
import UserTopHeader from '@/app/components/user/UserTopHeader'

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

function formatPostedDate(value) {
  if (!value) return 'Recently posted'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently posted'

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

function BlogMedia({ blog, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false)

  if (!blog.featured_image || imageFailed) return null

  return (
    <div className={`w-full overflow-hidden bg-slate-100 ${compact ? 'relative h-48' : 'aspect-[16/8.5]'}`}>
      <img
        alt={blog.title}
        src={blog.featured_image}
        onError={() => setImageFailed(true)}
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
      />
    </div>
  )
}

export default function BlogsPage() {
  const [blogs, setBlogs] = useState([])
  const [featuredBlogs, setFeaturedBlogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [sortBy, setSortBy] = useState('recent')
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
            info_users(id, full_name, email, profile_image_url)
          `
          )
          .eq('status', 'published')
          .order('published_at', { ascending: false })

        if (blogsError) {
          console.error('Error loading blogs:', blogsError)
        } else if (!ignore) {
          const blogIds = filterValidUuidValues((blogsData || []).map((blog) => blog.id).filter(Boolean))
          const [reactionsResult, sharesResult, commentsResult] = blogIds.length
            ? await Promise.all([
                supabase.from('content_reactions').select('content_id').eq('content_type', 'blog').in('content_id', blogIds),
                supabase.from('content_shares').select('content_id').eq('content_type', 'blog').in('content_id', blogIds),
                supabase.from('content_comments').select('content_id').eq('content_type', 'blog').in('content_id', blogIds),
              ])
            : [{ data: [] }, { data: [] }, { data: [] }]

          const countByBlog = (rows) => (rows || []).reduce((counts, row) => {
            counts[row.content_id] = (counts[row.content_id] || 0) + 1
            return counts
          }, {})
          const reactionCounts = countByBlog(reactionsResult.data)
          const shareCounts = countByBlog(sharesResult.data)
          const commentCounts = countByBlog(commentsResult.data)
          const blogsWithEngagement = (blogsData || []).map((blog) => ({
            ...blog,
            _reaction_count: reactionCounts[blog.id] || 0,
            _share_count: shareCounts[blog.id] || 0,
            _comment_count: commentCounts[blog.id] || 0,
          }))

          setBlogs(blogsWithEngagement)

          // Get featured blogs (top 3 by views/likes)
          const featured = [...blogsWithEngagement]
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
    const savedNewsletter = readLocalStorage(STORAGE_KEYS.newsletter, null)
    queueMicrotask(() => {
      setRecentReads(storedReads.slice(0, 3))
      if (savedNewsletter) {
        setNewsletterEmail(savedNewsletter)
        setNewsletterSaved(true)
      }
    })

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
    let result = [...blogs]

    // Category filter
    if (selectedCategory) {
      result = result.filter((blog) => blog.category === selectedCategory)
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
  }, [blogs, selectedCategory, sortBy])

  return (
    <main className="tourism-shell usr-section-page usr-stories min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-6xl px-3 pb-8 pt-2 sm:px-4 lg:px-6">
        <UserSectionHeader eyebrow="Through a local lens" title="Community stories" description="Discover hidden gems, local favorites, and stories worth sharing from around Daet." emoji="✍️">
          <Link href="/user/blogs/new" className="usr-section-primary">Write a story</Link>
        </UserSectionHeader>
        <div className="usr-section-toolbar mb-5 flex flex-wrap items-center gap-3">
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="recent">Most recent</option>
              <option value="popular">Most popular</option>
              <option value="trending">Trending</option>
            </select>
        </div>

        {/* Featured Section */}
        {false && !selectedCategory && featuredBlogs.length > 0 && (
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
                  <BlogMedia blog={blog} compact />

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

        <div>
          <aside
            className="hidden"
          >
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recent Reads</p>
              </div>

              {recentReads.length > 0 ? (
                <div className="space-y-1.5">
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
              <div className="space-y-0">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-4 h-40" />
                ))}
              </div>
            ) : filteredBlogs.length > 0 ? (
              <div className="usr-story-grid grid items-start gap-5 md:grid-cols-2">
                {filteredBlogs.map((blog) => (
                  <article
                    key={blog.id}
                    className="usr-story-card group min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <Link href={blog.created_by ? `/user/profile/${blog.created_by}` : '/user/profile'} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-black uppercase text-sky-700 lg:h-12 lg:w-12" aria-label="View author's profile">
                          {blog.info_users?.profile_image_url ? <img src={blog.info_users.profile_image_url} alt="" className="h-full w-full object-cover" /> : (blog.info_users?.full_name || blog.info_users?.email || 'A')[0].toUpperCase()}
                        </Link>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-600">
                            <Link href={blog.created_by ? `/user/profile/${blog.created_by}` : '/user/profile'} className="font-bold text-slate-900 hover:text-sky-700 lg:text-sm">{blog.info_users?.full_name || blog.info_users?.email || 'Anonymous'}</Link>
                            <span className="text-slate-400">·</span>
                            <time dateTime={blog.published_at || undefined} title={formatPostedDate(blog.published_at)} className="text-slate-500">{formatDate(blog.published_at)}</time>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">
                            <span>Blog</span>
                            <span className="font-medium normal-case tracking-normal text-slate-500">{calculateReadTime(blog.content)} min read</span>
                          </div>
                        </div>
                      </div>

                      {blog.featured_image && (
                        <Link href={`/user/blogs/${blog.id}`} className="mt-3 block overflow-hidden rounded-[16px] border border-slate-200 bg-slate-100">
                          <BlogMedia blog={blog} />
                        </Link>
                      )}

                      <div className="pt-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getCategoryColor(blog.category)}`}>{categories.find((c) => c.id === blog.category)?.label || blog.category}</span>
                          {blog.featured && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><Flame className="h-3 w-3" />Featured</span>}
                        </div>
                        <Link href={`/user/blogs/${blog.id}`}><h3 className="mt-3 line-clamp-2 text-[15px] font-extrabold leading-5 text-slate-950 hover:text-sky-700 sm:text-base lg:text-lg lg:leading-7">{blog.title}</h3></Link>
                        <p className="mt-2 line-clamp-3 text-sm leading-5 text-slate-600">{blog.excerpt || blog.content}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{blog._reaction_count ?? blog.likes ?? 0} reactions</span>
                          <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{blog._comment_count || 0} comments</span>
                          <span className="inline-flex items-center gap-1"><Share2 className="h-3.5 w-3.5" />{blog._share_count || 0} shares</span>
                          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{blog.views || 0} views</span>
                          <span className="ml-auto inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{calculateReadTime(blog.content)} min read</span>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm text-slate-500">No articles match your search or filter.</p>
                <button
                  type="button"
                  onClick={() => {
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
