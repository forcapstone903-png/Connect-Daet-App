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
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowUp,
  CalendarDays,
  Flame,
  Gift,
  ImagePlus,
  Loader,
  LogOut,
  Mail,
  Megaphone,
  MapPinned,
  MapPin,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Settings,
  Sparkles,
  Star,
  Clock3,
  TrendingUp,
  UserPlus,
  X,
  Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { performLogout } from '@/lib/clientLogout'
import { clearUserCache, getCache, getCacheKey, invalidateCache, setCache } from '@/lib/cache'
import { normalizeAnnouncementRecord } from '@/lib/announcementSchema'
import { getAuthorDisplayName, getAuthorRoleLabel } from '@/lib/userSocialDisplay'
import { buildRepostFeedItem } from '@/lib/repostIdentity'
import { isOwnOriginalPost } from '@/lib/postOwnership'
import SocialActionBar from '@/app/components/user/SocialActionBar'
import QuoteRepostCard from '@/app/components/user/QuoteRepostCard'
import PostActionMenu from '@/app/components/user/PostActionMenu'
import Comments from '@/app/components/user/Comments'
import DailyFeedback from '@/app/components/user/DailyFeedback'
import UserProfileLink from '@/app/components/user/UserProfileLink'
import UserTopHeader from '@/app/components/user/UserTopHeader'
import ConfirmationModal from '@/app/components/ConfirmationModal'
import { buildRecommendationProfile, rankFeedItems } from '@/lib/feedRecommendationEngine'
import { trackUserActivity } from '@/lib/trackActivity'
import PostMediaGallery from '@/app/components/user/PostMediaGallery'
import { getPostImages } from '@/lib/postMedia'

// Database table constants
const TABLES = {
  USERS: 'info_users',
  BLOGS: 'info_blogs',
  EVENTS: 'info_events',
  ANNOUNCEMENTS: 'info_announcements',
  FORUM_THREADS: 'forum_threads',
  CATEGORIES: 'system_categories',
  FEED_PREFERENCES: 'user_feed_preferences',
  ACTIVITY_LOG: 'user_activity_log',
}

const DASHBOARD_CACHE_TTL_MS = 120000
const HIDDEN_POSTS_KEY = 'daet_hidden_posts'
const NOT_INTERESTED_KEY = 'daet_not_interested_topics'

// Feed sort modes shown in the segmented control (desktop toolbar + mobile rail).
const FEED_SCOPES = [
  { value: 'for-you', label: 'For you', icon: Sparkles },
  { value: 'latest', label: 'Latest', icon: Clock3 },
  { value: 'trending', label: 'Trending', icon: Flame },
]

// Visual identity per content type: emoji for the badge, icon for quick actions.
const POST_TYPE_META = {
  blog: { emoji: '📝', label: 'Blog', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  event: { emoji: '🎉', label: 'Event', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  forum: { emoji: '💬', label: 'Forum', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  tourist_spot: { emoji: '📍', label: 'Tourist spot', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  announcement: { emoji: '📣', label: 'Announcement', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  post: { emoji: '✍️', label: 'Post', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
}

const getPostTypeMeta = (type) => POST_TYPE_META[type] || POST_TYPE_META.post

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

const getDashboardCacheKey = (userId) => getCacheKey('feed', 'user', userId, 'dashboard')

function getDashboardCache(userId) {
  return getCache(getDashboardCacheKey(userId))?.data || null
}

function setDashboardCache(userId, data) {
  setCache(getDashboardCacheKey(userId), data, DASHBOARD_CACHE_TTL_MS)
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
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [userName, setUserName] = useState('Traveler')
  const [userAvatarUrl, setUserAvatarUrl] = useState('')

  // Data state
  const [feed, setFeed] = useState([])
  const [stats, setStats] = useState({ blogs: 0, events: 0, announcements: 0 })
  const [announcements, setAnnouncements] = useState([])
  const [userSignals, setUserSignals] = useState({ activities: [], reactions: [], favorites: [], preferredCategories: [] })

  // UI state
  const [loading, setLoading] = useState(true)
  const [feedScope, setFeedScope] = useState('for-you')
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
  const [commentCounts, setCommentCounts] = useState({})
  const [hiddenPosts, setHiddenPosts] = useState(() => new Set())
  const [notInterestedTopics, setNotInterestedTopics] = useState(() => new Set())
  const [openPostMenu, setOpenPostMenu] = useState(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [blogActionConfirm, setBlogActionConfirm] = useState(null)
  const [followedSuggestions, setFollowedSuggestions] = useState(() => new Set())
  const [feedRefreshKey, setFeedRefreshKey] = useState(0)
  const [feedRefreshing, setFeedRefreshing] = useState(false)
  const [feedNow, setFeedNow] = useState(() => Date.now())
  const [feedVisibleCount, setFeedVisibleCount] = useState(10)
  const [feedEndReached, setFeedEndReached] = useState(false)
  const [newRepostIds, setNewRepostIds] = useState(() => new Set())
  const [pendingRepostId, setPendingRepostId] = useState(null)
  const [expandedPosts, setExpandedPosts] = useState(() => new Set())
  const [activeCommentsSheet, setActiveCommentsSheet] = useState(null)
  const [sheetVisible, setSheetVisible] = useState(false)
  const [notificationCommentRequest, setNotificationCommentRequest] = useState(null)
  const [pullDistance, setPullDistance] = useState(0)
  const sheetTouchStartY = useRef(null)
  const pullStartY = useRef(null)

  useEffect(() => {
    if (!userId) return undefined

    let active = true
    const loadUnreadAlerts = async () => {
      try {
        const response = await fetch('/api/notifications', { credentials: 'same-origin', cache: 'no-store' })
        const result = response.ok ? await response.json() : null
        if (active && result?.success) setUnreadAlerts(Number(result.unread_count) || 0)
      } catch {
        // The bell remains available if the unread count cannot be loaded.
      }
    }

    loadUnreadAlerts()
    const notificationChannel = supabase?.channel?.(`dashboard-notifications-${userId}`)
    notificationChannel
      ?.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'info_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => setUnreadAlerts((count) => count + 1))
      ?.subscribe()
    const updateUnreadAlerts = (event) => {
      const count = Number(event?.detail?.unreadCount)
      if (Number.isFinite(count)) setUnreadAlerts(count)
      else void loadUnreadAlerts()
    }
    window.addEventListener('daet-notifications-updated', updateUnreadAlerts)
    return () => {
      active = false
      window.removeEventListener('daet-notifications-updated', updateUnreadAlerts)
      if (notificationChannel) supabase.removeChannel(notificationChannel)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined

    // The acting user is the reposter. The API response carries their profile,
    // and this local fallback covers the window before it is available.
    const reposterAuthor = {
      id: userId,
      full_name: userName || 'You',
      profile_image_url: userAvatarUrl || null,
    }

    const handleRepostChange = (event) => {
      const detail = event.detail || {}
      if (detail.userId !== userId) return

      if (detail.action === 'removed') {
        setFeed((previous) => previous.filter((item) => !(item.is_repost && item.original_post_id === detail.contentId && item.reposted_by === userId)))
        invalidateCache(getDashboardCacheKey(userId))
        return
      }

      const activeAuthor = detail.reposter || reposterAuthor

      if (detail.action === 'restored' && detail.repost?.repost_id) {
        const restored = detail.repost
        const original = restored.original_post || {}
        const restoredItem = {
          ...original,
          id: restored.repost_id,
          original_post_id: restored.original_content_id,
          original_content_id: restored.original_content_id,
          original_content_type: restored.original_content_type || 'user_post',
          repost_id: restored.repost_id,
          reposted_by: restored.reposted_by || restored.user_id,
          repost_quote: restored.repost_quote || restored.quote_text,
          created_by: restored.reposted_by || restored.user_id,
          created_at: restored.created_at,
          reposted_at: restored.created_at,
          published_at: restored.created_at,
          category: 'Repost',
          type: restored.original_content_type === 'blog' ? 'blog' : 'post',
          href: restored.original_content_type === 'blog' ? `/user/blogs/${restored.original_content_id}` : `/user/posts/${restored.original_content_id}`,
          is_repost: true,
          author: activeAuthor,
          original_author: restored.original_author || original.author || null,
          original_post: { ...original, author: restored.original_author || original.author || null },
        }
        setFeed((previous) => [restoredItem, ...previous.filter((item) => item.repost_id !== restoredItem.repost_id)])
        setFeedVisibleCount((previous) => Math.max(previous, 10))
        invalidateCache(getDashboardCacheKey(userId))
        return
      }

      const repostItem = buildRepostFeedItem({
        repost: detail.repost,
        original: detail.original,
        reposter: detail.reposter || reposterAuthor,
      })
      if (!repostItem) return
      setFeed((previous) => [repostItem, ...previous.filter((item) => item.repost_id !== repostItem.repost_id)])
      setNewRepostIds((previous) => new Set(previous).add(repostItem.id))
      setFeedVisibleCount((previous) => Math.max(previous, 10))
      setPendingRepostId(repostItem.repost_id)
      invalidateCache(getDashboardCacheKey(userId))
    }

    window.addEventListener('daet-repost-created', handleRepostChange)
    return () => window.removeEventListener('daet-repost-created', handleRepostChange)
  }, [userId, userName, userAvatarUrl])

  useEffect(() => {
    if (!pendingRepostId) return undefined

    const frame = window.requestAnimationFrame(() => {
      const repostElement = document.querySelector(`[data-repost-id="${pendingRepostId}"]`)
      if (!repostElement) return
      repostElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      repostElement.classList.add('ring-2', 'ring-emerald-400', 'ring-offset-2')
      window.setTimeout(() => repostElement.classList.remove('ring-2', 'ring-emerald-400', 'ring-offset-2'), 2200)
      setPendingRepostId(null)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [feed, pendingRepostId])

  useEffect(() => {
    const handleFeedRefresh = () => {
      setFeedNow(Date.now())
      setFeedRefreshing(true)
      setFeedRefreshKey((value) => value + 1)
    }
    window.addEventListener('daet-feed-refresh', handleFeedRefresh)
    return () => window.removeEventListener('daet-feed-refresh', handleFeedRefresh)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('openComments') !== '1') return
    const timer = window.setTimeout(() => {
      setNotificationCommentRequest({
        contentType: params.get('contentType') || '',
        contentId: params.get('contentId') || '',
        commentId: params.get('commentId') || null,
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const authorIds = [...new Set(
      feed
        .filter((item) => item.created_by && (!item.author || item.author.full_name === 'Administrator'))
        .map((item) => item.created_by)
    )]
    if (!authorIds.length) return undefined

    let active = true
    const hydrateAuthors = async () => {
      const profiles = await Promise.all(authorIds.map(async (authorId) => {
        try {
          const response = await fetch(`/api/users/${encodeURIComponent(authorId)}`, { credentials: 'same-origin' })
          const result = await response.json()
          return response.ok && result.success ? result.profile : null
        } catch {
          return null
        }
      }))
      if (!active) return
      const authorMap = new Map(profiles.filter(Boolean).map((profile) => [profile.id, profile]))
      if (!authorMap.size) return
      setFeed((currentFeed) => {
        let changed = false
        const nextFeed = currentFeed.map((item) => {
          const author = item.created_by ? authorMap.get(item.created_by) : null
          if (!author) return item
          const nextAuthor = { ...author, user_type: author.user_type || 'admin' }
          if (item.author?.id === nextAuthor.id && item.author?.full_name === nextAuthor.full_name && item.author?.profile_image_url === nextAuthor.profile_image_url) return item
          changed = true
          return { ...item, author: nextAuthor }
        })
        return changed ? nextFeed : currentFeed
      })
    }
    void hydrateAuthors()
    return () => { active = false }
  }, [feed])

  useEffect(() => {
    if (!userId) return
    startTransition(() => {
      setHiddenPosts(readStoredSet(`${HIDDEN_POSTS_KEY}_${userId}`))
      setNotInterestedTopics(readStoredSet(`${NOT_INTERESTED_KEY}_${userId}`))
    })
  }, [userId])

  useEffect(() => {
    if (!userId) return

    let isMounted = true
    const loadFollowedPeople = async () => {
      try {
        const response = await fetch('/api/users/following', { credentials: 'same-origin' })
        const result = await response.json()
        if (!isMounted || !response.ok || !result.success) return
        setFollowedSuggestions(new Set(result.following_ids || []))
      } catch (error) {
        if (isMounted) console.error('Followed people load failed:', error)
      }
    }

    void loadFollowedPeople()
    return () => {
      isMounted = false
    }
  }, [userId])

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

  const handleReact = async (e, item, reactionType) => {
    e.preventDefault()
    e.stopPropagation()
    if (!userId) return
    const itemKey = `${item.type}-${item.id}`
    const current = reactions[itemKey]
    const nextReactions = { ...reactions }
    const contentType = item.type === 'forum' ? 'forum_thread' : item.type === 'post' ? 'user_post' : item.type

    try {
      const result = current === reactionType
        ? await supabase.from('content_reactions').delete().eq('user_id', userId).eq('content_type', contentType).eq('content_id', item.id)
        : await supabase.from('content_reactions').upsert({ user_id: userId, content_type: contentType, content_id: item.id, reaction_type: reactionType }, { onConflict: 'user_id,content_type,content_id' })
      if (result.error) throw result.error

      if (current === reactionType) {
        delete nextReactions[itemKey]
        setToastMessage('Reaction removed')
      } else {
        nextReactions[itemKey] = reactionType
        const labels = { like: 'Thanks for the like!', love: 'Spread the love!', wow: 'Glad for the reaction!' }
        setToastMessage(labels[reactionType] || 'Thanks for the reaction!')
      }
      setReactions(nextReactions)
      invalidateCache(getDashboardCacheKey(userId))
    } catch (error) {
      console.error('Reaction update failed:', error)
      setToastMessage('Unable to update reaction')
    }

    setShowReactions(null)
    setTimeout(() => setToastMessage(''), 2500)

    // Award points for engagement - async fire-and-forget
    if (userId) {
      void trackUserActivity({
        userId,
        activityType: 'react_content',
        entityType: item.type,
        entityId: item.id,
        description: `${reactionType} on ${item.type}`,
        metadata: {
          contentType: item.type,
          reactionType,
          source: 'dashboard',
        },
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
      invalidateCache(getDashboardCacheKey(userId))
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

  const suggestions = useMemo(() => {
    const availableFeed = feed.filter((item) => item.author?.id && item.author.id !== userId && !followedSuggestions.has(item.author.id))
    const suggestedPeople = [...new Map(availableFeed.map((item) => [item.author.id, item.author])).values()].slice(0, 3)
    const suggestedLocations = [...new Set(feed.map((item) => item.location).filter(Boolean))].slice(0, 4)
    const suggestedContent = feed.filter((item) => item.type === 'blog' || item.type === 'forum').slice(0, 2)
    return {
      suggestedPost: availableFeed[0] || feed[0] || null,
      suggestedPeople,
      suggestedContent,
      suggestedLocations,
    }
  }, [feed, userId, followedSuggestions])

  const followSuggestedPerson = async (personId) => {
    if (!userId) return
    try {
      const response = await fetch(`/api/users/${personId}/follow`, { method: 'POST', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to follow this person right now')
      setFollowedSuggestions((previous) => new Set([...previous, personId]))
      invalidateCache(getDashboardCacheKey(userId))
    } catch (followError) {
      console.error('Suggested follow failed:', followError?.message || followError)
      setToastMessage(followError?.message || 'Unable to follow this person right now')
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

  const updateOwnRepostPrivacy = async (item, visibility) => {
    if (!item?.repost_id || item.reposted_by !== userId) return
    const response = await fetch(`/api/reposts/${item.repost_id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update repost privacy.')
    setFeed((previous) => previous.map((feedItem) => feedItem.repost_id === item.repost_id ? { ...feedItem, visibility } : feedItem))
    invalidateCache(getDashboardCacheKey(userId))
    setToastMessage('Repost privacy updated.')
    setTimeout(() => setToastMessage(''), 2500)
  }

  const updateOwnRepost = async (item, action) => {
    if (!item?.repost_id || item.reposted_by !== userId) return
    const isDelete = action === 'delete'
    try {
      const response = await fetch(`/api/reposts/${item.repost_id}`, {
        method: isDelete ? 'DELETE' : 'PATCH',
        credentials: 'same-origin',
        headers: isDelete ? undefined : { 'Content-Type': 'application/json' },
        body: isDelete ? undefined : JSON.stringify({ status: 'archived' }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update repost.')
      setFeed((previous) => previous.filter((feedItem) => feedItem.repost_id !== item.repost_id))
      setNewRepostIds((previous) => {
        const next = new Set(previous)
        next.delete(item.id)
        return next
      })
      invalidateCache(getDashboardCacheKey(userId))
      window.dispatchEvent(new CustomEvent('daet-repost-visibility-changed', { detail: { action, repost: item } }))
      setToastMessage(isDelete ? 'Repost deleted.' : 'Repost archived. You can restore it from Archive.')
      setTimeout(() => setToastMessage(''), 2500)
    } catch (actionError) {
      console.error('Repost action failed:', actionError)
      setToastMessage(actionError.message || 'Unable to update repost.')
      setTimeout(() => setToastMessage(''), 2500)
    }
  }

  const editOwnRepost = async (item, quoteText) => {
    if (!item?.repost_id || item.reposted_by !== userId) return

    try {
      const response = await fetch(`/api/reposts/${item.repost_id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteText: quoteText.trim() || null }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to edit repost.')
      setFeed((previous) => previous.map((feedItem) => feedItem.repost_id === item.repost_id
        ? { ...feedItem, repost_quote: quoteText.trim() || null }
        : feedItem))
      invalidateCache(getDashboardCacheKey(userId))
      setToastMessage('Repost updated.')
      setTimeout(() => setToastMessage(''), 2500)
    } catch (actionError) {
      setToastMessage(actionError.message || 'Unable to edit repost.')
      setTimeout(() => setToastMessage(''), 2500)
    }
  }

  const updateOwnPost = async (item, action) => {
    if (item?.type !== 'post' || item?.is_repost || item.user_id !== userId) return
    const isDelete = action === 'delete'
    if (!window.confirm(isDelete ? 'Delete post?\n\nThis will permanently remove your post and its repost relationships.' : 'Archive post?\n\nThis will hide your post until you restore it.')) return
    try {
      const response = await fetch(`/api/posts/${item.id}`, {
        method: isDelete ? 'DELETE' : 'PATCH',
        credentials: 'same-origin',
        headers: isDelete ? undefined : { 'Content-Type': 'application/json' },
        body: isDelete ? undefined : JSON.stringify({ status: 'archived' }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update post.')
      setFeed((previous) => previous.filter((feedItem) => feedItem.id !== item.id && feedItem.original_post_id !== item.id))
      invalidateCache(getDashboardCacheKey(userId))
      setToastMessage(isDelete ? 'Post deleted.' : 'Post archived.')
      setTimeout(() => setToastMessage(''), 2500)
    } catch (actionError) {
      setToastMessage(actionError.message || 'Unable to update post.')
      setTimeout(() => setToastMessage(''), 2500)
    }
  }

  const updateOwnBlog = async (item, action) => {
    if (item?.type !== 'blog' || item?.is_repost || item.created_by !== userId) return
    const isDelete = action === 'delete'

    try {
      const response = await fetch(`/api/user/blogs/${item.id}`, {
        method: isDelete ? 'DELETE' : 'PATCH',
        credentials: 'same-origin',
        headers: isDelete ? undefined : { 'Content-Type': 'application/json' },
        body: isDelete ? undefined : JSON.stringify({ status: 'archived' }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update blog.')
      setFeed((previous) => previous.filter((feedItem) => feedItem.id !== item.id))
      setOpenPostMenu(null)
      invalidateCache(getDashboardCacheKey(userId))
      setToastMessage(isDelete ? 'Blog deleted.' : 'Blog archived.')
      setTimeout(() => setToastMessage(''), 2500)
    } catch (actionError) {
      setToastMessage(actionError.message || 'Unable to update blog.')
      setTimeout(() => setToastMessage(''), 2500)
    }
  }

  const requestBlogAction = (item, action) => {
    if (item?.type !== 'blog' || item?.is_repost || item.created_by !== userId) return
    setOpenPostMenu(null)
    setBlogActionConfirm({ item, action })
  }

  const confirmBlogAction = async () => {
    const pendingAction = blogActionConfirm
    setBlogActionConfirm(null)
    if (pendingAction) await updateOwnBlog(pendingAction.item, pendingAction.action)
  }

  const editOwnBlog = (item) => {
    if (item?.type !== 'blog' || item?.is_repost || item.created_by !== userId) return
    router.push(`/user/blogs/${item.id}/edit`)
    setOpenPostMenu(null)
  }

  const editOwnPost = async (item) => {
    if (item?.type !== 'post' || item?.is_repost || item.user_id !== userId) return
    const title = window.prompt('Edit post title:', item.title || '')
    if (title === null) return
    const content = window.prompt('Edit post content:', item.content || '')
    if (content === null) return
    try {
      const response = await fetch(`/api/posts/${item.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to edit post.')
      setFeed((previous) => previous.map((feedItem) => feedItem.id === item.id ? { ...feedItem, title, content, excerpt: content } : feedItem))
      setOpenPostMenu(null)
      invalidateCache(getDashboardCacheKey(userId))
      setToastMessage('Post updated.')
      setTimeout(() => setToastMessage(''), 2500)
    } catch (actionError) {
      setToastMessage(actionError.message || 'Unable to edit post.')
      setTimeout(() => setToastMessage(''), 2500)
    }
  }

  const updateOwnPostPrivacy = async (item, visibility) => {
    if (item?.type !== 'post' || item?.is_repost || item.user_id !== userId) return
    const response = await fetch(`/api/posts/${item.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update post privacy.')
    setFeed((previous) => previous.map((feedItem) => feedItem.id === item.id ? { ...feedItem, visibility } : feedItem))
    invalidateCache(getDashboardCacheKey(userId))
    setToastMessage('Post privacy updated.')
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

        if (sessionError) throw sessionError

        let activeSession = session

        if (!activeSession?.user) {
          const cookieUserId = cookieSession?.user_id || cookieSession?.id || cookieSession?.sub || cookieSession?.userId
          try {
            const { data: userData, error: userError } = await supabase.auth.getUser()
            if (!userError && userData?.user) {
              activeSession = { user: userData.user }
            } else if (userError && userError.name === 'AuthSessionMissingError' && cookieUserId) {
              activeSession = {
                user: {
                  id: cookieUserId,
                  email: cookieSession?.user_email || cookieSession?.email || '',
                  user_metadata: {
                    full_name: cookieSession?.user_name || cookieSession?.full_name || cookieSession?.name || '',
                  },
                },
              }
            } else if (userError) {
              throw userError
            }
          } catch (recoveryError) {
            if (recoveryError?.name === 'AuthSessionMissingError' && cookieUserId) {
              activeSession = {
                user: {
                  id: cookieUserId,
                  email: cookieSession?.user_email || cookieSession?.email || '',
                  user_metadata: {
                    full_name: cookieSession?.user_name || cookieSession?.full_name || cookieSession?.name || '',
                  },
                },
              }
            } else {
              throw recoveryError
            }
          }
        }

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

        const { data: currentUserProfile } = await supabase
          .from(TABLES.USERS)
          .select('full_name, profile_image_url')
          .eq('id', sessionUserId)
          .maybeSingle()
        setUserName(currentUserProfile?.full_name?.trim() || sessionUserName)
        setUserAvatarUrl(currentUserProfile?.profile_image_url || activeSession.user.user_metadata?.avatar_url || '')

        // Track page visit via the server route so RLS is handled safely.
        void trackUserActivity({
          userId: sessionUserId,
          activityType: 'visit_dashboard',
          entityType: 'dashboard',
          entityId: null,
          description: 'Viewed dashboard',
          metadata: { source: 'dashboard' },
        })
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
        const [blogStats, eventStats, announcementStats] = await Promise.all([
          supabase.from(TABLES.BLOGS).select('id', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from(TABLES.EVENTS).select('id', { count: 'exact', head: true }).eq('status', 'published'),
          supabase.from(TABLES.ANNOUNCEMENTS).select('id', { count: 'exact', head: true }).eq('status', 'published'),
        ])

        if (blogStats.error || eventStats.error || announcementStats.error) {
          throw new Error('Failed to load statistics')
        }

        const nextStats = {
          blogs: blogStats.count || 0,
          events: eventStats.count || 0,
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
          setReactions(Object.fromEntries((reactionResult.data || []).map((reaction) => [
            `${reaction.content_type === 'forum_thread' ? 'forum' : reaction.content_type === 'user_post' ? 'post' : reaction.content_type}-${reaction.content_id}`,
            reaction.reaction_type,
          ])))
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
            const contentType = item.type === 'forum'
              ? 'forum_thread'
              : item.type === 'blog'
                ? 'blog'
                : item.type === 'post'
                  ? 'user_post'
                  : item.type === 'announcement'
                    ? 'announcement'
                    : item.type === 'tourist_spot'
                      ? 'tourist_spot'
                      : 'event'
            // Reposts count comments against the original content, using the
            // same ids the cards pass to the comments sheet and share counts.
            const contentId = item.is_repost
              ? (item.original_post_id || item.original_post?.id || item.id)
              : item.id
            const { count } = await supabase
              .from('content_comments')
              .select('id', { count: 'exact', head: true })
              .eq('content_type', contentType)
              .eq('content_id', contentId)
            counts[`${item.type}-${contentId}`] = count || 0
          })
        )
        if (isMounted) setCommentCounts(counts)
      }

      try {
        const cachedDashboard = getDashboardCache(userId)
        if (cachedDashboard && feedRefreshKey === 0) {
          if (!isMounted) return
          setAnnouncements(cachedDashboard.announcements || [])
          setStats(cachedDashboard.stats || { blogs: 0, events: 0, announcements: 0 })
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
              .select('id, title, excerpt, category, tags, featured_image, images, videos, media_layout, published_at, updated_at, views, likes, comments_count, created_by')
              .eq('status', 'published')
              .order('published_at', { ascending: false })
              .limit(20),
            supabase
              .from(TABLES.EVENTS)
              .select('id, title, description, category, start_date, end_date, start_time, end_time, location, venue, latitude, longitude, is_free, ticket_price, current_attendees, featured_image, images, videos, organizer, published_at, updated_at, created_by, status')
              .eq('status', 'published')
              .order('start_date', { ascending: true })
              .limit(20),
            supabase
              .from(TABLES.FORUM_THREADS)
              .select('id, title, content, category_id, reply_count, last_activity_at, created_at, updated_at, created_by, status')
              .eq('status', 'active')
              .order('last_activity_at', { ascending: false })
              .limit(20),
            supabase
              .from('info_tourist_spots')
              .select('id, name, description, category, location, rating, entry_fee, opening_hours, best_visit_time, featured_image, images, videos, created_by, status, created_at')
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(20),
            fetch('/api/users/following', { credentials: 'same-origin' }).then(async (response) => {
              const result = await response.json()
              if (!response.ok || !result.success) return { data: [], error: null }
              return { data: (result.following_ids || []).map((followingId) => ({ following_id: followingId })), error: null }
            }).catch((followingError) => {
              console.error('Dashboard following list unavailable:', followingError)
              return { data: [], error: null }
            }),
            supabase
              .from('info_user_posts')
              .select('id, user_id, title, content, created_at, updated_at, status, visibility')
              .eq('status', 'published')
              .order('created_at', { ascending: false })
              .limit(50),
          ]),
        ])

        if (categoriesResult.error) throw categoriesResult.error
        if (announcementsResult.error) throw announcementsResult.error

        const [blogsFeed, eventsFeed, threadsFeed, touristSpotsFeed, followsFeed, userPostsFeed] = feedResult
        if (blogsFeed.error || eventsFeed.error || threadsFeed.error || touristSpotsFeed.error) {
          throw new Error('Failed to load feed content')
        }

        const followedUserIds = new Set([
          userId,
          ...(followsFeed.data || []).map((row) => row.following_id).filter(Boolean),
        ])
        const followedPosts = (userPostsFeed.data || [])
          .filter((post) => followedUserIds.has(post.user_id) && (post.visibility !== 'private' || post.user_id === userId))
          .map((post) => ({
            ...post,
            created_by: post.user_id,
            excerpt: post.content,
            published_at: post.created_at,
            category: 'Community',
          }))
        const followedUserIdsArray = [...followedUserIds].filter(Boolean)
        const { data: followedReposts } = followedUserIdsArray.length
          ? await supabase
            .from('reposts')
            .select('id, user_id, original_content_type, original_content_id, quote_text, created_at, status, visibility')
            .in('user_id', followedUserIdsArray)
            .in('original_content_type', ['user_post', 'blog'])
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(50)
          : { data: [] }
        const repostedPostIds = [...new Set((followedReposts || []).filter((repost) => repost.original_content_type === 'user_post').map((repost) => repost.original_content_id).filter(Boolean))]
        const { data: repostedPosts } = repostedPostIds.length
          ? await supabase
            .from('info_user_posts')
            .select('id, user_id, title, content, created_at, updated_at, status, visibility')
            .in('id', repostedPostIds)
            .eq('status', 'published')
          : { data: [] }
        const repostedPostMap = new Map((repostedPosts || []).map((post) => [post.id, post]))
        const repostedBlogIds = [...new Set((followedReposts || []).filter((repost) => repost.original_content_type === 'blog').map((repost) => repost.original_content_id).filter(Boolean))]
        const { data: repostedBlogs } = repostedBlogIds.length
          ? await supabase
            .from('info_blogs')
            .select('id, created_by, title, excerpt, content, featured_image, images, videos, media_layout, published_at, created_at, status')
            .in('id', repostedBlogIds)
            .eq('status', 'published')
          : { data: [] }
        const repostedBlogMap = new Map((repostedBlogs || []).map((blog) => [blog.id, blog]))
        const repostFeed = (followedReposts || [])
          .map((repost) => {
            if (repost.visibility === 'private' && repost.user_id !== userId) return null
            const originalPost = repost.original_content_type === 'blog'
              ? repostedBlogMap.get(repost.original_content_id)
              : repostedPostMap.get(repost.original_content_id)
            if (!originalPost) return null
            const originalOwnerId = originalPost.user_id || originalPost.created_by
            if (originalPost.visibility === 'private' && originalOwnerId !== userId) return null
            if (originalPost.visibility === 'followers' && !followedUserIds.has(originalOwnerId)) return null
            return {
              ...originalPost,
              id: repost.id,
              original_post_id: originalPost.id,
              original_content_id: originalPost.id,
              original_content_type: repost.original_content_type,
              repost_id: repost.id,
              reposted_by: repost.user_id,
              reposted_at: repost.created_at,
              repost_quote: repost.quote_text,
              visibility: repost.visibility || 'public',
              created_by: repost.user_id,
              created_at: repost.created_at,
              published_at: repost.created_at,
              excerpt: originalPost.content,
              category: 'Repost',
              type: repost.original_content_type === 'blog' ? 'blog' : 'post',
              href: repost.original_content_type === 'blog' ? `/user/blogs/${originalPost.id}` : `/user/posts/${originalPost.id}`,
              is_repost: true,
              original_author_id: originalPost.user_id || originalPost.created_by,
              original_post: originalPost,
            }
          })
          .filter(Boolean)

        const touristSpotPosts = (touristSpotsFeed.data || []).map((spot) => ({
          ...spot,
          id: spot.id,
          title: spot.name,
          excerpt: spot.description,
          description: spot.description,
          content: spot.description,
          published_at: spot.created_at,
          category: spot.category,
          location: spot.location,
          rating: spot.rating,
          entrance_fee: spot.entry_fee,
          opening_hours: spot.opening_hours,
          best_time_to_visit: spot.best_visit_time,
          featured_image: spot.featured_image,
          images: Array.isArray(spot.images) && spot.images.length > 0 ? spot.images : (spot.featured_image ? [spot.featured_image] : []),
          gallery_images: Array.isArray(spot.images) && spot.images.length > 0 ? spot.images : (spot.featured_image ? [spot.featured_image] : []),
        }))

        const nextAnnouncements = (announcementsResult.data || []).map(normalizeAnnouncementRecord)
        const authorIds = [
          ...(blogsFeed.data || []).map((item) => item.created_by),
          ...(eventsFeed.data || []).map((item) => item.created_by),
          ...(threadsFeed.data || []).map((item) => item.created_by),
          ...(touristSpotPosts || []).map((item) => item.created_by),
          ...followedPosts.map((item) => item.created_by),
          ...repostFeed.map((item) => item.created_by),
          ...(repostedPosts || []).map((item) => item.user_id),
          ...(repostedBlogs || []).map((item) => item.created_by),
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
          ...(touristSpotPosts || []).map((spot) => ({
            ...withAuthor(spot),
            type: 'tourist_spot',
            href: `/tourist-spots/${spot.id}`,
            title: spot.name,
            description: spot.description,
            content: spot.description,
            location: spot.location,
            rating: spot.rating,
            entrance_fee: spot.entry_fee,
            opening_hours: spot.opening_hours,
            best_time_to_visit: spot.best_visit_time,
            gallery_images: Array.isArray(spot.images) && spot.images.length > 0 ? spot.images : (spot.featured_image ? [spot.featured_image] : []),
          })),
          ...followedPosts.map((post) => ({
            ...withAuthor(post),
            type: 'post',
            href: `/user/profile/${post.user_id}`,
          })),
          ...repostFeed.map((repost) => ({
            ...withAuthor(repost),
            type: repost.type,
            href: repost.href,
            is_repost: true,
            original_author: authorMap.get(repost.original_author_id) || null,
            original_post: { ...repost.original_post, author: authorMap.get(repost.original_author_id) || null },
          })),
          ...(nextAnnouncements || []).map((announcement) => ({
            ...withAuthor(announcement),
            author: authorMap.get(announcement.created_by) || {
              id: announcement.created_by,
              full_name: 'Administrator',
              user_type: 'admin',
            },
            type: 'announcement',
            href: `/user/announcements/${announcement.id}`,
          })),
        ].sort((a, b) => new Date(b.published_at || b.last_activity_at || 0) - new Date(a.published_at || a.last_activity_at || 0))

        const nextDashboardData = {
          announcements: nextAnnouncements,
          stats: { blogs: 0, events: 0, announcements: nextAnnouncements.length },
          feed: mixedFeed,
        }

        setDashboardCache(userId, nextDashboardData)

        if (!isMounted) return

        setAnnouncements(nextAnnouncements)
        setStats(nextDashboardData.stats)
        setFeed(mixedFeed)
        setLoading(false)
        setFeedRefreshing(false)

        void loadDashboardStats(userId)
        void fetchCommentCounts(mixedFeed)
      } catch (err) {
        if (!isMounted) return
        console.error('Dashboard load error:', err)
        setError(err.message || 'Failed to load dashboard')
        setFeedRefreshing(false)
      } finally {
        if (isMounted && !error) {
          setLoading(false)
          setFeedRefreshing(false)
        }
        if (isMounted) setLoading(false)
      }
    }

    loadDashboard()

    return () => {
      isMounted = false
    }
  }, [authenticated, userId, feedRefreshKey])

  const handleLogout = () => {
    setShowLogoutConfirm(true)
  }

  const confirmLogout = async () => {
    setLoggingOut(true)
    try {
      clearUserCache(userId)
      await performLogout()
    } catch (err) {
      console.error('User logout error:', err)
    } finally {
      window.location.assign('/login')
    }
  }

  const resetPullToRefresh = () => {
    pullStartY.current = null
    setPullDistance(0)
  }

  const handleDashboardTouchStart = (event) => {
    if (feedRefreshing || window.scrollY > 0) return
    pullStartY.current = event.touches?.[0]?.clientY ?? null
  }

  const handleDashboardTouchMove = (event) => {
    if (pullStartY.current === null || feedRefreshing) return

    const clientY = event.touches?.[0]?.clientY
    if (clientY === undefined || clientY < pullStartY.current) return

    const delta = clientY - pullStartY.current
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.72, 120))
    }
  }

  const handleDashboardTouchEnd = () => {
    if (pullDistance >= 72) {
      window.dispatchEvent(new Event('daet-feed-refresh'))
    }
    resetPullToRefresh()
  }

  const filteredFeed = useMemo(() => {
    let result = feed.filter((item) => {
      if (hiddenPosts.has(`${item.type}-${item.id}`)) return false
      if (item.author?.id && notInterestedTopics.has(`author:${item.author.id}`)) return false
      if (item.category && notInterestedTopics.has(`category:${String(item.category).toLowerCase()}`)) return false
      return true
    })

    if (feedScope === 'latest') {
      result = [...result].sort((left, right) => new Date(right.published_at || right.created_at || right.start_date || 0) - new Date(left.published_at || left.created_at || left.start_date || 0))
      return result
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

    const recommendationProfile = buildRecommendationProfile({
      activities: userSignals.activities,
      reactions: userSignals.reactions,
      favorites: userSignals.favorites,
      preferredCategories: userSignals.preferredCategories,
      follows: [],
      profile: {
        contentTypes: Object.fromEntries([...typeWeights.entries()].map(([key, value]) => [key, value / 10])),
        categories: Object.fromEntries([...categoryWeights.entries()].map(([key, value]) => [key, value / 10])),
        authors: {},
        destinations: {},
        topics: Object.fromEntries([...categoryWeights.entries()].map(([key, value]) => [key, value / 12])),
        interactions: Object.fromEntries([...interactedIds].map((key) => [key, 0.6])),
      },
    })

    let rankedResult
    if (feedScope === 'trending') {
      rankedResult = result.sort((left, right) => (Number(right.likes || 0) + Number(right.comments_count || right.reply_count || 0)) - (Number(left.likes || 0) + Number(left.comments_count || left.reply_count || 0)))
    } else {
      rankedResult = rankFeedItems({
        items: result,
        profile: recommendationProfile,
        userFollows: new Set(),
        now: feedNow,
        coldStart: result.length > 0 && Object.keys(recommendationProfile.categories || {}).length === 0,
      }).sort((left, right) => {
        const lhs = left.recommendationScore ?? 0
        const rhs = right.recommendationScore ?? 0
        return rhs - lhs
      }).map(({ recommendationScore, recommendationKey, contributionBreakdown, ...item }) => item)
    }

    if (feedRefreshKey === 0 || rankedResult.length < 2) return rankedResult

    const rotation = (feedRefreshKey * Math.max(1, Math.ceil(rankedResult.length / 3))) % rankedResult.length
    return [...rankedResult.slice(rotation), ...rankedResult.slice(0, rotation)]
  }, [feed, feedScope, userSignals, hiddenPosts, notInterestedTopics, feedRefreshKey, feedNow, newRepostIds])

  const openCommentsSheet = (sheetData) => {
    setActiveCommentsSheet(sheetData)
    setSheetVisible(false)
    window.dispatchEvent(new CustomEvent('daet-comments-sheet-state', { detail: { open: true } }))
    window.requestAnimationFrame(() => setSheetVisible(true))
  }

  const closeCommentsSheet = () => {
    setSheetVisible(false)
    window.setTimeout(() => {
      setActiveCommentsSheet(null)
      window.dispatchEvent(new CustomEvent('daet-comments-sheet-state', { detail: { open: false } }))
    }, 280)
  }

  useEffect(() => {
    if (!activeCommentsSheet) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [activeCommentsSheet])

  useEffect(() => {
    if (!notificationCommentRequest || loading) return
    const requestedItem = feed.find((item) => {
      const itemContentType = item.type === 'forum' ? 'forum_thread' : item.type === 'blog' ? 'blog' : item.type === 'post' ? 'user_post' : item.type
      return item.id === notificationCommentRequest.contentId && itemContentType === notificationCommentRequest.contentType
    })
    if (!requestedItem) return

    const author = requestedItem.author || {}
    const timer = window.setTimeout(() => {
      openCommentsSheet({
        contentType: notificationCommentRequest.contentType,
        contentId: requestedItem.id,
        userId,
        contentOwnerId: requestedItem.created_by || author.id || userId,
        contentTitle: requestedItem.title,
        commentId: notificationCommentRequest.commentId,
      })
      setNotificationCommentRequest(null)
      router.replace('/user/dashboard', { scroll: false })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [feed, loading, notificationCommentRequest, router, userId])

  const toggleExpandedPost = (itemKey) => {
    setExpandedPosts((current) => {
      const next = new Set(current)
      if (next.has(itemKey)) {
        next.delete(itemKey)
      } else {
        next.add(itemKey)
      }
      return next
    })
  }

  const visibleFeed = filteredFeed.slice(0, feedVisibleCount)
  const hasMoreFeed = feedVisibleCount < filteredFeed.length

  // Time-aware greeting. This only runs on the client (the page renders the
  // auth loader until the session resolves), so there is no hydration drift.
  const currentHour = new Date().getHours()
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = String(userName || 'Traveler').trim().split(/\s+/)[0] || 'Traveler'
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const statTiles = [
    { key: 'blogs', label: 'Blogs', value: stats.blogs, icon: PenLine, href: '/user/blogs' },
    { key: 'events', label: 'Events', value: stats.events, icon: CalendarDays, href: '/user/events' },
    { key: 'announcements', label: 'Notices', value: stats.announcements, icon: Megaphone, href: '/user/announcements' },
  ]

  const quickActions = [
    { href: '/user/blogs/new', label: 'Write a story', icon: PenLine, tone: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
    { href: '/user/blogs/new?share=media', label: 'Photo or video', icon: ImagePlus, tone: 'bg-sky-50 text-sky-700 hover:bg-sky-100' },
    { href: '/user/events', label: 'Events', icon: CalendarDays, tone: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
    { href: '/user/rewards', label: 'Rewards', icon: Gift, tone: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  ]

  useEffect(() => {
    const handleDocumentScroll = () => {
      if (window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 180) return

      if (hasMoreFeed) {
        setFeedVisibleCount((count) => Math.min(count + 10, filteredFeed.length))
      } else if (filteredFeed.length > 0) {
        setFeedEndReached(true)
      }
    }

    window.addEventListener('scroll', handleDocumentScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleDocumentScroll)
  }, [filteredFeed.length, hasMoreFeed])

  if (!authenticated) {
    return (
      <main className="tourism-shell flex min-h-screen items-center justify-center px-4">
        <div className="usr-enter w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="usr-ring-pulse mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-700">
            <Loader className="h-5 w-5 animate-spin" aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm font-bold text-slate-800">Preparing your feed</p>
          <p className="mt-1 text-xs text-slate-500">Verifying your session…</p>
          <div className="mt-5 space-y-2">
            <div className="usr-skeleton h-3 w-full rounded-full" />
            <div className="usr-skeleton h-3 w-4/5 rounded-full" />
          </div>
        </div>
      </main>
    )
  }

  if (authError) {
    return (
      <main className="tourism-shell flex min-h-screen items-center justify-center px-4">
        <div className="usr-enter w-full max-w-md rounded-[24px] border border-red-200 bg-red-50 p-8 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-red-600">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm font-bold text-red-800">{authError}</p>
          <Link href="/login" className="usr-press mt-4 inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700">
            Go to sign in
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="tourism-shell dashboard-shell relative min-h-screen w-full overflow-x-clip overscroll-y-contain" onTouchStart={handleDashboardTouchStart} onTouchMove={handleDashboardTouchMove} onTouchEnd={handleDashboardTouchEnd} onTouchCancel={resetPullToRefresh}>
      <UserTopHeader />
      {toastMessage && (
        <div role="status" aria-live="polite" className="usr-toast fixed left-1/2 top-[76px] z-[60] max-w-[calc(100%-2rem)] -translate-x-1/2 truncate rounded-full bg-slate-950 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-xl lg:top-6">
          {toastMessage}
        </div>
      )}

      {(pullDistance > 0 || feedRefreshing) && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[70] -translate-x-1/2 lg:top-20">
          <div className="usr-pop-in flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700 shadow-lg backdrop-blur-md">
            <RefreshCw className={`h-3.5 w-3.5 ${feedRefreshing ? 'usr-spin' : ''}`} aria-hidden="true" />
            <span>{feedRefreshing ? 'Refreshing' : pullDistance >= 72 ? 'Release to refresh' : 'Pull to refresh'}</span>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-[1280px] px-0 pb-24 pt-0 sm:px-0 sm:pt-3 lg:mx-0 lg:max-w-none lg:px-6 lg:pb-10">
        <ConfirmationModal
          isOpen={showLogoutConfirm}
          title="Confirm Logout"
          message="Are you sure you want to logout?"
          confirmText={loggingOut ? 'Logging out...' : 'OK'}
          cancelText="Cancel"
          isDangerous
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />

        <ConfirmationModal
          isOpen={Boolean(blogActionConfirm)}
          title={blogActionConfirm?.action === 'delete' ? 'Delete blog?' : 'Archive blog?'}
          message={blogActionConfirm?.action === 'delete'
            ? 'This permanently removes your blog.'
            : 'This hides your blog until you restore it.'}
          confirmText={blogActionConfirm?.action === 'delete' ? 'Delete post' : 'Archive post'}
          cancelText="Cancel"
          isDangerous={blogActionConfirm?.action === 'delete'}
          onConfirm={confirmBlogAction}
          onCancel={() => setBlogActionConfirm(null)}
        />

        {error && (
          <div className="mb-4 flex gap-3 rounded-[18px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Could not load your feed</p><p>{error}</p></div>
          </div>
        )}

        <div className="dashboard-feed-layout">
          <div className="dashboard-feed-main min-w-0 lg:pr-3">
        <section className="usr-hero usr-card usr-enter mb-3 rounded-[22px] p-3.5 sm:p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#16766f] text-sm font-black text-white">
              {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(userName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#16766f]">{todayLabel}</p>
              <h1 className="mt-0.5 truncate text-lg font-black leading-tight text-slate-950 sm:text-xl">
                {greeting}, {firstName}<span className="usr-wave ml-1" aria-hidden="true">👋</span>
              </h1>
              <p className="mt-1 line-clamp-2 text-[12px] font-medium text-slate-500 sm:text-sm">
                Fresh stories, events, and places from the Daet community.
              </p>
            </div>
            <Link href="/user/rewards" className="usr-press usr-lift hidden shrink-0 items-center gap-2 rounded-full bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 sm:flex" title="Your rewards and streak">
              <Flame className="usr-flame h-4 w-4 text-amber-300" aria-hidden="true" />
              {gamification.streak}-day streak
            </Link>
          </div>

        </section>

        <section className="usr-card mb-3 rounded-[22px] p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#16766f] text-[11px] font-black text-white">
              {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(userName)}
            </span>
            <Link href="/user/blogs/new" className="usr-press flex min-h-[50px] flex-1 items-center rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-500 transition hover:border-sky-300 hover:bg-white hover:text-slate-700">
              Share something with Daet...
            </Link>
            <Link href="/user/blogs/new" aria-label="Create a post" title="Create a post" className="usr-press flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-[#16766f] text-white shadow-[0_8px_18px_rgba(22,118,111,0.22)] transition hover:bg-[#0e514d]">
              <Zap className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-4">
            {quickActions.map(({ href, label, icon: Icon, tone }) => (
              <Link key={href} href={href} className={`usr-press usr-lift flex items-center justify-center gap-2 rounded-xl border border-transparent px-3 py-2.5 text-[11px] font-bold ${tone}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="usr-rail mb-3" role="tablist" aria-label="Sort your feed">
          {FEED_SCOPES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={feedScope === value}
              onClick={() => setFeedScope(value)}
              className="usr-chip flex-1 justify-center"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
            </button>
          ))}
        </div>

        <div>
          <section className="min-w-0 space-y-3">

            <DailyFeedback userId={userId} />

            {!loading && (suggestions.suggestedPost || suggestions.suggestedPeople.length || suggestions.suggestedContent.length || suggestions.suggestedLocations.length) && (
              <section className="usr-card usr-enter rounded-[22px] p-4 sm:p-5 lg:hidden">
                <div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-sky-600" aria-hidden="true" /><h2 className="text-base font-black leading-tight text-slate-900">Suggested for you</h2></div>
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
                      <div className="mt-2 space-y-2">{suggestions.suggestedPeople.map((person) => <div key={person.id} className="flex items-center justify-between gap-2"><UserProfileLink user={person} className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-[10px] font-bold text-white">{person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(person.full_name)}</span><span className="truncate text-xs font-bold text-slate-800">{person.full_name || 'Community member'}</span></UserProfileLink><button type="button" onClick={() => followSuggestedPerson(person.id)} disabled={followedSuggestions.has(person.id)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 disabled:text-slate-400">{followedSuggestions.has(person.id) ? 'Following' : <><UserPlus className="h-3 w-3" />Follow</>}</button></div>)}</div>
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
              <div className="space-y-3" aria-busy="true" aria-live="polite">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="usr-card usr-enter rounded-[22px] p-4" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="flex items-center gap-3">
                      <div className="usr-skeleton h-10 w-10 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <div className="usr-skeleton h-3 w-32 rounded-full" />
                        <div className="usr-skeleton mt-2 h-2.5 w-20 rounded-full" />
                      </div>
                    </div>
                    <div className="usr-skeleton mt-4 h-3 w-3/4 rounded-full" />
                    <div className="usr-skeleton mt-2 h-3 w-full rounded-full" />
                    <div className="usr-skeleton mt-2 h-3 w-4/5 rounded-full" />
                    <div className="usr-skeleton mt-4 h-40 w-full rounded-[14px]" />
                  </div>
                ))}
                <span className="sr-only">Loading your feed</span>
              </div>
            ) : filteredFeed.length === 0 ? (
              <div className="usr-card rounded-[22px] border-dashed p-8 text-center">
                <span className="text-3xl" aria-hidden="true">🧭</span>
                <p className="mt-3 text-sm font-bold text-slate-800">Nothing here yet</p>
                <p className="mt-1 text-xs text-slate-500">Try another topic, clear the filters, or search the community.</p>
              </div>
            ) : (
              <div className="usr-stagger space-y-3">
                {visibleFeed.map((item) => {
                  const itemKey = `${item.type}-${item.id}`
                  const contentType = item.type === 'forum' ? 'forum_thread' : item.type === 'blog' ? 'blog' : item.type === 'post' ? 'user_post' : item.type === 'announcement' ? 'announcement' : item.type === 'tourist_spot' ? 'tourist_spot' : 'event'
                  // Comments, reactions and share counts all key on the
                  // original content: info_comments rows are foreign-keyed to
                  // the original content tables, so a repost row id can never
                  // be an engagement target.
                  const actionContentId = item.is_repost
                    ? (item.original_post_id || item.original_post?.id || item.id)
                    : (item.original_post_id || item.id)
                  const actionContentType = item.is_repost ? (item.original_content_type || contentType) : contentType
                  const isSaved = savedItems.has(itemKey)
                  const author = item.author || (item.type === 'event' ? { id: item.created_by, full_name: item.organizer || '', user_type: 'admin' } : null)
                  const authorHref = author?.id ? `/user/profile/${author.id}` : item.href
                  const authorName = getAuthorDisplayName(author || {}, item.type === 'forum' || item.type === 'post' ? 'Community member' : item.type === 'event' || item.type === 'announcement' ? 'Administrator' : 'Daet storyteller')
                  const authorRoleLabel = getAuthorRoleLabel(author || {})
                  const itemDate = item.reposted_at || item.last_activity_at || item.published_at || item.created_at || item.start_date
                  const eventMediaUrl = (item.type === 'event' || item.type === 'tourist_spot') ? getImageUrl(item.featured_image || item.images || item.gallery_images || item.videos, null) : null
                  const eventVideoUrl = item.type === 'event' && Array.isArray(item.videos) && item.videos.length > 0 ? item.videos[0] : item.video_url || null
                  const postGallery = ['blog', 'post'].includes(item.type) ? getPostImages(item) : []
                  const postImageUrl = ['blog', 'post'].includes(item.type)
                    ? item.featured_image || (item.images || [])[0]
                    : item.type === 'announcement'
                      ? item.image_url
                      : item.type === 'tourist_spot'
                        ? getImageUrl(item.featured_image || item.images || item.gallery_images, null)
                        : eventMediaUrl
                  const postVideoUrl = item.type === 'announcement' ? item.video_url : item.type === 'post' ? item.video_url : eventVideoUrl
                  const contentText = String(item.excerpt || item.description || item.content || '').trim()
                  const normalizedTags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : []
                  const isLongContent = contentText.length > 260
                  const isExpanded = expandedPosts.has(itemKey)
                  const renderedContent = isLongContent && !isExpanded ? `${contentText.slice(0, 260).trim()}...` : contentText
                  const typeMeta = getPostTypeMeta(item.type)
                  const announcementToneClass = item.announcement_type === 'urgent'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : item.announcement_type === 'important'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-sky-50 text-sky-700 border-sky-200'
                  const isPhotoFirstContent = ['blog', 'event', 'tourist_spot'].includes(item.type)
                  const readingMinutes = Math.max(1, Math.ceil((contentText.length || 0) / 180))
                  const ownsOriginalPost = isOwnOriginalPost(item, userId)
                  const canManageOriginalPost = ownsOriginalPost && ['post', 'user_post'].includes(item.type)
                  const canManageOwnBlog = ownsOriginalPost && item.type === 'blog'

                  if (process.env.NODE_ENV !== 'production' && openPostMenu === itemKey) {
                    console.debug('[POST OWNERSHIP]', {
                      postId: item.id,
                      postAuthorId: item.user_id || item.created_by || item.original_author_id,
                      currentUserId: userId,
                      isOwnPost: ownsOriginalPost,
                      isRepost: Boolean(item.is_repost),
                      reposterId: item.reposted_by,
                    })
                  }

                  if (item.is_repost) {
                    return (
                      <article key={itemKey} data-post-id={item.original_post_id || item.id} data-repost-id={item.repost_id || item.id} className="usr-card feed-card feed-card-quote usr-enter overflow-hidden rounded-[22px]">
                        <div className="p-4 sm:p-5 lg:p-6">
                          <QuoteRepostCard
                            item={item}
                            reposter={author}
                            reposterName={authorName}
                            userId={userId}
                            commentCount={commentCounts[`${item.type}-${actionContentId}`] || 0}
                            isSaved={isSaved}
                            onToggleComments={() => openCommentsSheet({
                              contentType,
                              contentId: actionContentId,
                              userId,
                              contentOwnerId: item.original_author?.id || item.original_author_id || userId,
                              contentTitle: item.original_post?.title || item.title,
                              itemType: item.type,
                            })}
                            onToggleSave={(event) => handleBookmark(event, item)}
                            onEdit={(quoteText) => void editOwnRepost(item, quoteText)}
                            onPrivacyChange={(visibility) => updateOwnRepostPrivacy(item, visibility)}
                            onDelete={() => void updateOwnRepost(item, 'delete')}
                            onArchive={() => void updateOwnRepost(item, 'archive')}
                          />
                        </div>
                      </article>
                    )
                  }

                  return (
                    <article key={itemKey} data-post-id={item.id} data-impression-id={`${itemKey}-${userId || 'guest'}`} data-type={item.type} className="usr-card feed-card usr-enter overflow-hidden rounded-[22px]">
                      <div className="p-4 sm:p-5 lg:p-6">
                        <div className="flex items-start gap-3">
                          <Link href={author?.id ? `/user/profile/${author.id}` : '/user/profile'} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-black uppercase text-sky-700 lg:h-12 lg:w-12" aria-label={`View ${authorName}'s profile`}>
                            {author?.profile_image_url ? <img src={author.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(authorName)}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-600">
                              <Link href={author?.id ? `/user/profile/${author.id}` : '/user/profile'} className="font-bold text-slate-900 hover:text-sky-700 lg:text-sm">{authorName}</Link>
                              {authorRoleLabel && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">{authorRoleLabel}</span>}
                              {author?.user_type === 'admin' && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-label="Verified organization" />}
                              <span className="text-slate-400">·</span>
                              <time dateTime={itemDate || undefined} title={itemDate ? new Date(itemDate).toLocaleString() : undefined} className="text-slate-500">{formatRelativeTime(itemDate)}</time>
                            </div>

                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${typeMeta.tone}`}>
                                <span aria-hidden="true">{typeMeta.emoji}</span>
                                {typeMeta.label}
                              </span>
                              {item.type === 'blog' && (
                                <span className="text-[10px] font-semibold text-slate-500">{readingMinutes} min read</span>
                              )}
                            </div>

                            {item.is_repost && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500"><span className="font-semibold text-slate-700">{authorName} reposted</span><span>·</span><span>Originally shared by</span><Link href={item.original_author?.id ? `/user/profile/${item.original_author.id}` : item.href} className="font-bold text-slate-800 hover:text-sky-700">{item.original_author?.full_name || 'Community member'}</Link></div>}
                            {item.is_repost && item.repost_quote && <div className="mt-3 rounded-xl border-l-4 border-emerald-300 bg-emerald-50 px-3 py-2.5 text-[13px] leading-5 text-slate-700"><span className="font-bold text-emerald-800">{authorName}</span>{' '}{item.repost_quote}</div>}

                            {item.type === 'event' && (
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                                {item.start_date && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700"><Clock3 className="h-3 w-3" />{formatDate(item.start_date)}</span>}
                                {item.location && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600"><MapPin className="h-3 w-3" />{item.location}</span>}
                              </div>
                            )}

                            {item.type === 'tourist_spot' && item.location && (
                              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700">
                                <MapPin className="h-3 w-3" />{item.location}
                              </div>
                            )}
                          </div>

                          <div className="relative z-30 shrink-0">
                            {canManageOriginalPost ? (
                              <PostActionMenu
                                visibility={item.visibility}
                                onEdit={() => void editOwnPost(item)}
                                onPrivacyChange={(visibility) => updateOwnPostPrivacy(item, visibility)}
                                onArchive={() => void updateOwnPost(item, 'archive')}
                                onDelete={() => void updateOwnPost(item, 'delete')}
                                onCopyLink={() => void copyPostLink(item)}
                              />
                            ) : canManageOwnBlog ? (
                              <PostActionMenu
                                onEdit={() => editOwnBlog(item)}
                                onArchive={() => requestBlogAction(item, 'archive')}
                                onDelete={() => requestBlogAction(item, 'delete')}
                                onCopyLink={() => void copyPostLink(item)}
                              />
                            ) : !ownsOriginalPost ? (
                              <PostActionMenu
                                onHide={() => hidePost(itemKey)}
                                onNotInterested={() => markNotInterested(item)}
                                onCopyLink={() => void copyPostLink(item)}
                              />
                            ) : null}
                          </div>
                        </div>

                        <Link href={item.href} className="mt-2 block w-full pl-0 text-left"><h2 className="m-0 break-words text-left text-[15px] font-extrabold leading-5 text-slate-950 hover:text-sky-700 sm:text-base lg:text-lg lg:leading-7">{item.title}</h2></Link>

                        {item.type === 'announcement' && (
                          <div className={`mt-3 rounded-2xl border px-3 py-2 text-[11px] font-semibold ${announcementToneClass}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>Official {item.announcement_type || 'info'} update</span>
                              {item.audience && <span className="rounded-full bg-white/70 px-1.5 py-0.5">{item.audience}</span>}
                              {item.expires_at && <span>Until {formatDate(item.expires_at)}</span>}
                            </div>
                          </div>
                        )}

                        {isPhotoFirstContent && (postGallery.length > 0 || postImageUrl || postVideoUrl) && (
                          <div className="feed-media mt-4 w-full overflow-hidden rounded-[16px] border border-slate-200 bg-slate-100 lg:mt-5 lg:rounded-[18px]">
                            {postGallery.length > 0 && <PostMediaGallery images={postGallery} resolveUrl={(url) => getImageUrl(url, '') || url} detailHref={item.href} />}
                            {postGallery.length > 0 && Array.isArray(item.videos) && item.videos.filter(Boolean).map((videoUrl, videoIndex) => (
                              <video key={`post-video-${videoIndex}`} src={typeof videoUrl === 'string' ? videoUrl : videoUrl?.url} controls className="aspect-[16/9] w-full object-cover" preload="metadata" />
                            ))}
                            {postGallery.length === 0 && (postVideoUrl ? <video src={postVideoUrl} controls className="aspect-[16/9] w-full object-cover" preload="metadata" /> : <Link href={item.href} className="block w-full"><img src={postImageUrl} alt={item.title} className="aspect-[16/9] w-full object-cover transition hover:brightness-95 lg:aspect-[16/8.5]" /></Link>)}
                          </div>
                        )}

                        {item.type === 'tourist_spot' && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                            {item.location && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 font-semibold text-sky-700"><MapPin className="h-3 w-3" />{item.location}</span>}
                            {item.rating && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-700">★ {Number(item.rating).toFixed(1)}</span>}
                            {item.entrance_fee && <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">₱{Number(item.entrance_fee).toLocaleString()}</span>}
                          </div>
                        )}

                        {item.type === 'event' && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {item.start_date && (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">When</p>
                                <p className="mt-1 text-sm font-black text-slate-900">{formatDate(item.start_date)}</p>
                                {item.start_time && <p className="text-[11px] font-semibold text-slate-600">{item.start_time}</p>}
                              </div>
                            )}
                            {item.location && (
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Where</p>
                                <p className="mt-1 text-sm font-black text-slate-900">{item.location}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {contentText && (
                          <div className="mt-3">
                            <p className="break-words text-[13px] leading-5 text-slate-600 lg:text-[15px] lg:leading-7">{renderedContent}</p>
                            {isLongContent && (
                              <button type="button" onClick={() => toggleExpandedPost(itemKey)} className="mt-2 text-xs font-bold text-sky-700 hover:text-sky-800">
                                {isExpanded ? 'Show less' : 'Read more'}
                              </button>
                            )}
                          </div>
                        )}

                        {item.type === 'forum' && (
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            <span className="rounded-full bg-sky-100 px-2.5 py-1 font-bold uppercase tracking-wide text-sky-700">Discussion</span>
                            {item.status === 'archived' && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold uppercase tracking-wide text-slate-600">Archived</span>}
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">Last active {formatRelativeTime(item.last_activity_at)}</span>
                          </div>
                        )}

                        {item.type === 'event' && (
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold uppercase tracking-wide text-amber-700">{item.is_free ? 'Free entry' : `₱${Number(item.ticket_price || 0).toLocaleString()}`}</span>
                            {item.current_attendees > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-700">{item.current_attendees} attending</span>}
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{item.location ? 'Physical' : 'Online / TBA'}</span>
                          </div>
                        )}

                        {!isPhotoFirstContent && (postGallery.length > 0 || postImageUrl || postVideoUrl) && (
                          <div className="feed-media mt-4 w-full overflow-hidden rounded-[16px] lg:mt-5 lg:rounded-[12px]">
                            {postGallery.length > 0 && <PostMediaGallery images={postGallery} resolveUrl={(url) => getImageUrl(url, '') || url} detailHref={item.href} />}
                            {postGallery.length > 0 && Array.isArray(item.videos) && item.videos.filter(Boolean).map((videoUrl, videoIndex) => (
                              <video key={`post-video-${videoIndex}`} src={typeof videoUrl === 'string' ? videoUrl : videoUrl?.url} controls className="aspect-[16/9] w-full object-cover" preload="metadata" />
                            ))}
                            {postGallery.length === 0 && (postVideoUrl ? <video src={postVideoUrl} controls className="aspect-[16/9] w-full object-cover" preload="metadata" /> : <Link href={item.href} className="block w-full"><img src={postImageUrl} alt={item.title} className="aspect-[16/9] w-full object-cover transition hover:brightness-95 lg:aspect-[16/8.5]" /></Link>)}
                          </div>
                        )}

                        <div className="feed-actions mt-4">
                          <SocialActionBar contentType={actionContentType} contentId={actionContentId} userId={userId} originalPost={{ ...item, id: actionContentId, author: item.is_repost ? item.original_author : item.author }} commentCount={commentCounts[`${item.type}-${actionContentId}`] || 0} onToggleComments={() => openCommentsSheet({
                            contentType: actionContentType,
                            contentId: actionContentId,
                            userId,
                            contentOwnerId: (item.is_repost ? item.original_author?.id : item.created_by) || author?.id || userId,
                            contentTitle: item.title,
                            itemType: item.type,
                          })} isSaved={isSaved} onToggleSave={(event) => handleBookmark(event, item)} />
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
            {!loading && filteredFeed.length > 0 && (hasMoreFeed || feedEndReached) && (
              <div className="usr-card rounded-[18px] border-dashed p-5 text-center">
                {hasMoreFeed ? (
                  <>
                    <p className="text-xs font-semibold text-slate-600">More community posts are ready.</p>
                    <button
                      type="button"
                      onClick={() => setFeedVisibleCount((count) => Math.min(count + 10, filteredFeed.length))}
                      className="usr-press usr-lift mt-3 inline-flex items-center gap-2 rounded-full bg-[#16766f] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0e514d]"
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      Load more stories
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-slate-600">You have reached the end of this feed. 🎉</p>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new Event('daet-feed-refresh'))}
                      className="usr-press usr-lift mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-700 hover:border-sky-300 hover:text-sky-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Refresh feed
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          </div>
          </div>

          <aside className="dashboard-feed-sidebar hidden min-w-0 space-y-3 lg:block lg:pr-1">
            <section className="usr-card usr-enter rounded-[18px] p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#16766f] text-sm font-black text-white">
                  {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(userName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{userName}</p>
                  <p className="truncate text-[11px] font-semibold text-slate-500">{todayLabel}</p>
                </div>
                <Link href="/user/profile" className="usr-press usr-lift shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:border-sky-300 hover:text-sky-700">Profile</Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                <Link href="/user/settings" className="usr-press flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-2 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100">
                  <Settings className="h-3.5 w-3.5" aria-hidden="true" />Settings
                </Link>
                <button type="button" onClick={handleLogout} className="usr-press flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-2 py-2.5 text-[11px] font-bold text-red-600 hover:bg-red-50">
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />Log out
                </button>
              </div>
            </section>

            <section className="usr-card usr-enter rounded-[18px] p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Your rhythm</p>
                <Flame className="usr-flame h-4 w-4 text-amber-500" aria-hidden="true" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { key: 'points', label: 'Points', value: gamification.points },
                  { key: 'level', label: 'Level', value: gamification.level },
                  { key: 'streak', label: 'Streak', value: gamification.streak },
                ].map((item) => (
                  <div key={item.key} className="usr-stat px-1.5 py-2.5">
                    <p key={item.value} className="usr-count-pop text-lg font-black leading-none text-slate-950">{item.value}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">{item.label}</p>
                  </div>
                ))}
              </div>
              <Link href="/user/rewards" className="usr-press usr-lift mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-800">
                <Star className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />View rewards
              </Link>
            </section>

            {!loading && (suggestions.suggestedPost || suggestions.suggestedPeople.length || suggestions.suggestedContent.length || suggestions.suggestedLocations.length) && (
              <section className="usr-card usr-enter rounded-[18px] p-4">
                <div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-sky-600" aria-hidden="true" /><h2 className="text-sm font-black text-slate-900">Suggested for you</h2></div>
                <div className="space-y-3">
                  {suggestions.suggestedPost && (
                    <Link href={suggestions.suggestedPost.href} className="usr-press block rounded-xl bg-sky-50 p-3 hover:bg-sky-100">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">Suggested post</p>
                      <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-900">{suggestions.suggestedPost.title}</p>
                    </Link>
                  )}
                  {suggestions.suggestedPeople.length > 0 && (
                    <div className="rounded-xl bg-emerald-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">People to follow</p>
                      <div className="mt-2 space-y-2">
                        {suggestions.suggestedPeople.map((person) => (
                          <div key={person.id} className="flex items-center justify-between gap-2">
                            <UserProfileLink user={person} className="flex min-w-0 items-center gap-2">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-[9px] font-bold text-white">
                                {person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(person.full_name)}
                              </span>
                              <span className="truncate text-xs font-bold text-slate-800">{person.full_name || 'Community member'}</span>
                            </UserProfileLink>
                            <button type="button" onClick={() => followSuggestedPerson(person.id)} disabled={followedSuggestions.has(person.id)} className="usr-press shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700 disabled:text-slate-400">
                              {followedSuggestions.has(person.id) ? 'Following' : 'Follow'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {suggestions.suggestedLocations.length > 0 && (
                    <div className="rounded-xl bg-violet-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Places to explore</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {suggestions.suggestedLocations.map((location) => (
                          <Link key={location} href={`/search?q=${encodeURIComponent(location)}`} className="usr-press inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-violet-700">
                            <MapPinned className="h-3 w-3 text-violet-600" aria-hidden="true" />{location}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}


          </aside>
        </div>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top" title="Back to top" className="usr-press usr-lift fixed bottom-8 right-8 z-20 hidden h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg hover:text-sky-700 lg:flex">
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {activeCommentsSheet && (
        <div
          className={`fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] transition-opacity duration-300 ${sheetVisible ? 'opacity-100' : 'opacity-0'}`}
          onClick={closeCommentsSheet}
        >
          <div
            className={`absolute inset-x-0 bottom-0 mx-auto flex h-[82vh] max-h-[900px] w-full max-w-[760px] flex-col rounded-t-[28px] border border-slate-200 bg-white shadow-[0_-20px_55px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-out ${sheetVisible ? 'translate-y-0' : 'translate-y-full'}`}
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => { sheetTouchStartY.current = event.touches[0]?.clientY || null }}
            onTouchEnd={(event) => {
              const startY = sheetTouchStartY.current
              const endY = event.changedTouches[0]?.clientY
              sheetTouchStartY.current = null
              if (startY !== null && typeof endY === 'number' && endY - startY > 80) closeCommentsSheet()
            }}
          >
            <div className="shrink-0 border-b border-slate-200 px-4 pb-3 pt-2 sm:px-5">
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-300" />
              <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={closeCommentsSheet}
                  aria-label="Close comments"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Comments</p>
                  <p className="truncate text-sm font-bold text-slate-900">{activeCommentsSheet.contentTitle || 'Discussion'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCommentsSheet}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Close
              </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-2 sm:px-4 sm:pb-4">
              <Comments
                contentType={activeCommentsSheet.contentType}
                contentId={activeCommentsSheet.contentId}
                userId={activeCommentsSheet.userId}
                contentOwnerId={activeCommentsSheet.contentOwnerId}
                contentTitle={activeCommentsSheet.contentTitle}
                sheetMode
                focusCommentId={activeCommentsSheet.commentId}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  )
} 