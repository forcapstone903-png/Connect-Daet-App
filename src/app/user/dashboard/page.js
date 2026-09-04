'use client'

/**
 * Professional, secure dashboard for CONNECT Daet application
 * - Authentication guard & session validation
 * - Database-driven content (no hardcoded data)
 * - Social media feed layout
 * - RLS-protected queries
 * - Error handling with user feedback
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Bell,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Compass,
  FileText,
  Flame,
  Heart,
  Home,
  LayoutGrid,
  Loader,
  MessageSquare,
  Search,
  Star,
  ThumbsUp,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { clearAuthCookie, getAuthCookieFromDocument } from '@/lib/authCookies'
import { normalizeAnnouncementRecord } from '@/lib/announcementSchema'
import MobileNav from '@/app/components/user/MobileNav'
import SocialActionBar from '@/app/components/user/SocialActionBar'
import Comments from '@/app/components/user/Comments'

// Database table constants
const TABLES = {
  USERS: 'info_users',
  BLOGS: 'info_blogs',
  EVENTS: 'info_events',
  AMENITIES: 'info_amenities',
  ANNOUNCEMENTS: 'info_announcements',
  FORUM_THREADS: 'forum_threads',
  CATEGORIES: 'system_categories',
  FEED_PREFERENCES: 'user_feed_preferences',
  ACTIVITY_LOG: 'user_activity_log',
}

const DASHBOARD_CACHE_TTL_MS = 120000
const DASHBOARD_CACHE = new Map()

function getDashboardCache(userId) {
  const cacheEntry = DASHBOARD_CACHE.get(userId)
  if (!cacheEntry) return null

  if (Date.now() > cacheEntry.expiresAt) {
    DASHBOARD_CACHE.delete(userId)
    return null
  }

  return cacheEntry.data
}

function setDashboardCache(userId, data) {
  DASHBOARD_CACHE.set(userId, {
    data,
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
  })
}

// Helper functions
function formatDate(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getImageUrl(value, fallback = null) {
  if (Array.isArray(value) && value.length > 0 && value[0]) return value[0]
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

function getInitials(name = '') {
  return (name || 'T')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'T'
}

export default function UserDashboardPage() {
  const router = useRouter()

  // Auth & User state
  const [authenticated, setAuthenticated] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [userId, setUserId] = useState(null)
  const [userName, setUserName] = useState('Traveler')

  // Data state
  const [feed, setFeed] = useState([])
  const [categories, setCategories] = useState([])
  const [stats, setStats] = useState({ blogs: 0, events: 0, amenities: 0, announcements: 0 })
  const [announcements, setAnnouncements] = useState([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [error, setError] = useState(null)

  // Social engagement state (from feature spec: reactions, bookmarks, gamification)
  const [reactions, setReactions] = useState(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem('daet_feed_reactions') || '{}')
    } catch {
      return {}
    }
  })
  const [savedItems, setSavedItems] = useState(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = JSON.parse(localStorage.getItem('daet_saved_items') || '[]')
      return new Set(raw)
    } catch {
      return new Set()
    }
  })
  const [gamification, setGamification] = useState({ points: 0, level: 1, streak: 0 })
  const [toastMessage, setToastMessage] = useState('')
  const [showReactions, setShowReactions] = useState(null)
  const [openComments, setOpenComments] = useState(null)
  const [commentCounts, setCommentCounts] = useState({})

  // Persist reactions and saved items
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('daet_feed_reactions', JSON.stringify(reactions))
    } catch {}
  }, [reactions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('daet_saved_items', JSON.stringify([...savedItems]))
    } catch {}
  }, [savedItems])

  // Load gamification data
  useEffect(() => {
    if (!authenticated || !userId) return
    let isMounted = true

    const loadGamification = async () => {
      try {
        const [{ data: userData }, { data: activityRows }] = await Promise.all([
          supabase.from(TABLES.USERS).select('points, level').eq('id', userId).maybeSingle(),
          supabase.from('user_activity_log').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
        ])

        let streak = 0
        try {
          // Inline streak computation (same logic as lib/gamification.js getDailyStreak)
          const dates = [...new Set((activityRows || []).map((entry) => entry.created_at?.slice(0, 10)).filter(Boolean))].sort()
          if (dates.length > 0) {
            const today = new Date().toISOString().slice(0, 10)
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
            const hasToday = dates.includes(today)
            const hasYesterday = dates.includes(yesterday)
            if (hasToday || hasYesterday) {
              const lastDate = new Date(hasToday ? today : yesterday)
              let count = 1
              for (let i = dates.length - 1; i >= 0; i--) {
                const prevDate = new Date(lastDate.getTime() - count * 86400000).toISOString().slice(0, 10)
                if (dates.includes(prevDate)) {
                  count += 1
                } else {
                  break
                }
              }
              streak = count
            }
          }
        } catch {}

        if (!isMounted) return
        setGamification({
          points: Number(userData?.points || 0),
          level: Number(userData?.level || 1),
          streak,
        })
      } catch (error) {
        console.error('Gamification load failed:', error)
      }
    }

    loadGamification()
    return () => {
      isMounted = false
    }
  }, [authenticated, userId])

  const handleReact = (e, item, reactionType) => {
    e.preventDefault()
    e.stopPropagation()
    const itemKey = `${item.type}-${item.id}`
    const current = reactions[itemKey]
    const nextReactions = { ...reactions }

    if (current === reactionType) {
      delete nextReactions[itemKey]
      setToastMessage('Reaction removed')
    } else {
      nextReactions[itemKey] = reactionType
      const labels = { like: 'Thanks for the like!', love: 'Spread the love!', wow: 'Glad you loved it!' }
      setToastMessage(labels[reactionType] || 'Thanks for your reaction!')
    }

    setReactions(nextReactions)
    setShowReactions(null)
    setTimeout(() => setToastMessage(''), 2500)

    // Award points for engagement - async fire-and-forget
    if (userId) {
      void supabase.from(TABLES.ACTIVITY_LOG).insert({
        user_id: userId,
        activity_type: 'react_content',
        description: `${reactionType} on ${item.type}`,
      }).then(({ error }) => {
        if (error && error.code !== '42501' && error.code !== 'PGRST301') {
          console.error('Reaction log error:', error)
        }
      })
    }
  }

  const handleBookmark = (e, item) => {
    e.preventDefault()
    e.stopPropagation()
    const itemKey = `${item.type}-${item.id}`
    const nextSaved = new Set(savedItems)

    if (nextSaved.has(itemKey)) {
      nextSaved.delete(itemKey)
      setToastMessage('Removed from saved items')
    } else {
      nextSaved.add(itemKey)
      setToastMessage('Saved for later!')
    }

    setSavedItems(nextSaved)
    setTimeout(() => setToastMessage(''), 2500)
  }

  const trendingTopics = useMemo(() => {
    const topicMap = new Map()
    feed.forEach((item) => {
      const category = item.category || item.type
      topicMap.set(category, (topicMap.get(category) || 0) + 1)
    })
    return [...topicMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))
  }, [feed])

  // Auth check on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const cookieSession = getAuthCookieFromDocument()
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        const activeSession = session || (cookieSession?.logged_in ? { user: { id: cookieSession.user_id, email: cookieSession.user_email, user_metadata: { full_name: cookieSession.user_name, user_type: cookieSession.role } } } : null)

        if (sessionError) throw sessionError
        if (!activeSession?.user) {
          setAuthError('Please log in to continue')
          router.push('/login')
          return
        }

        const sessionUserId = activeSession.user.id
        const sessionUserEmail = activeSession.user.email || cookieSession?.user_email || ''
        const sessionUserName = activeSession.user.user_metadata?.full_name || cookieSession?.user_name || sessionUserEmail.split('@')[0] || 'Traveler'

        setUserId(sessionUserId)
        setUserName(sessionUserName)
        setAuthenticated(true)

        // Track page visit (async - don't block render)
        void (async () => {
          try {
            const { error } = await supabase.from(TABLES.ACTIVITY_LOG).insert({
              user_id: sessionUserId,
              activity_type: 'visit_dashboard',
              description: 'Viewed dashboard',
            })

            if (error) {
              const isPermissionIssue = error?.code === '42501' || error?.code === 'PGRST301'
              if (!isPermissionIssue) {
                console.error('Activity log error:', error)
              }
            }
          } catch (err) {
            const isPermissionIssue = err?.code === '42501' || err?.code === 'PGRST301'
            if (!isPermissionIssue) {
              console.error('Activity log error:', err)
            }
          }
        })()
      } catch (err) {
        console.error('Auth error:', err)
        setAuthError(err.message || 'Authentication failed')
        router.push('/login')
      }
    }

    checkAuth()
  }, [router])

  // Load dashboard data
  useEffect(() => {
    if (!authenticated || !userId) return

    let isMounted = true

    const loadDashboardStats = async (currentUserId) => {
      try {
        const [blogStats, eventStats, amenityStats, announcementStats] = await Promise.all([
          supabase.from(TABLES.BLOGS).select('id', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from(TABLES.EVENTS).select('id', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from(TABLES.AMENITIES).select('id', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from(TABLES.ANNOUNCEMENTS).select('id', { count: 'exact', head: true }).eq('status', 'published'),
        ])

        if (blogStats.error || eventStats.error || amenityStats.error || announcementStats.error) {
          throw new Error('Failed to load statistics')
        }

        const nextStats = {
          blogs: blogStats.count || 0,
          events: eventStats.count || 0,
          amenities: amenityStats.count || 0,
          announcements: announcementStats.count || 0,
        }

        const cachedDashboard = getDashboardCache(currentUserId)
        const nextDashboardData = {
          ...(cachedDashboard || { categories: [], announcements: [], feed: [] }),
          stats: nextStats,
        }

        setDashboardCache(currentUserId, nextDashboardData)

        if (!isMounted) return
        setStats(nextStats)
      } catch (error) {
        console.error('Dashboard stats load error:', error)
      }
    }

    const loadDashboard = async () => {
      const fetchCommentCounts = async (items) => {
        const counts = {}
        await Promise.all(
          (items || []).map(async (item) => {
            const contentType = item.type === 'forum' ? 'forum_thread' : item.type === 'blog' ? 'blog' : 'event'
            const { count } = await supabase
              .from('content_comments')
              .select('id', { count: 'exact', head: true })
              .eq('content_type', contentType)
              .eq('content_id', item.id)
            counts[`${item.type}-${item.id}`] = count || 0
          })
        )
        if (isMounted) setCommentCounts(counts)
      }

      try {
        const cachedDashboard = getDashboardCache(userId)
        if (cachedDashboard) {
          if (!isMounted) return
          setCategories(cachedDashboard.categories || [])
          setAnnouncements(cachedDashboard.announcements || [])
          setStats(cachedDashboard.stats || { blogs: 0, events: 0, amenities: 0, announcements: 0 })
          setFeed(cachedDashboard.feed || [])
          setLoading(false)
          void loadDashboardStats(userId)
          void fetchCommentCounts(cachedDashboard.feed || [])
          return
        }

        setLoading(true)
        setError(null)

        const [categoriesResult, announcementsResult, feedResult] = await Promise.all([
          supabase
            .from(TABLES.CATEGORIES)
            .select('id, name, icon_emoji, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .limit(6),
          supabase
            .from(TABLES.ANNOUNCEMENTS)
            .select('id, title, announcement_type, published_at, image_url, video_url, content')
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(4),
          Promise.all([
            supabase
              .from(TABLES.BLOGS)
              .select('id, title, excerpt, category, published_at')
              .eq('status', 'published')
              .order('published_at', { ascending: false })
              .limit(6),
            supabase
              .from(TABLES.EVENTS)
              .select('id, title, description, category, start_date, location, featured_image, images, videos')
              .eq('status', 'published')
              .order('start_date', { ascending: true })
              .limit(6),
            supabase
              .from(TABLES.FORUM_THREADS)
              .select('id, title, reply_count, last_activity_at')
              .eq('status', 'published')
              .order('last_activity_at', { ascending: false })
              .limit(6),
          ]),
        ])

        if (categoriesResult.error) throw categoriesResult.error
        if (announcementsResult.error) throw announcementsResult.error

        const [blogsFeed, eventsFeed, threadsFeed] = feedResult
        if (blogsFeed.error || eventsFeed.error || threadsFeed.error) {
          throw new Error('Failed to load feed content')
        }

        const nextCategories = categoriesResult.data || []
        const nextAnnouncements = (announcementsResult.data || []).map(normalizeAnnouncementRecord)
        const mixedFeed = [
          ...(blogsFeed.data || []).map((blog) => ({
            ...blog,
            type: 'blog',
            href: `/user/blogs/${blog.id}`,
          })),
          ...(eventsFeed.data || []).map((event) => ({
            ...event,
            type: 'event',
            href: `/user/events/${event.id}`,
          })),
          ...(threadsFeed.data || []).map((thread) => ({
            ...thread,
            type: 'forum',
            href: `/user/forums/${thread.id}`,
          })),
        ].sort((a, b) => new Date(b.published_at || b.last_activity_at || 0) - new Date(a.published_at || a.last_activity_at || 0))

        const nextDashboardData = {
          categories: nextCategories,
          announcements: nextAnnouncements,
          stats: { blogs: 0, events: 0, amenities: 0, announcements: nextAnnouncements.length },
          feed: mixedFeed,
        }

        setDashboardCache(userId, nextDashboardData)

        if (!isMounted) return

        setCategories(nextCategories)
        setAnnouncements(nextAnnouncements)
        setStats(nextDashboardData.stats)
        setFeed(mixedFeed)
        setLoading(false)

        void loadDashboardStats(userId)
        void fetchCommentCounts(mixedFeed)
      } catch (err) {
        if (!isMounted) return
        console.error('Dashboard load error:', err)
        setError(err.message || 'Failed to load dashboard')
      } finally {
        if (isMounted && !error) setLoading(false)
      }
    }

    loadDashboard()

    return () => {
      isMounted = false
    }
  }, [authenticated, userId, error])

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('user_session')
      clearAuthCookie()
      await supabase.auth.signOut()
    } catch (err) {
      console.error('User logout error:', err)
    } finally {
      router.push('/login')
    }
  }

  const filteredFeed = useMemo(() => {
    let result = feed

    if (activeCategory !== 'all') {
      result = result.filter((item) => item.category?.toLowerCase() === activeCategory.toLowerCase())
    }

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter((item) => {
        const haystack = [item.title, item.excerpt, item.description].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }

    return result
  }, [feed, activeCategory, search])

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Loader className="mx-auto mb-4 animate-spin text-slate-600" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    )
  }

  if (authError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-4 text-red-600" />
          <p className="text-red-700">{authError}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-clip bg-[#f3f5f9] text-slate-900">
      <MobileNav />
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg animate-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      <div className="mx-auto w-full max-w-[1200px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        {/* Header */}
        <header className="sticky top-3 z-30 mb-5 w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white/90 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm md:rounded-[28px]">
          <div className="px-3 py-3 sm:px-4 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white shadow-md">
                  D
                </div>
                <div className="hidden min-w-0 sm:block">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Home</p>
                  <p className="text-sm font-bold text-slate-800">CONNECT Daet</p>
                </div>
              </div>

              <div className="hidden flex-1 items-center justify-center px-4 lg:flex">
                <label className="flex w-full max-w-xl items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 shadow-inner">
                  <Search className="h-4 w-4" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search posts, events, blogs..."
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Link href="/user/notifications" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100">
                  <Bell className="h-4 w-4" />
                </Link>
                <Link href="/user/profile" className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 transition hover:border-slate-300">
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-xs font-bold text-white">
                    {getInitials(userName)}
                  </div>
                  <span className="hidden text-xs font-semibold text-slate-700 sm:inline">{userName.split(' ')[0]}</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center justify-center rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                >
                  Logout
                </button>
              </div>
            </div>

            {/* Mobile search */}
            <div className="mt-3 lg:hidden">
              <label className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 shadow-inner">
                <Search className="h-4 w-4" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </label>
            </div>
          </div>
        </header>

        {/* Error message */}
        {error && (
          <div className="mb-5 rounded-[20px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Error loading dashboard</p>
                <p>{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1fr_300px] pb-20 lg:pb-0">
          {/* Main Feed */}
          <section className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Blogs', value: stats.blogs, icon: FileText, href: '/user/blogs' },
                { label: 'Events', value: stats.events, icon: CalendarDays, href: '/user/events' },
                { label: 'Amenities', value: stats.amenities, icon: Compass, href: '/user/amenities' },
                { label: 'Updates', value: announcements.length, icon: Zap, href: '/user/announcements' },
              ].map(({ label, value, icon: Icon, href }) => (
                <Link key={label} href={href} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Category Filter */}
            {categories.length > 0 && (
              <div className="overflow-x-auto rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveCategory('all')}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap ${
                      activeCategory === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    All
                  </button>
                  {categories.slice(0, 5).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.name)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap ${
                        activeCategory === cat.name ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {cat.icon_emoji} {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Feed */}
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-4">
                    <div className="h-4 w-2/3 rounded bg-slate-200" />
                    <div className="mt-3 h-3 w-full rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : filteredFeed.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-sm text-slate-500">No content found. Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredFeed.map((item) => {
                  const itemKey = `${item.type}-${item.id}`
                  const isSaved = savedItems.has(itemKey)
                  const eventMediaUrl = item.type === 'event'
                    ? getImageUrl(item.featured_image || item.images || item.videos, null)
                    : null
                  const eventVideoUrl = item.type === 'event' && Array.isArray(item.videos) && item.videos.length > 0 ? item.videos[0] : item.video_url || null

                  return (
                    <article
                      key={itemKey}
                      className="feed-card w-full max-w-full overflow-hidden rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.07)] sm:p-4"
                    >
                      <div className="feed-post-body">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-bold text-white shadow-sm">
                              {item.type === 'event' ? 'E' : item.type === 'forum' ? 'F' : 'B'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                  {item.type}
                                </span>
                                {item.category && <span className="text-[11px] font-medium text-slate-500">{item.category}</span>}
                              </div>
                              <h3 className="mt-2 text-base font-bold leading-6 text-slate-900 sm:text-lg">{item.title}</h3>
                              {(item.excerpt || item.description) && (
                                <p className="mt-1 text-sm leading-6 text-slate-600">{item.excerpt || item.description}</p>
                              )}
                              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                                {item.location && <span className="inline-flex items-center gap-1">{item.location}</span>}
                                {item.start_date && <span>{formatDate(item.start_date)}</span>}
                                {item.reply_count !== undefined && <span>{item.reply_count} replies</span>}
                                {item.view_count && <span>{item.view_count} views</span>}
                              </div>
                            </div>
                          </div>
                          <Link href={item.href} aria-label={`Open ${item.title}`} className="shrink-0 text-slate-400 transition hover:text-slate-600">
                            <ChevronRight className="h-5 w-5" />
                          </Link>
                        </div>

                        {item.type === 'event' && (eventMediaUrl || eventVideoUrl) && (
                          <div className="feed-media mt-3">
                            {eventVideoUrl ? (
                              <video src={eventVideoUrl} controls className="aspect-[16/9] w-full object-cover" preload="metadata" />
                            ) : (
                              <img src={eventMediaUrl} alt={item.title} className="aspect-[16/9] w-full object-cover" />
                            )}
                          </div>
                        )}

                        <div className="feed-actions mt-3">
                          <SocialActionBar
                            contentType={item.type === 'forum' ? 'forum_thread' : item.type === 'blog' ? 'blog' : 'event'}
                            contentId={item.id}
                            userId={userId}
                            commentCount={commentCounts[`${item.type}-${item.id}`] || 0}
                            onToggleComments={() => setOpenComments(openComments === itemKey ? null : itemKey)}
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={(e) => handleBookmark(e, item)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              isSaved ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} />
                            {isSaved ? 'Saved' : 'Save'}
                          </button>

                          <Link href={item.href} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                            View details
                          </Link>
                        </div>

                        {openComments === itemKey && (
                          <div className="mt-3">
                            <Comments
                              contentType={item.type === 'forum' ? 'forum_thread' : item.type === 'blog' ? 'blog' : 'event'}
                              contentId={item.id}
                              userId={userId}
                            />
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {/* Sidebar */}
          <aside className="hidden space-y-6 xl:block">
            {/* Gamification Summary (from feature spec) */}
            <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-100">My progress</p>
                <Flame className="h-4 w-4 text-amber-300" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-bold text-white">
                  Lv {gamification.level}
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{gamification.points} pts</p>
                  <p className="text-xs text-violet-100">{gamification.streak}-day streak</p>
                </div>
              </div>
              <Link href="/user/rewards" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20">
                <Star className="h-3.5 w-3.5" />
                View rewards
              </Link>
            </div>

            {/* Trending Topics (from feature spec) */}
            {trendingTopics.length > 0 && (
              <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Trending</h3>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="space-y-2">
                  {trendingTopics.map((topic, index) => (
                    <button
                      key={topic.name}
                      type="button"
                      onClick={() => setActiveCategory(topic.name)}
                      className={`flex w-full items-center justify-between rounded-[12px] border px-3 py-2 text-left text-sm transition ${
                        activeCategory === topic.name || activeCategory === topic.name.toLowerCase()
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-medium">{topic.name}</span>
                      <span className={`text-xs font-bold ${activeCategory === topic.name || activeCategory === topic.name.toLowerCase() ? 'text-white' : 'text-emerald-600'}`}>
                        {topic.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Announcements */}
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Updates</h3>
                <Link href="/user/announcements" className="text-xs font-semibold text-sky-600">
                  All
                </Link>
              </div>

              <div className="space-y-3">
                {announcements.length > 0 ? (
                  announcements.map((ann) => {
                    const announcement = normalizeAnnouncementRecord(ann)
                    const mediaUrl = announcement.image_url || announcement.video_url

                    return (
                      <Link key={announcement.id} href={`/user/announcements/${announcement.id}`} className="block rounded-[14px] border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{announcement.type || 'News'}</p>
                        <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-800">{announcement.title}</p>
                        {announcement.content && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{announcement.content}</p>
                        )}
                        {mediaUrl && (
                          <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
                            {announcement.video_url ? (
                              <video src={announcement.video_url} controls className="h-28 w-full object-cover" preload="metadata" />
                            ) : (
                              <img src={announcement.image_url} alt={announcement.title} className="h-28 w-full object-cover" />
                            )}
                          </div>
                        )}
                        <p className="mt-2 text-xs text-slate-500">{formatDate(announcement.published_at || announcement.created_at)}</p>
                      </Link>
                    )
                  })
                ) : (
                  <p className="text-sm text-slate-500">No updates yet</p>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-4 font-bold text-slate-900">Quick Links</h3>
              <div className="space-y-2">
                {[
                  { label: 'Browse Blogs', href: '/user/blogs', icon: FileText },
                  { label: 'View Events', href: '/user/events', icon: CalendarDays },
                  { label: 'Find Places', href: '/user/amenities', icon: Compass },
                  { label: 'Join Forums', href: '/user/forums', icon: MessageSquare },
                  { label: 'My Rewards', href: '/user/rewards', icon: Star },
                  { label: 'Saved', href: '/user/saved', icon: Bookmark },
                ].map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-[12px] border border-slate-200 bg-slate-50 p-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Today */}
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Today</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
