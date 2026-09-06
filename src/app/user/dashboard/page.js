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
import { startTransition, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Flame,
  Loader,
  LogOut,
  MessageCircle,
  Megaphone,
  Menu,
  MapPinned,
  MoreHorizontal,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Search,
  Settings,
  Sparkles,
  Star,
  Clock3,
  TrendingUp,
  UserPlus,
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
const HIDDEN_POSTS_KEY = 'daet_hidden_posts'
const NOT_INTERESTED_KEY = 'daet_not_interested_topics'

function readStoredSet(key) {
  if (typeof window === 'undefined') return new Set()
  try {
    const values = JSON.parse(localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(values) ? values : [])
  } catch {
    return new Set()
  }
}

function writeStoredSet(key, values) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify([...values]))
}

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

function formatRelativeTime(value) {
  if (!value) return 'Recently'
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'Recently'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return formatDate(value)
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
  const [userSignals, setUserSignals] = useState({ activities: [], reactions: [], favorites: [], preferredCategories: [] })

  // UI state
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [recentSearches, setRecentSearches] = useState([])
  const [profileSearchResults, setProfileSearchResults] = useState([])
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
  const [hiddenPosts, setHiddenPosts] = useState(() => new Set())
  const [notInterestedTopics, setNotInterestedTopics] = useState(() => new Set())
  const [openPostMenu, setOpenPostMenu] = useState(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [followedSuggestions, setFollowedSuggestions] = useState(() => new Set())
  const [feedRefreshKey, setFeedRefreshKey] = useState(0)
  const [feedNow, setFeedNow] = useState(() => Date.now())

  useEffect(() => {
    const handleFeedRefresh = () => {
      setFeedNow(Date.now())
      setFeedRefreshKey((value) => value + 1)
    }
    window.addEventListener('daet-feed-refresh', handleFeedRefresh)
    return () => window.removeEventListener('daet-feed-refresh', handleFeedRefresh)
  }, [])

  useEffect(() => {
    const normalizedQuery = search.trim()
    if (normalizedQuery.length < 2) {
      startTransition(() => setProfileSearchResults([]))
      return undefined
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(normalizedQuery)}&limit=5`, {
          credentials: 'same-origin',
          signal: controller.signal,
        })
        const data = await response.json()
        if (!controller.signal.aborted) setProfileSearchResults(data.success ? data.users || [] : [])
      } catch (error) {
        if (error.name !== 'AbortError') setProfileSearchResults([])
      }
    }, 300)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [search])

  useEffect(() => {
    if (!userId) return
    startTransition(() => {
      setHiddenPosts(readStoredSet(`${HIDDEN_POSTS_KEY}_${userId}`))
      setNotInterestedTopics(readStoredSet(`${NOT_INTERESTED_KEY}_${userId}`))
    })
  }, [userId])

  useEffect(() => {
    try {
      const storedSearches = JSON.parse(localStorage.getItem('daet_recent_searches') || '[]')
      startTransition(() => setRecentSearches(Array.isArray(storedSearches) ? storedSearches.slice(0, 5) : []))
    } catch {
      startTransition(() => setRecentSearches([]))
    }
  }, [])

  const saveRecentSearch = (value) => {
    const normalizedValue = value.trim()
    if (!normalizedValue) return
    const nextSearches = [normalizedValue, ...recentSearches.filter((entry) => entry.toLowerCase() !== normalizedValue.toLowerCase())].slice(0, 5)
    setRecentSearches(nextSearches)
    localStorage.setItem('daet_recent_searches', JSON.stringify(nextSearches))
  }

  const submitSearch = (event) => {
    event?.preventDefault()
    if (!search.trim()) return
    saveRecentSearch(search)
    router.push(`/search?q=${encodeURIComponent(search.trim())}`)
    setSearchFocused(false)
  }

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

  const handleBookmark = async (e, item) => {
    e.preventDefault()
    e.stopPropagation()
    if (!userId) return
    const itemKey = `${item.type}-${item.id}`
    const itemType = item.type === 'post' ? 'user_post' : item.type
    const nextSaved = new Set(savedItems)

    try {
      const result = nextSaved.has(itemKey)
        ? await supabase.from('user_favorites').delete().eq('user_id', userId).eq('item_type', itemType).eq('item_id', item.id)
        : await supabase.from('user_favorites').upsert({ user_id: userId, item_type: itemType, item_id: item.id }, { onConflict: 'user_id,item_type,item_id' })
      if (result.error) throw result.error

      if (nextSaved.has(itemKey)) {
        nextSaved.delete(itemKey)
        setToastMessage('Removed from saved items')
      } else {
        nextSaved.add(itemKey)
        setToastMessage('Saved for later!')
      }
      setSavedItems(nextSaved)
    } catch (error) {
      console.error('Save update failed:', error)
      setToastMessage('Unable to update saved items')
    }

    setTimeout(() => setToastMessage(''), 2500)
  }

  const trendingTopics = useMemo(() => {
    const topicMap = new Map()
    feed.forEach((item) => {
      const itemKey = `${item.type}-${item.id}`
      const weight = savedItems.has(itemKey) ? 3 : 1
      const hashtags = String(item.excerpt || item.description || '')
        .match(/#[a-z0-9_]+/gi) || []
      const topics = [item.category || item.type, ...(Array.isArray(item.tags) ? item.tags : []), ...hashtags]
      topics.filter(Boolean).forEach((topic) => {
        const name = String(topic).replace(/^#/, '').trim()
        if (name) topicMap.set(name, (topicMap.get(name) || 0) + weight)
      })
    })
    return [...topicMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))
  }, [feed, savedItems])

  const searchSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return []

    const suggestions = new Map()
    feed.forEach((item) => {
      const values = [item.title, item.category, ...(Array.isArray(item.tags) ? item.tags : [])]
      values.filter(Boolean).forEach((value) => {
        const suggestion = String(value).replace(/^#/, '').trim()
        if (suggestion.toLowerCase().startsWith(query)) suggestions.set(suggestion.toLowerCase(), suggestion)
      })
    })
    return [...suggestions.values()].slice(0, 5)
  }, [feed, search])

  const suggestions = useMemo(() => {
    const availableFeed = feed.filter((item) => item.author?.id && item.author.id !== userId)
    const suggestedPeople = [...new Map(availableFeed.map((item) => [item.author.id, item.author])).values()].slice(0, 3)
    const suggestedLocations = [...new Set(feed.map((item) => item.location).filter(Boolean))].slice(0, 4)
    const suggestedContent = feed.filter((item) => item.type === 'blog' || item.type === 'forum').slice(0, 2)
    return {
      suggestedPost: availableFeed[0] || feed[0] || null,
      suggestedPeople,
      suggestedContent,
      suggestedLocations,
    }
  }, [feed, userId])

  const followSuggestedPerson = async (personId) => {
    if (!userId) return
    try {
      const { error: followError } = await supabase.from('user_follows').insert({ follower_id: userId, following_id: personId })
      if (followError && followError.code !== '23505') throw followError
      setFollowedSuggestions((previous) => new Set([...previous, personId]))
    } catch (followError) {
      console.error('Suggested follow failed:', followError)
      setToastMessage('Unable to follow this person right now')
      setTimeout(() => setToastMessage(''), 2500)
    }
  }

  const hidePost = (itemKey) => {
    setHiddenPosts((previous) => {
      const next = new Set([...previous, itemKey])
      writeStoredSet(`${HIDDEN_POSTS_KEY}_${userId}`, next)
      return next
    })
    setOpenPostMenu(null)
    setToastMessage('Post hidden from your feed')
    setTimeout(() => setToastMessage(''), 2500)
  }

  const markNotInterested = (item) => {
    const topicKeys = [
      item.author?.id ? `author:${item.author.id}` : null,
      item.category ? `category:${String(item.category).toLowerCase()}` : null,
    ].filter(Boolean)
    setNotInterestedTopics((previous) => {
      const next = new Set([...previous, ...topicKeys])
      writeStoredSet(`${NOT_INTERESTED_KEY}_${userId}`, next)
      return next
    })
    setOpenPostMenu(null)
    setToastMessage('We will show fewer posts like this')
    setTimeout(() => setToastMessage(''), 2500)
  }

  const copyPostLink = async (item) => {
    const url = `${window.location.origin}${item.href}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = url
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }
      setToastMessage('Post link copied')
    } catch {
      setToastMessage('Unable to copy the post link')
    }
    setOpenPostMenu(null)
    setTimeout(() => setToastMessage(''), 2500)
  }

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
      const loadUserSignals = async (currentUserId) => {
        try {
          const [activityResult, reactionResult, favoriteResult, preferenceResult] = await Promise.all([
            supabase
              .from(TABLES.ACTIVITY_LOG)
              .select('activity_type, entity_type, entity_id, metadata, created_at')
              .eq('user_id', currentUserId)
              .order('created_at', { ascending: false })
              .limit(100),
            supabase
              .from('content_reactions')
              .select('content_type, content_id, reaction_type, created_at')
              .eq('user_id', currentUserId)
              .limit(100),
            supabase
              .from('user_favorites')
              .select('item_type, item_id, created_at')
              .eq('user_id', currentUserId)
              .limit(100),
            supabase
              .from(TABLES.FEED_PREFERENCES)
              .select('preferred_categories')
              .eq('user_id', currentUserId)
              .maybeSingle(),
          ])

          if (!isMounted) return
          setSavedItems(new Set((favoriteResult.data || []).map((favorite) => `${favorite.item_type}-${favorite.item_id}`)))
          setUserSignals({
            activities: activityResult.data || [],
            reactions: reactionResult.data || [],
            favorites: favoriteResult.data || [],
            preferredCategories: Array.isArray(preferenceResult.data?.preferred_categories) ? preferenceResult.data.preferred_categories : [],
          })
        } catch (signalError) {
          // Recommendations are optional; the chronological feed remains available.
          console.error('Personalization signals load failed:', signalError)
        }
      }

      void loadUserSignals(userId)

      const fetchCommentCounts = async (items) => {
        const counts = {}
        await Promise.all(
          (items || []).map(async (item) => {
            const contentType = item.type === 'forum' ? 'forum_thread' : item.type === 'blog' ? 'blog' : item.type === 'post' ? 'user_post' : item.type === 'announcement' ? 'announcement' : 'event'
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
        if (cachedDashboard && feedRefreshKey === 0) {
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
            .select('id, title, announcement_type, audience, priority, published_at, expires_at, image_url, video_url, content, created_by, updated_at, status')
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(4),
          Promise.all([
            supabase
              .from(TABLES.BLOGS)
              .select('id, title, excerpt, category, tags, featured_image, published_at, updated_at, views, likes, comments_count, created_by')
              .eq('status', 'published')
              .order('published_at', { ascending: false })
              .limit(20),
            supabase
              .from(TABLES.EVENTS)
              .select('id, title, description, category, start_date, end_date, start_time, end_time, location, venue, latitude, longitude, is_free, ticket_price, current_attendees, featured_image, images, videos, published_at, updated_at, created_by, status')
              .eq('status', 'published')
              .order('start_date', { ascending: true })
              .limit(20),
            supabase
              .from(TABLES.FORUM_THREADS)
              .select('id, title, content, category_id, reply_count, last_activity_at, created_at, updated_at, created_by, status')
              .eq('status', 'published')
              .order('last_activity_at', { ascending: false })
              .limit(20),
            supabase
              .from('user_follows')
              .select('following_id')
              .eq('follower_id', userId),
            supabase
              .from('info_user_posts')
              .select('id, user_id, title, content, created_at, updated_at, status')
              .eq('status', 'published')
              .order('created_at', { ascending: false })
              .limit(50),
          ]),
        ])

        if (categoriesResult.error) throw categoriesResult.error
        if (announcementsResult.error) throw announcementsResult.error

        const [blogsFeed, eventsFeed, threadsFeed, followsFeed, userPostsFeed] = feedResult
        if (blogsFeed.error || eventsFeed.error || threadsFeed.error) {
          throw new Error('Failed to load feed content')
        }

        const followedUserIds = new Set([
          userId,
          ...(followsFeed.data || []).map((row) => row.following_id).filter(Boolean),
        ])
        const followedPosts = (userPostsFeed.data || [])
          .filter((post) => followedUserIds.has(post.user_id))
          .map((post) => ({
            ...post,
            created_by: post.user_id,
            excerpt: post.content,
            published_at: post.created_at,
            category: 'Community',
          }))

        const nextCategories = categoriesResult.data || []
        const nextAnnouncements = (announcementsResult.data || []).map(normalizeAnnouncementRecord)
        const authorIds = [
          ...(blogsFeed.data || []).map((item) => item.created_by),
          ...(eventsFeed.data || []).map((item) => item.created_by),
          ...(threadsFeed.data || []).map((item) => item.created_by),
          ...followedPosts.map((item) => item.created_by),
          ...(nextAnnouncements || []).map((item) => item.created_by),
        ].filter(Boolean)
        const { data: authors } = authorIds.length
          ? await supabase.from(TABLES.USERS).select('id, full_name, profile_image_url, user_type').in('id', [...new Set(authorIds)])
          : { data: [] }
        const authorMap = new Map((authors || []).map((author) => [author.id, author]))
        const withAuthor = (item) => ({
          ...item,
          author: authorMap.get(item.created_by) || null,
        })

        const mixedFeed = [
          ...(blogsFeed.data || []).map((blog) => ({
            ...withAuthor(blog),
            type: 'blog',
            href: `/user/blogs/${blog.id}`,
          })),
          ...(eventsFeed.data || []).map((event) => ({
            ...withAuthor(event),
            type: 'event',
            href: `/user/events/${event.id}`,
          })),
          ...(threadsFeed.data || []).map((thread) => ({
            ...withAuthor(thread),
            type: 'forum',
            href: `/user/forums/${thread.id}`,
          })),
          ...followedPosts.map((post) => ({
            ...withAuthor(post),
            type: 'post',
            href: `/user/profile/${post.user_id}`,
          })),
          ...(nextAnnouncements || []).map((announcement) => ({
            ...withAuthor(announcement),
            type: 'announcement',
            href: `/user/announcements/${announcement.id}`,
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
  }, [authenticated, userId, error, feedRefreshKey])

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
    let result = feed.filter((item) => {
      if (hiddenPosts.has(`${item.type}-${item.id}`)) return false
      if (item.author?.id && notInterestedTopics.has(`author:${item.author.id}`)) return false
      if (item.category && notInterestedTopics.has(`category:${String(item.category).toLowerCase()}`)) return false
      return true
    })

    if (activeCategory !== 'all') {
      result = result.filter((item) => {
        const topics = [
          item.category,
          item.type,
          ...(Array.isArray(item.tags) ? item.tags : []),
          ...(String(item.excerpt || item.description || '').match(/#[a-z0-9_]+/gi) || []),
        ].filter(Boolean).map((topic) => String(topic).replace(/^#/, '').toLowerCase())
        return topics.includes(activeCategory.replace(/^#/, '').toLowerCase())
      })
    }

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter((item) => {
        const haystack = [item.title, item.excerpt, item.description, ...(Array.isArray(item.tags) ? item.tags : [])].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }

    const categoryWeights = new Map()
    const typeWeights = new Map()
    const interactedIds = new Set()
    const reactionIds = new Set(userSignals.reactions.map((signal) => {
      const contentType = signal.content_type === 'forum_thread' ? 'forum' : signal.content_type
      return `${contentType}-${signal.content_id}`
    }))
    const favoriteIds = new Set(userSignals.favorites.map((favorite) => `${favorite.item_type}-${favorite.item_id}`))

    const addWeight = (map, key, amount) => {
      if (!key) return
      const normalizedKey = String(key).toLowerCase()
      map.set(normalizedKey, (map.get(normalizedKey) || 0) + amount)
    }

    userSignals.preferredCategories.forEach((category) => addWeight(categoryWeights, category, 8))
    userSignals.activities.forEach((activity) => {
      const entityType = activity.entity_type === 'forum_thread' ? 'forum' : activity.entity_type
      addWeight(typeWeights, entityType, activity.activity_type === 'visit_dashboard' ? 0 : 2)
      if (activity.entity_id) interactedIds.add(`${entityType}-${activity.entity_id}`)
      if (activity.metadata?.category) addWeight(categoryWeights, activity.metadata.category, 4)
    })

    userSignals.reactions.forEach((reaction) => {
      const normalizedType = reaction.content_type === 'forum_thread' ? 'forum' : reaction.content_type
      addWeight(typeWeights, normalizedType, 5)
      interactedIds.add(`${normalizedType}-${reaction.content_id}`)
    })

    userSignals.favorites.forEach((favorite) => {
      addWeight(typeWeights, favorite.item_type, 6)
      interactedIds.add(`${favorite.item_type}-${favorite.item_id}`)
    })

    return result
      .map((item, index) => {
        const itemKey = `${item.type}-${item.id}`
        const category = String(item.category || '').toLowerCase()
        const itemType = String(item.type || '').toLowerCase()
        const ageInDays = Math.max(0, (feedNow - new Date(item.published_at || item.start_date || item.last_activity_at || 0).getTime()) / 86400000)
        const recencyScore = Number.isFinite(ageInDays) ? Math.max(0, 8 - ageInDays) : 0
        const refreshVariation = feedRefreshKey > 0
          ? ((String(item.id).charCodeAt(0) + feedRefreshKey) % 7) / 100
          : 0
        const score = recencyScore
          + (categoryWeights.get(category) || 0)
          + (typeWeights.get(itemType) || 0)
          + (interactedIds.has(itemKey) ? 18 : 0)
          + (reactionIds.has(itemKey) ? 22 : 0)
          + (favoriteIds.has(itemKey) ? 20 : 0)
          + refreshVariation

        return { item, index, score }
      })
        .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ item }) => item)
      }, [feed, activeCategory, search, userSignals, hiddenPosts, notInterestedTopics, feedRefreshKey, feedNow])

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] px-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Loader className="mx-auto mb-4 animate-spin text-slate-600" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    )
  }

  if (authError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] px-4">
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-4 text-red-600" />
          <p className="text-red-700">{authError}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen w-full overflow-x-clip bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] text-slate-900">
      <MobileNav />
      {toastMessage && (
        <div className="fixed left-1/2 top-4 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-slate-950 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-xl">
          {toastMessage}
        </div>
      )}

      <div className="mx-auto w-full max-w-[1280px] px-3 pb-24 pt-0 sm:px-5 sm:pt-3 lg:px-8 lg:pb-10">
        <header className="sticky top-0 z-30 mb-4 rounded-[22px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_12px_35px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:top-2 sm:p-4 lg:rounded-[26px]">
          <div className="flex items-center justify-between gap-3">
            <Link href="/user/dashboard" className="flex min-w-0 shrink-0 items-center gap-2">
              <img src="/logo.png" alt="Daet tourism logo" className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-black tracking-tight text-sky-700 sm:text-base">Daet Connect</span>
                <span className="block truncate text-[10px] font-medium text-slate-500 sm:text-xs">Daet community</span>
              </span>
            </Link>

            <div className="relative hidden min-w-0 flex-1 px-4 lg:block">
              <form onSubmit={submitSearch} className="mx-auto flex max-w-[520px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 focus-within:border-sky-400 focus-within:bg-white">
                <Search className="h-4 w-4 shrink-0" />
                <input value={search} onFocus={() => setSearchFocused(true)} onChange={(e) => setSearch(e.target.value)} placeholder="Search the community" className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
              </form>
              {searchFocused && (
                <div className="absolute left-4 right-4 top-[calc(100%+0.5rem)] z-40 mx-auto max-w-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{search.trim() ? 'Suggestions' : 'Recent searches'}</p>
                  {(search.trim() ? searchSuggestions : recentSearches).length ? (
                    <div className="space-y-1">{(search.trim() ? searchSuggestions : recentSearches).map((suggestion) => <button key={suggestion} type="button" onClick={() => { setSearch(suggestion); saveRecentSearch(suggestion); router.push(`/search?q=${encodeURIComponent(suggestion)}`); setSearchFocused(false) }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-sky-50"><Search className="h-4 w-4 text-slate-400" />{suggestion}</button>)}</div>
                  ) : <p className="px-3 py-2 text-sm text-slate-500">{search.trim() ? 'No suggestions yet.' : 'No recent searches yet.'}</p>}
                  {search.trim() && profileSearchResults.length > 0 && <div className="mt-2 border-t border-slate-100 pt-2"><p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">People</p>{profileSearchResults.map((person) => <Link key={person.id} href={`/user/profile/${person.id}`} onClick={() => setSearchFocused(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-sky-50"><span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-[10px] font-bold text-sky-700">{person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(person.full_name)}</span><span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{person.full_name || 'Community member'}</span>{person.mutual_friends?.length > 0 && <span className="shrink-0 text-[10px] font-semibold text-sky-700">{person.mutual_friends.length} mutual</span>}</Link>)}</div>}
                  <Link href="/search" className="mt-1 block border-t border-slate-100 px-3 pt-3 text-xs font-bold text-sky-700 hover:text-sky-800">View search history</Link>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Link href="/user/profile" aria-label="Open profile" className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-sky-700 text-xs font-bold text-white transition hover:bg-sky-800">
                {getInitials(userName)}
              </Link>
              <div className="relative">
                <button type="button" onClick={() => setShowProfileMenu((value) => !value)} aria-label="Open settings menu" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-sky-50 hover:text-sky-700">
                  <Menu className="h-5 w-5" />
                </button>
                {showProfileMenu && <div className="absolute right-0 top-12 z-30 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <Link href="/user/profile" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />Profile settings</Link>
                  <Link href="/user/messaging" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><MessageCircle className="h-4 w-4" />Messages</Link>
                  <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Log out</button>
                </div>}
              </div>
            </div>
          </div>

        </header>

        {error && (
          <div className="mb-4 flex gap-3 rounded-[18px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Could not load your feed</p><p>{error}</p></div>
          </div>
        )}

        <div className="mb-4 rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_8px_25px_rgba(15,23,42,0.06)] sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-700 text-sm font-bold text-white">{getInitials(userName)}</div>
            <Link href="/user/blogs/new" className="flex min-h-11 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-500 transition hover:border-sky-300">
              Share something with Daet...
            </Link>
            <Link href="/user/blogs/new" aria-label="Create a post" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm transition hover:bg-amber-600">
              <Zap className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-center text-[11px] font-semibold text-slate-500">
            <Link href="/user/blogs/new" className="rounded-xl py-2 hover:bg-white">Write a story</Link>
            <Link href="/user/events" className="rounded-xl py-2 hover:bg-white">Find an event</Link>
            <Link href="/user/forums" className="rounded-xl py-2 hover:bg-white">Start a chat</Link>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
          <section className="min-w-0 space-y-4">
            <div className="flex items-end justify-between px-1">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Your community</p><h1 className="mt-1 text-xl font-black leading-tight tracking-tight text-slate-900">Latest from Daet</h1></div>
              <button type="button" onClick={() => window.dispatchEvent(new Event('daet-feed-refresh'))} aria-label="Refresh your feed" title="Refresh your feed" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:text-sky-700"><RefreshCw className="h-4 w-4" /></button>
            </div>

            {!loading && (suggestions.suggestedPost || suggestions.suggestedPeople.length || suggestions.suggestedContent.length || suggestions.suggestedLocations.length) && (
              <section className="rounded-[22px] border border-sky-100 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-sky-600" /><h2 className="text-base font-black leading-tight text-slate-900">Suggested for you</h2></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {suggestions.suggestedPost && (
                    <Link href={suggestions.suggestedPost.href} className="rounded-xl bg-sky-50 p-3 transition hover:bg-sky-100">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">Suggested post</p>
                      <p className="mt-1 line-clamp-2 text-[13px] font-bold leading-5 text-slate-900">{suggestions.suggestedPost.title}</p>
                      <p className="mt-1 text-[11px] text-slate-500">From {suggestions.suggestedPost.author?.full_name || 'the Daet community'}</p>
                    </Link>
                  )}

                  {suggestions.suggestedPeople.length > 0 && (
                    <div className="rounded-xl bg-emerald-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">People to follow</p>
                      <div className="mt-2 space-y-2">{suggestions.suggestedPeople.map((person) => <div key={person.id} className="flex items-center justify-between gap-2"><Link href={`/user/profile/${person.id}`} className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-[10px] font-bold text-white">{person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(person.full_name)}</span><span className="truncate text-xs font-bold text-slate-800">{person.full_name || 'Community member'}</span></Link><button type="button" onClick={() => followSuggestedPerson(person.id)} disabled={followedSuggestions.has(person.id)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 disabled:text-slate-400">{followedSuggestions.has(person.id) ? 'Following' : <><UserPlus className="h-3 w-3" />Follow</>}</button></div>)}</div>
                    </div>
                  )}

                  {suggestions.suggestedContent.length > 0 && (
                    <div className="rounded-xl bg-amber-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">Suggested content</p><div className="mt-2 space-y-1">{suggestions.suggestedContent.map((item) => <Link key={`${item.type}-${item.id}`} href={item.href} className="block truncate text-[13px] font-bold leading-5 text-slate-800 hover:text-amber-700">{item.title}</Link>)}</div></div>
                  )}

                  {suggestions.suggestedLocations.length > 0 && (
                    <div className="rounded-xl bg-violet-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Suggested locations</p><div className="mt-2 flex flex-wrap gap-2">{suggestions.suggestedLocations.map((location) => <Link key={location} href={`/search?q=${encodeURIComponent(location)}`} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-violet-700"><MapPinned className="h-3 w-3 text-violet-600" />{location}</Link>)}</div></div>
                  )}
                </div>
              </section>
            )}

            {loading ? (
              <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="animate-pulse rounded-[22px] border border-slate-200 bg-white p-4"><div className="h-4 w-1/2 rounded bg-slate-200" /><div className="mt-4 h-3 w-full rounded bg-slate-200" /><div className="mt-2 h-3 w-4/5 rounded bg-slate-200" /></div>)}</div>
            ) : filteredFeed.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No posts found. Try another topic or search.</div>
            ) : (
              <div className="space-y-4">
                {filteredFeed.map((item) => {
                  const itemKey = `${item.type}-${item.id}`
                  const isSaved = savedItems.has(itemKey)
                  const author = item.author
                  const authorName = author?.full_name || (item.type === 'forum' || item.type === 'post' ? 'Community member' : item.type === 'event' ? 'Event organizer' : 'Daet storyteller')
                  const itemDate = item.last_activity_at || item.published_at || item.created_at || item.start_date
                  const eventMediaUrl = item.type === 'event' ? getImageUrl(item.featured_image || item.images || item.videos, null) : null
                  const eventVideoUrl = item.type === 'event' && Array.isArray(item.videos) && item.videos.length > 0 ? item.videos[0] : item.video_url || null
                  const postImageUrl = item.type === 'blog' ? item.featured_image : item.type === 'announcement' ? item.image_url : eventMediaUrl
                  const postVideoUrl = item.type === 'announcement' ? item.video_url : eventVideoUrl
                  const contentType = item.type === 'forum' ? 'forum_thread' : item.type === 'blog' ? 'blog' : item.type === 'post' ? 'user_post' : item.type === 'announcement' ? 'announcement' : 'event'
                  return (
                    <article key={itemKey} data-post-id={item.id} data-impression-id={`${itemKey}-${userId || 'guest'}`} className="feed-card overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_8px_25px_rgba(15,55,60,0.05)]">
                      <div className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <Link href={author?.id ? `/user/profile/${author.id}` : '/user/profile'} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-black uppercase text-sky-700" aria-label={`View ${authorName}'s profile`}>
                            {author?.profile_image_url ? <img src={author.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(authorName)}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-600">
                              <Link href={author?.id ? `/user/profile/${author.id}` : '/user/profile'} className="font-bold text-slate-900 hover:text-sky-700">{authorName}</Link>
                              {author?.user_type === 'admin' && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-label="Verified organization" />}
                              <span className="text-slate-400">·</span>
                              <time dateTime={itemDate || undefined} title={itemDate ? new Date(itemDate).toLocaleString() : undefined} className="text-slate-500">{formatRelativeTime(itemDate)}</time>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700"><span>{item.type}</span>{item.category && <><span className="text-slate-300">•</span><span className="normal-case tracking-normal text-slate-500">{item.category}</span></>}</div>
                            <Link href={item.href} className="block"><h2 className="mt-1 break-words text-[15px] font-extrabold leading-5 text-slate-950 hover:text-sky-700 sm:text-base">{item.title}</h2></Link>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">{item.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>}{item.start_date && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDate(item.start_date)}</span>}{item.reply_count !== undefined && <span>{item.reply_count} replies</span>}</div>
                          </div>
                          <div className="relative shrink-0">
                            <button type="button" aria-label="Post options" onClick={() => setOpenPostMenu(openPostMenu === itemKey ? null : itemKey)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-500"><MoreHorizontal className="h-4 w-4" /></button>
                            {openPostMenu === itemKey && <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                              <button type="button" onClick={() => hidePost(itemKey)} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">Hide post</button>
                              <button type="button" onClick={() => markNotInterested(item)} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">Not interested</button>
                              <button type="button" onClick={() => void copyPostLink(item)} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">Copy link</button>
                            </div>}
                          </div>
                        </div>

                        {(item.excerpt || item.description) && <p className="mt-3 break-words text-[13px] leading-5 text-slate-600">{item.excerpt || item.description}</p>}
                        {item.type === 'forum' && <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">Discussion</span>{item.status === 'archived' && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Archived</span>}<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Last active {formatRelativeTime(item.last_activity_at)}</span></div>}
                        {item.type === 'event' && <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">{item.is_free ? 'Free entry' : `₱${Number(item.ticket_price || 0).toLocaleString()}`}</span>{item.current_attendees > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{item.current_attendees} attending</span>}<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{item.location ? 'Physical' : 'Online / TBA'}</span></div>}
                        {item.type === 'blog' && item.tags?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{item.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">#{tag}</span>)}</div>}
                        {item.type === 'announcement' && <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${item.announcement_type === 'urgent' ? 'bg-red-50 text-red-700' : item.announcement_type === 'important' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}><ShieldCheck className="h-4 w-4" />Official {item.announcement_type || 'info'} update<span className="font-medium">Applies to: {item.audience || 'all'}</span>{item.expires_at && <span className="font-medium">Until {formatDate(item.expires_at)}</span>}</div>}
                        {(postImageUrl || postVideoUrl) && <div className="feed-media mt-4 overflow-hidden rounded-[16px]">{postVideoUrl ? <video src={postVideoUrl} controls className="aspect-[16/9] w-full object-cover" preload="metadata" /> : <Link href={item.href} className="block"><img src={postImageUrl} alt={item.title} className="aspect-[16/9] w-full object-cover transition hover:brightness-95" /></Link>}</div>}

                        <div className="feed-actions"><SocialActionBar contentType={contentType} contentId={item.id} userId={userId} commentCount={commentCounts[`${item.type}-${item.id}`] || 0} onToggleComments={() => setOpenComments(openComments === itemKey ? null : itemKey)} isSaved={isSaved} onToggleSave={(event) => handleBookmark(event, item)} /></div>
                        {openComments === itemKey ? (
                          <div className="mt-4"><Comments contentType={contentType} contentId={item.id} userId={userId} contentTitle={item.title} /></div>
                        ) : (
                          <Comments contentType={contentType} contentId={item.id} userId={userId} contentTitle={item.title} compact />
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <aside className="hidden space-y-4 lg:block lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-[22px] bg-slate-950 p-5 text-white shadow-[0_14px_35px_rgba(15,23,42,0.16)]">
              <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-200">Your rhythm</p><Flame className="h-4 w-4 text-amber-300" /></div>
              <p className="mt-3 text-3xl font-black">{gamification.points}<span className="ml-1 text-sm font-semibold text-sky-200">pts</span></p>
              <p className="mt-1 text-xs text-slate-200">Level {gamification.level} · {gamification.streak}-day streak</p>
              <Link href="/user/rewards" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 px-3 py-2.5 text-xs font-bold text-white hover:bg-amber-600"><Star className="h-3.5 w-3.5" />View rewards</Link>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Based on activity</p><h2 className="mt-1 font-extrabold text-slate-950">Trending topics</h2></div><TrendingUp className="h-4 w-4 text-sky-700" /></div>
              <div className="space-y-2">{trendingTopics.map((topic) => <button key={topic.name} type="button" onClick={() => setActiveCategory(topic.name)} className="flex min-h-10 w-full items-center justify-between rounded-xl bg-sky-50 px-3 text-left text-sm font-semibold text-slate-700 hover:bg-sky-100"><span>#{topic.name}</span><span className="text-xs text-sky-700">{topic.count}</span></button>)}</div>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Official notice</p><h2 className="mt-1 font-extrabold text-slate-950">Announcements</h2></div><Megaphone className="h-5 w-5 text-amber-700" /></div>
              <div className="space-y-2">{announcements.slice(0, 2).map((ann) => { const announcement = normalizeAnnouncementRecord(ann); return <Link key={announcement.id} href={`/user/announcements/${announcement.id}`} className="block rounded-xl bg-white/80 p-3 shadow-sm transition hover:bg-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">{announcement.type || 'News'}</p><p className="mt-1 line-clamp-2 text-sm font-bold text-slate-800">{announcement.title}</p><p className="mt-1 text-[11px] text-slate-500">{formatDate(announcement.published_at || announcement.created_at)}</p></Link> })}</div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
