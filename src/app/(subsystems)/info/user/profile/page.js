'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Archive,
  Briefcase,
  FilePenLine,
  LogOut,
  Mail,
  MapPin,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Star,
  Trophy,
  Wand2,
} from 'lucide-react'
import MediaUpload from '@/app/(subsystems)/info/components/MediaUpload'
import ProfilePhotoCropper from '@/app/(subsystems)/info/components/user/ProfilePhotoCropper'
import UserProfileLink from '@/app/(subsystems)/info/components/user/UserProfileLink'
import ProfileFeedActions from '@/app/(subsystems)/info/components/user/ProfileFeedActions'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import PostTimestamp from '@/app/(subsystems)/info/components/user/PostTimestamp'
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal'
import { supabase } from '@/lib/supabase'
import { getStoredSession, updateStoredSession } from '@/lib/authCookies'
import { performLogout } from '@/lib/clientLogout'
import { invalidateCachePrefix } from '@/lib/cache'
import { isOwnOriginalPost } from '@/lib/postOwnership'
import { filterValidUuidValues } from '@/lib/uuid'
import { getLevelFromPoints } from '@/lib/gamification'
import PostMediaGallery from '@/app/(subsystems)/info/components/user/PostMediaGallery'
import QuoteRepostCard from '@/app/(subsystems)/info/components/user/QuoteRepostCard'
import { getPostImages, getPostVideos } from '@/lib/postMedia'
import { filterProfilePosts, getProfileContentTabs } from '@/lib/profileContent'
import { isImageAttachment, parsePostContent } from '@/lib/postContent'
import { useUserSettings } from '@/components/UserSettingsProvider'
import {
  createDefaultSettings,
  invalidateSettingsCaches,
  mergeSettings,
  saveSettingsToProfile,
  settingsFromProfileRow,
} from '@/lib/userSettings'

function readStoredSession() {
  if (typeof window === 'undefined') return null

  try {
    const raw = getStoredSession()
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function getInitials(name) {
  return (name || 'T')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'T'
}

function getBadgeTone(name) {
  const palette = {
    'Travel Starter': 'bg-amber-50 text-amber-700 border-amber-200',
    'Local Insider': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Content Creator': 'bg-sky-50 text-sky-700 border-sky-200',
    'Forum Mentor': 'bg-cyan-50 text-cyan-700 border-cyan-200',
    'Event Explorer': 'bg-pink-50 text-pink-700 border-pink-200',
    default: 'bg-slate-100 text-slate-700 border-slate-200',
  }

  return palette[name] || palette.default
}

export default function UserProfilePage() {
  const { updateSettings } = useUserSettings()
  const [session] = useState(readStoredSession)
  const [loading, setLoading] = useState(true)
  const [profileLoadError, setProfileLoadError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [userId, setUserId] = useState('')
  const [profileForm, setProfileForm] = useState({
    full_name: 'Traveler',
    email: '',
    city: '',
    country: '',
    location: 'Daet, Camarines Norte',
    bio: 'Tell the community what kind of experiences you love most.',
    avatar_url: '',
    cover_photo_url: '',
  })
  const [privacyLevel, setPrivacyLevel] = useState('public')
  const [languagePreference, setLanguagePreference] = useState('en')
  const [notificationPrefs, setNotificationPrefs] = useState(() => ({
    emailAlerts: true,
    activityDigest: true,
    newFollowers: true,
    forumMentions: true,
    announcementAlerts: false,
  }))
  const [profile, setProfile] = useState({
    full_name: 'Traveler',
    email: '',
    bio: 'Tell the community what kind of experiences you love most.',
    avatar_url: '',
    cover_photo_url: '',
    location: 'Daet, Camarines Norte',
    points: 0,
    reputation: 0,
    level: 1,
    created_at: new Date().toISOString(),
  })
  const [profileActionsOpen, setProfileActionsOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [badges, setBadges] = useState([])
  const [favoriteDestinations, setFavoriteDestinations] = useState([])
  const [eventsJoined, setEventsJoined] = useState(0)
  const [userPosts, setUserPosts] = useState([])
  const [profileTab, setProfileTab] = useState('Overview')
  const [profileCompletion, setProfileCompletion] = useState({ percent: 0, items: [] })
  const [stats, setStats] = useState({
    followers: 0,
    following: 0,
    friends: 0,
    posts: 0,
    points: 0,
  })
  const [saving, setSaving] = useState(false)
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await performLogout()
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      window.location.assign('/info/login')
    }
  }

  const levelName = `Level ${profile.level || 1}`
  const travelDestinations = useMemo(() => {
    const destinations = new Map()
    userPosts.filter((post) => post.type === 'Tourist Spot').forEach((post) => destinations.set(post.id, post))
    favoriteDestinations.forEach((spot) => destinations.set(spot.id, spot))
    return [...destinations.values()]
  }, [favoriteDestinations, userPosts])
  const rewardProgress = useMemo(() => {
    const points = Math.max(0, Number(profile.points) || 0)
    const level = getLevelFromPoints(points)
    const thresholds = [0, 120, 350, 800, 1500, 2500]
    const currentThreshold = thresholds[level - 1] || 0
    const nextThreshold = thresholds[level]
    if (nextThreshold === undefined) {
      return { level, nextThreshold: null, pointsNeeded: 0, percent: 100 }
    }
    return {
      level,
      nextThreshold,
      pointsNeeded: Math.max(0, nextThreshold - points),
      percent: Math.min(100, Math.max(0, Math.round(((points - currentThreshold) / (nextThreshold - currentThreshold)) * 100))),
    }
  }, [profile.points])

  useEffect(() => {
    const currentSession = readStoredSession()

    const fallbackUserId = currentSession?.user_id || currentSession?.id || currentSession?.userId || currentSession?.sub || ''
    const fallbackName = currentSession?.full_name || currentSession?.user_name || currentSession?.userName || currentSession?.email?.split('@')[0] || 'Traveler'
    const fallbackEmail = currentSession?.email || currentSession?.user_email || ''
    const fallbackLocation = currentSession?.city && currentSession?.country
      ? `${currentSession.city}, ${currentSession.country}`
      : 'Daet, Camarines Norte'

    startTransition(() => {
      setProfileForm((previous) => ({
        ...previous,
        full_name: fallbackName,
        email: fallbackEmail,
        city: currentSession?.city || '',
        country: currentSession?.country || '',
        location: fallbackLocation,
      }))
    })

    startTransition(() => {
      setProfile((previous) => ({
        ...previous,
        full_name: fallbackName,
        email: fallbackEmail,
        location: fallbackLocation,
        points: currentSession?.points || 0,
        reputation: currentSession?.reputation || 0,
        level: currentSession?.level || 1,
      }))
    })

    startTransition(() => setUserId(fallbackUserId))
    if (!fallbackUserId) {
      startTransition(() => setLoading(false))
      return
    }

    const loadProfile = async () => {
      try {
        const settingsResponse = await fetch('/info/api/user/settings', { cache: 'no-store' })
        const settingsResult = await settingsResponse.json().catch(() => ({}))
        if (!settingsResponse.ok || !settingsResult.success) {
          throw new Error(settingsResult.message || 'Unable to load your settings.')
        }
        const savedSettings = settingsFromProfileRow(settingsResult.profile)

        const [{ data: userData }, { data: profileData }, { data: badgeRows }, { data: favoriteRows, error: favoriteError }, { data: registrationRows, error: registrationError }, { data: blogsData }, { data: threadsData }, { data: eventsData }, profileResult] = await Promise.all([
          supabase
            .from('info_users')
            .select('id, full_name, profile_image_url, bio, city, country, points, level, created_at, user_type')
            .eq('id', fallbackUserId)
            .maybeSingle(),
          supabase
            .from('profiles')
            .select('*')
            .eq('user_id', fallbackUserId)
            .maybeSingle(),
          supabase
            .from('user_badges')
            .select('*')
            .eq('user_id', fallbackUserId)
            .order('earned_at', { ascending: false }),
          supabase
            .from('user_favorites')
            .select('item_id')
            .eq('user_id', fallbackUserId)
            .in('item_type', ['spot', 'tourist_spot']),
          supabase
            .from('event_registrations')
            .select('event_id')
            .eq('user_id', fallbackUserId)
            .eq('status', 'confirmed'),
          supabase
            .from('info_blogs')
            .select('*')
            .eq('created_by', fallbackUserId)
            .eq('status', 'published')
            .eq('approval_status', 'approved')
            .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
            .order('created_at', { ascending: false }),
          supabase
            .from('forum_threads')
            .select('*')
            .eq('created_by', fallbackUserId)
            .order('created_at', { ascending: false }),
          supabase
            .from('info_events')
            .select('*')
            .eq('created_by', fallbackUserId)
            .eq('status', 'published')
            .eq('approval_status', 'approved')
            .order('start_date', { ascending: false }),
          fetch(`/info/api/users/${fallbackUserId}`, { credentials: 'same-origin' }).then(async (response) => {
            const result = await response.json()
            if (!response.ok || !result.success) {
              const error = new Error(result.message || 'Failed to load your profile')
              error.status = response.status
              throw error
            }
            return result
          }),
        ])

        const followSummary = profileResult
        const profileContent = profileResult.content || {}
        if (favoriteError) throw favoriteError
        if (registrationError) throw registrationError
        const favoriteSpotIds = filterValidUuidValues([...new Set((favoriteRows || []).map((favorite) => favorite.item_id))])
        const favoriteSpotResult = favoriteSpotIds.length
          ? await supabase
            .from('info_tourist_spots')
            .select('id, name, description, category, location, latitude, longitude, featured_image, images')
            .in('id', favoriteSpotIds)
            .eq('status', 'active')
          : { data: [], error: null }
        if (favoriteSpotResult.error) throw favoriteSpotResult.error
        setFavoriteDestinations((favoriteSpotResult.data || []).map((spot) => ({
          id: spot.id,
          type: 'Tourist Spot',
          title: spot.name || 'Favorite destination',
          content: spot.description || '',
          category: spot.category || 'Destination',
          location: spot.location || '',
          latitude: spot.latitude,
          longitude: spot.longitude,
          media: spot.featured_image || (Array.isArray(spot.images) ? spot.images[0] : '') || '',
          href: `/info/visitor/tourist-spots/${spot.id}`,
          isFavorite: true,
        })))
        setEventsJoined((registrationRows || []).length)
        const mergedLocation = profileData?.location || [userData?.city, userData?.country].filter(Boolean).join(', ') || 'Daet, Camarines Norte'
        const nextProfile = {
          full_name: userData?.full_name || profileData?.full_name || fallbackName,
          user_type: userData?.user_type || '',
          email: userData?.email || fallbackEmail,
          bio: profileData?.bio || userData?.bio || 'Tell the community what kind of experiences you love most.',
          avatar_url: userData?.profile_image_url || profileData?.profile_image_url || '',
          cover_photo_url: profileData?.cover_photo_url || '',
          location: mergedLocation,
          points: userData?.points || 0,
          reputation: userData?.points || 0,
          level: userData?.level || 1,
          created_at: userData?.created_at || new Date().toISOString(),
        }

        const createdPosts = [
          ...((profileContent?.user_posts || []).map((post) => ({
            id: post.id,
            user_id: post.user_id,
            type: 'Post',
            title: post.title || 'Community update',
            content: post.content || 'Shared a community post.',
            created_at: post.created_at,
            category: 'Community',
            href: `/info/user/posts/${post.id}`,
            media: post.featured_image || (post.images || [])[0] || '',
            images: Array.isArray(post.images) ? post.images : [],
            videos: Array.isArray(post.videos) ? post.videos : [],
            video_url: post.video_url || '',
            pinned: false,
            accent: 'bg-amber-100 text-amber-700',
          }))),
          ...((profileContent?.tourist_spots || []).map((spot) => ({
            id: spot.id,
            user_id: spot.created_by,
            type: 'Tourist Spot',
            title: spot.name || 'Shared destination',
            content: spot.description || 'A destination shared with the community.',
            created_at: spot.created_at,
            category: spot.category || 'Destination',
            location: spot.location || '',
            latitude: spot.latitude,
            longitude: spot.longitude,
            href: `/info/visitor/tourist-spots/${spot.id}`,
            media: spot.featured_image || (Array.isArray(spot.images) ? spot.images[0] : '') || '',
            images: Array.isArray(spot.images) ? spot.images : [],
            videos: Array.isArray(spot.videos) ? spot.videos : [],
            video_url: spot.video_url || '',
            pinned: false,
            accent: 'bg-emerald-100 text-emerald-700',
          }))),
          ...(blogsData || []).map((blog) => ({
            id: blog.id,
            user_id: blog.created_by,
            type: 'Blog',
            title: blog.title || 'Untitled blog',
            content: blog.excerpt || blog.content || 'Shared a new story.',
            created_at: blog.published_at || blog.created_at,
            category: blog.category || 'Story',
            href: `/info/user/blogs/${blog.id}`,
            media: blog.featured_image || '',
            images: Array.isArray(blog.images) ? blog.images : [],
            videos: Array.isArray(blog.videos) ? blog.videos : [],
            video_url: blog.video_url || '',
            pinned: Boolean(blog.is_pinned || blog.pinned),
            accent: 'bg-sky-100 text-sky-700',
          })),
          ...(threadsData || []).map((thread) => ({
            id: thread.id,
            user_id: thread.created_by,
            type: 'Forum',
            title: thread.title || 'Community discussion',
            content: thread.content || 'Started a new discussion.',
            images: [...new Set([
              ...(Array.isArray(thread.image_urls) ? thread.image_urls : []),
              ...parsePostContent(thread.content).attachments.filter(isImageAttachment),
            ])],
            videos: Array.isArray(thread.videos) ? thread.videos : [],
            video_url: thread.video_url || '',
            created_at: thread.created_at,
            category: thread.tags?.[0] || 'Community',
            href: `/info/user/forums/${thread.id}`,
            media: '',
            pinned: Boolean(thread.is_pinned || thread.pinned),
            accent: 'bg-cyan-100 text-cyan-700',
          })),
          ...(eventsData || []).map((event) => ({
            id: event.id,
            user_id: event.created_by,
            type: 'Event',
            title: event.title || 'Community event',
            content: event.description || 'Shared an upcoming event.',
            created_at: event.start_date || event.created_at,
            category: event.category || 'Event',
            href: `/info/user/events/${event.id}`,
            media: event.featured_image || (Array.isArray(event.images) ? event.images[0] : '') || '',
            images: Array.isArray(event.images) ? event.images : [],
            videos: Array.isArray(event.videos) ? event.videos : [],
            video_url: event.video_url || '',
            pinned: Boolean(event.is_pinned || event.pinned),
            accent: 'bg-amber-100 text-amber-700',
          })),
          ...((profileContent?.reposts || []).map((repost) => {
            const typeMap = {
              blog: { type: 'Blog', category: repost.category || 'Story', href: `/info/user/blogs/${repost.original_content_id}`, accent: 'bg-sky-100 text-sky-700', content: repost.excerpt || repost.content || 'Shared a new story.' },
              forum_thread: { type: 'Forum', category: 'Community', href: `/info/user/forums/${repost.original_content_id}`, accent: 'bg-cyan-100 text-cyan-700', content: repost.content || 'Started a new discussion.' },
              event: { type: 'Event', category: repost.category || 'Event', href: `/info/user/events/${repost.original_content_id}`, accent: 'bg-amber-100 text-amber-700', content: repost.description || 'Shared an upcoming event.' },
              tourist_spot: { type: 'Destination', category: repost.category || 'Travel', href: `/info/visitor/tourist-spots/${repost.original_content_id}`, accent: 'bg-emerald-100 text-emerald-700', content: repost.description || 'Shared a destination.' },
              user_post: { type: 'Post', category: 'Community', href: `/info/user/posts/${repost.original_content_id}`, accent: 'bg-amber-100 text-amber-700', content: repost.content || 'Shared a community post.' },
            }
            const mapped = typeMap[repost.original_content_type] || typeMap.user_post
            return {
              id: `repost-${repost.repost_id}`,
              repost_id: repost.repost_id,
              reposted_by: repost.reposted_by || repost.user_id,
              user_id: repost.reposted_by || repost.user_id,
              original_content_id: repost.original_content_id,
              original_content_type: repost.original_content_type,
              type: mapped.type,
              title: repost.title || repost.name || 'Shared content',
              content: mapped.content,
              created_at: repost.created_at,
              category: mapped.category,
              href: mapped.href,
              media: repost.featured_image || (repost.images || [])[0] || '',
              images: Array.isArray(repost.images) ? repost.images : [],
              videos: Array.isArray(repost.videos) ? repost.videos : [],
              video_url: repost.video_url || '',
              pinned: false,
              accent: mapped.accent,
              isRepost: true,
              repostQuote: repost.repost_quote,
              repost_quote: repost.repost_quote,
              originalAuthor: repost.original_author,
              original_post: repost.original_post,
            }
          })),
        ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

        setProfile(nextProfile)
        setProfileForm({
          full_name: nextProfile.full_name,
          email: nextProfile.email,
          city: userData?.city || '',
          country: userData?.country || '',
          location: mergedLocation,
          bio: nextProfile.bio,
          avatar_url: nextProfile.avatar_url,
          cover_photo_url: nextProfile.cover_photo_url,
        })
        setPrivacyLevel(savedSettings.privacy?.privacyLevel || 'public')
        setLanguagePreference(savedSettings.language || 'en')
        setNotificationPrefs({
          emailAlerts: true,
          activityDigest: true,
          newFollowers: true,
          forumMentions: true,
          announcementAlerts: false,
          ...savedSettings.notifications,
        })
        setFollowers(followSummary?.followers || [])
        setFollowing(followSummary?.following || [])
        setBadges((badgeRows || []).map((badge) => ({ ...badge, badge_name: badge.badge_name || badge.name || 'Badge' })))
        const completionFields = [
          { label: 'Profile photo', complete: Boolean(userData?.profile_image_url || profileData?.profile_image_url) },
          { label: 'Cover photo', complete: Boolean(profileData?.cover_photo_url) },
          { label: 'Biography', complete: Boolean((profileData?.bio || userData?.bio || '').trim()) },
          { label: 'Location', complete: Boolean(profileData?.location || profileData?.city || userData?.city) },
        ]
        setProfileCompletion({
          percent: Math.round((completionFields.filter((item) => item.complete).length / completionFields.length) * 100),
          items: completionFields,
        })
        const engagementRefs = createdPosts.map((post) => ({
          type: post.type === 'Blog' ? 'blog' : post.type === 'Forum' ? 'forum_thread' : post.type === 'Event' ? 'event' : 'user_post',
          id: post.id,
        }))
        const engagementIds = filterValidUuidValues([...new Set(engagementRefs.map((item) => item.id))])
        const [{ data: reactionRows }, { data: commentRows }] = engagementIds.length
          ? await Promise.all([
            supabase.from('content_reactions').select('content_type, content_id').in('content_id', engagementIds),
            supabase.from('content_comments').select('content_type, content_id').in('content_id', engagementIds).eq('status', 'active'),
          ])
          : [{ data: [] }, { data: [] }]
        const engagementCounts = new Map()
        ;(reactionRows || []).forEach((row) => {
          const key = `${row.content_type}:${row.content_id}`
          const current = engagementCounts.get(key) || { reactionsCount: 0, commentsCount: 0 }
          current.reactionsCount += 1
          engagementCounts.set(key, current)
        })
        ;(commentRows || []).forEach((row) => {
          const key = `${row.content_type}:${row.content_id}`
          const current = engagementCounts.get(key) || { reactionsCount: 0, commentsCount: 0 }
          current.commentsCount += 1
          engagementCounts.set(key, current)
        })
        const enrichedPosts = createdPosts.map((post) => {
          const type = post.type === 'Blog' ? 'blog' : post.type === 'Forum' ? 'forum_thread' : post.type === 'Event' ? 'event' : post.type === 'Tourist Spot' ? 'tourist_spot' : 'user_post'
          return { ...post, ...(engagementCounts.get(`${type}:${post.id}`) || { reactionsCount: 0, commentsCount: 0 }) }
        })
        setUserPosts(enrichedPosts)
        setStats({
          followers: followSummary?.followers_count ?? 0,
          following: followSummary?.following_count ?? 0,
          friends: followSummary?.friends_count ?? followSummary?.friends?.length ?? 0,
          posts: enrichedPosts.length,
          points: userData?.points || nextProfile.points || 0,
        })
      } catch (error) {
        if (error?.status === 404) {
          setProfileLoadError('We could not find an active profile for this account. Sign in again, or contact support if the problem continues.')
        } else {
          console.error('Profile fetch failed:', error)
          setProfileLoadError(error?.message || 'Unable to load your profile right now.')
        }
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  useEffect(() => {
    if (!userId) return undefined

    const handleRepostChange = (event) => {
      const detail = event.detail || {}
      if (detail.userId !== userId) return

      if (detail.action === 'removed') {
        setUserPosts((previous) => previous.filter((post) => !(post.isRepost && post.original_content_id === detail.contentId)))
        setStats((previous) => ({ ...previous, posts: Math.max(0, previous.posts - 1) }))
        invalidateCachePrefix('profile:user:')
        return
      }

      if (detail.action === 'updated') {
        setUserPosts((previous) => previous.map((post) => post.repost_id === detail.repost?.id
          ? { ...post, repostQuote: detail.repost.quote_text, repost_quote: detail.repost.quote_text }
          : post))
        invalidateCachePrefix('profile:user:')
        return
      }

      const original = detail.original
      const repost = detail.repost
      if (!original || !repost?.id) return
      const typeMap = {
        blog: { type: 'Blog', category: 'Story', href: `/info/user/blogs/${repost.original_content_id}`, content: original.excerpt || original.content || 'Shared a new story.' },
        forum_thread: { type: 'Forum', category: 'Community', href: `/info/user/forums/${repost.original_content_id}`, content: original.content || 'Started a new discussion.' },
        event: { type: 'Event', category: 'Event', href: `/info/user/events/${repost.original_content_id}`, content: original.description || 'Shared an upcoming event.' },
        tourist_spot: { type: 'Destination', category: original.category || 'Travel', href: `/info/visitor/tourist-spots/${repost.original_content_id}`, content: original.description || 'Shared a destination.' },
        user_post: { type: 'Post', category: 'Community', href: `/info/user/posts/${repost.original_content_id}`, content: original.content || 'Shared a community post.' },
      }
      const mapped = typeMap[repost.original_content_type] || typeMap.user_post
      const nextPost = {
        id: `repost-${repost.id}`,
        repost_id: repost.id,
        reposted_by: repost.user_id || userId,
        user_id: repost.user_id || userId,
        original_content_id: repost.original_content_id,
        original_content_type: repost.original_content_type,
        type: mapped.type,
        title: original.title || original.name || 'Shared content',
        content: mapped.content,
        created_at: repost.created_at,
        reposted_at: repost.created_at,
        category: mapped.category,
        href: mapped.href,
        media: original.featured_image || (original.images || [])[0] || '',
        images: Array.isArray(original.images) ? original.images : [],
        videos: Array.isArray(original.videos) ? original.videos : [],
        video_url: original.video_url || '',
        pinned: false,
        accent: 'bg-amber-100 text-amber-700',
        isRepost: true,
        repostQuote: repost.quote_text,
        repost_quote: repost.quote_text,
        originalAuthor: original.author || null,
        original_post: { ...original, author: original.author || null },
      }
      setUserPosts((previous) => [nextPost, ...previous.filter((post) => post.id !== nextPost.id)])
      setStats((previous) => ({ ...previous, posts: previous.posts + 1 }))
      invalidateCachePrefix('profile:user:')
    }

    window.addEventListener('daet-repost-created', handleRepostChange)
    return () => window.removeEventListener('daet-repost-created', handleRepostChange)
  }, [userId])

  useEffect(() => {
    const handleRepostVisibilityChange = (event) => {
      const repostId = event.detail?.repost?.repost_id || event.detail?.repost?.id
      if (!repostId || !['delete', 'archive'].includes(event.detail?.action)) return
      setUserPosts((previous) => previous.filter((post) => post.id !== `repost-${repostId}`))
      setStats((previous) => ({ ...previous, posts: Math.max(0, previous.posts - 1) }))
      invalidateCachePrefix('profile:user:')
    }
    window.addEventListener('daet-repost-visibility-changed', handleRepostVisibilityChange)
    return () => window.removeEventListener('daet-repost-visibility-changed', handleRepostVisibilityChange)
  }, [userId])

  const visiblePosts = useMemo(() => filterProfilePosts(userPosts, profileTab), [userPosts, profileTab])
  const profileTabs = useMemo(() => getProfileContentTabs(userPosts), [userPosts])
  const pinnedPosts = useMemo(() => userPosts.filter((post) => post.pinned), [userPosts])

  const updateProfileRepostNote = async (post, quoteText) => {
    if (!post?.repost_id || post.reposted_by !== userId) return

    try {
      const response = await fetch(`/info/api/reposts/${encodeURIComponent(post.repost_id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteText }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update your repost note.')

      const nextQuote = result.repost?.quote_text ?? null
      setUserPosts((previous) => previous.map((item) => item.repost_id === post.repost_id
        ? { ...item, repostQuote: nextQuote, repost_quote: nextQuote }
        : item))
      invalidateCachePrefix('profile:user:')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('daet-repost-created', {
          detail: {
            action: 'updated',
            repost: result.repost,
            original: post.original_post,
            contentType: post.original_content_type,
            contentId: post.original_content_id,
            userId,
          },
        }))
      }
    } catch (error) {
      console.error('Profile repost note update failed:', error)
      setSaveNotice(error?.message || 'Unable to update your repost note.')
    }
  }

  const updateProfilePost = async (post, action, alreadyConfirmed = false) => {
    const isRepost = Boolean(post?.isRepost)
    const endpoint = isRepost ? `/info/api/reposts/${post.repost_id}` : `/info/api/posts/${post.id}`
    const isDelete = action === 'delete'
    const confirmation = isDelete
      ? (isRepost ? 'Delete repost?\n\nThis removes only your repost.' : 'Delete post?\n\nThis permanently removes your post.')
      : (isRepost ? 'Archive repost?\n\nThis hides the repost from your profile and feed. You can restore it from Archive.' : 'Archive post?\n\nThis hides the post until you restore it from Archive.')
    if (!alreadyConfirmed && !window.confirm(confirmation)) return
    const response = await fetch(endpoint, {
      method: isDelete ? 'DELETE' : 'PATCH',
      credentials: 'same-origin',
      headers: isDelete ? undefined : { 'Content-Type': 'application/json' },
      body: isDelete ? undefined : JSON.stringify({ status: 'archived' }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      setSaveNotice(result.message || 'Unable to update post.')
      return
    }
    setUserPosts((previous) => previous.filter((item) => item.id !== post.id && !(isDelete && !isRepost && item.original_content_id === post.id)))
    setOpenPostMenu(null)
    setStats((previous) => ({ ...previous, posts: Math.max(0, previous.posts - 1) }))
    invalidateCachePrefix('profile:user:')
  }

  const updateProfilePostPrivacy = async (post, visibility) => {
    if (!post || post.isRepost || post.type !== 'Post' || post.user_id !== userId) return

    const response = await fetch(`/info/api/posts/${post.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      setSaveNotice(result.message || 'Unable to update post privacy.')
      return
    }

    setUserPosts((previous) => previous.map((item) => item.id === post.id ? { ...item, visibility } : item))
    setOpenPostMenu(null)
    invalidateCachePrefix('profile:user:')
  }

  const editProfilePost = async (post) => {
    if (post?.type !== 'Post' || post?.isRepost || post.user_id !== userId) return
    const title = window.prompt('Edit post title:', post.title || '')
    if (title === null) return
    const content = window.prompt('Edit post content:', post.content || '')
    if (content === null) return
    const response = await fetch(`/info/api/posts/${post.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      setSaveNotice(result.message || 'Unable to edit post.')
      return
    }
    setUserPosts((previous) => previous.map((item) => item.id === post.id ? { ...item, title, content } : item))
    setOpenPostMenu(null)
    invalidateCachePrefix('profile:user:')
  }

  const handleSaveProfile = async () => {
    if (!userId) {
      setSaveNotice('Please sign in to update your profile.')
      return
    }

    setSaving(true)
    setSaveNotice('')
    let profileDetailsSaved = false

    try {
      const nextLocation = profileForm.location || [profileForm.city, profileForm.country].filter(Boolean).join(', ') || 'Daet, Camarines Norte'
      const profileResponse = await fetch('/info/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: profileForm.full_name,
          bio: profileForm.bio,
          location: nextLocation,
          avatarUrl: profileForm.avatar_url,
          coverPhotoUrl: profileForm.cover_photo_url,
        }),
      })
      const profileResult = await profileResponse.json().catch(() => ({}))
      if (!profileResponse.ok || !profileResult.success) {
        throw new Error(profileResult.message || 'Unable to save profile details.')
      }
      profileDetailsSaved = true

      const settingsResponse = await fetch('/info/api/user/settings', { cache: 'no-store' })
      const settingsResult = await settingsResponse.json().catch(() => ({}))
      if (!settingsResponse.ok || !settingsResult.success) {
        throw new Error(settingsResult.message || 'Unable to load your settings for saving.')
      }
      const currentSettings = mergeSettings(
        createDefaultSettings(),
        settingsFromProfileRow(settingsResult.profile)
      )
      const settingsSave = await saveSettingsToProfile({
        settings: mergeSettings(currentSettings, {
          language: languagePreference,
          notifications: notificationPrefs,
          privacy: { privacyLevel },
        }),
      })
      if (!settingsSave.ok) throw settingsSave.error || new Error('Unable to save your settings.')
      updateSettings({ language: languagePreference })

      const updatedProfile = {
        ...profile,
        full_name: profileForm.full_name,
        bio: profileForm.bio,
        avatar_url: profileForm.avatar_url,
        cover_photo_url: profileForm.cover_photo_url,
        location: nextLocation,
        email: profileForm.email,
      }

      setProfile(updatedProfile)
      const completionFields = [
        { label: 'Profile photo', complete: Boolean(profileForm.avatar_url) },
        { label: 'Cover photo', complete: Boolean(profileForm.cover_photo_url) },
        { label: 'Biography', complete: Boolean(profileForm.bio.trim() && profileForm.bio.trim() !== 'Tell the community what kind of experiences you love most.') },
        { label: 'Location', complete: Boolean(profileForm.city || profileForm.country || (profileForm.location && profileForm.location !== 'Daet, Camarines Norte')) },
      ]
      setProfileCompletion({
        percent: Math.round((completionFields.filter((item) => item.complete).length / completionFields.length) * 100),
        items: completionFields,
      })
      updateStoredSession({
        full_name: updatedProfile.full_name,
        avatar_url: updatedProfile.avatar_url,
        profile_image_url: updatedProfile.avatar_url,
      })
      invalidateCachePrefix('profile:user:')
      invalidateSettingsCaches(userId)
      setSaveNotice('Profile updated successfully.')
    } catch (error) {
      console.error('Profile update failed:', error)
      setSaveNotice(profileDetailsSaved
        ? `Profile details were saved, but preferences were not: ${error?.message || 'Unable to save settings.'}`
        : error?.message || 'Unable to save changes right now.')
    } finally {
      setSaving(false)
    }
  }

  const renderProfileActions = (placement) => (
    <div className={`profile-actions-menu ${placement}`}>
      <button type="button" onClick={() => setProfileActionsOpen((value) => !value)} aria-label="Open profile actions" aria-expanded={profileActionsOpen} aria-haspopup="menu" className="usr-press inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-slate-950/35 text-white shadow-sm backdrop-blur-sm transition hover:bg-slate-950/55">
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {profileActionsOpen && (
        <div role="menu" className="usr-pop-in absolute right-0 top-12 z-30 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-left text-slate-700 shadow-xl">
          <Link role="menuitem" href="/info/user/rewards" onClick={() => setProfileActionsOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-700"><Trophy className="h-4 w-4" />Rewards</Link>
          <Link role="menuitem" href="/info/user/profile/archive" onClick={() => setProfileActionsOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-700"><Archive className="h-4 w-4" />Archive</Link>
          <Link role="menuitem" href="/info/user/drafts" onClick={() => setProfileActionsOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FilePenLine className="h-4 w-4" />Drafts</Link>
          <Link role="menuitem" href="/info/user/blog-submissions" onClick={() => setProfileActionsOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-700"><FilePenLine className="h-4 w-4" />My blog posts</Link>
          <Link role="menuitem" href="/info/user/settings" onClick={() => setProfileActionsOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />Settings</Link>
          <div className="my-1 border-t border-slate-100" role="separator" />
          <button role="menuitem" type="button" onClick={() => { setProfileActionsOpen(false); setShowLogoutConfirm(true) }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Log out</button>
        </div>
      )}
    </div>
  )

  return (
    <main className="tourism-shell usr-section-page usr-profile min-h-screen w-full overflow-x-clip text-slate-900">
      <UserTopHeader />
      {renderProfileActions('profile-actions-menu-mobile')}
      <div className="usr-section-container mx-auto w-full max-w-5xl px-3 pb-24 pt-0 sm:px-4 lg:px-6 lg:pb-10">
        <div className="usr-enter relative mb-5">
          <div className="profile-cover-frame h-40 bg-gradient-to-r from-sky-800 via-cyan-800 to-slate-900 sm:h-56">
            {profile.cover_photo_url ? (
              <img src={profile.cover_photo_url} alt="Cover photo" className="profile-cover-image" />
            ) : null}
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-slate-950/45 via-slate-950/10 to-transparent" />
          </div>

          {renderProfileActions('profile-actions-menu-desktop absolute right-3 top-3 z-30')}

          <div className="profile-identity-strip border-b border-slate-200 px-3 pb-4 sm:px-5 sm:pb-5">
            <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-end gap-3">
                <div className="usr-profile-avatar -mt-14 flex shrink-0 items-center justify-center overflow-hidden sm:-mt-16">
                  {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.full_name} className="h-full w-full object-cover" /> : getInitials(profile.full_name)}
                </div>
                <div className="min-w-0 pb-1">
                  <h1 className="flex flex-wrap items-center gap-1.5 break-words text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                    {profile.full_name}
                    {profile.user_type === 'admin' && <ShieldCheck aria-label="Verified account" className="h-4 w-4 shrink-0 text-emerald-500" />}
                  </h1>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4 text-sky-600" />{profile.location}</p>
                  {profile.bio && <p className="profile-header-bio">{profile.bio}</p>}
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    <Link href="/info/user/blogs/new" className="usr-section-secondary"><FilePenLine className="h-4 w-4" />Create Post</Link>
                <Link href="/info/user/profile/edit" className="usr-section-primary"><Wand2 className="h-4 w-4" />Edit Profile</Link>
              </div>
            </div>
          </div>

          <div className="profile-stat-strip grid grid-cols-2 border-b border-slate-200 text-center sm:grid-cols-4">
            <div className="border-r border-slate-200 px-2 py-3"><p className="text-xl font-black text-slate-900">{stats.posts}</p><p className="usr-stat-label mt-0.5">Posts</p></div>
            <Link href="/info/user/profile/connections?tab=followers" className="border-r border-slate-200 px-2 py-3 transition hover:bg-sky-50"><p className="text-xl font-black text-slate-900">{stats.followers}</p><p className="usr-stat-label mt-0.5">Followers</p></Link>
            <Link href="/info/user/profile/connections?tab=friends" className="border-r border-slate-200 px-2 py-3 transition hover:bg-sky-50"><p className="text-xl font-black text-slate-900">{stats.friends}</p><p className="usr-stat-label mt-0.5">Friends</p></Link>
            <Link href="/info/user/profile/connections?tab=following" className="px-2 py-3 transition hover:bg-sky-50"><p className="text-xl font-black text-slate-900">{stats.following}</p><p className="usr-stat-label mt-0.5">Following</p></Link>
          </div>

          <div className="profile-content-layout px-3 py-4 sm:px-5 sm:py-5">
            <aside className="profile-content-sidebar">
            <section className="usr-card mb-5 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">About</p>
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">{levelName}</span>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-700">{profile.bio}</p>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <span>{profile.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span>{profile.email || 'No email available'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-slate-400" />
                    <span>{profile.points || 0} points</span>
                  </div>
              </div>

            </section>

            </aside>

            <section className="profile-content-main min-w-0 space-y-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">Wall</p><h2 className="mt-1 text-lg font-black text-slate-900">Shared content</h2></div>
                </div>

                <div className="profile-tabs" role="tablist" aria-label="Profile content">
                  {profileTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={profileTab === tab}
                      onClick={() => setProfileTab(tab)}
                      className="profile-tab"
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {profileTab === 'Overview' && (
                  <div className="profile-overview">
                    <section className="profile-overview-card profile-rewards-card">
                      <div className="profile-overview-heading">
                        <div>
                          <p className="profile-overview-eyebrow">Your progress</p>
                          <h3>Rewards & achievements</h3>
                        </div>
                        <Trophy aria-hidden="true" />
                      </div>
                      <div className="profile-reward-stats">
                        <div><strong>{Number(profile.points) || 0}</strong><span>Points</span></div>
                        <div><strong>Level {rewardProgress.level}</strong><span>Current level</span></div>
                        <div><strong>{badges.length}</strong><span>Badges earned</span></div>
                      </div>
                      <div className="profile-level-progress">
                        <div className="profile-level-progress-copy">
                          <span>{rewardProgress.nextThreshold === null ? 'Maximum level reached' : `${rewardProgress.pointsNeeded} points to Level ${rewardProgress.level + 1}`}</span>
                          <span>{rewardProgress.percent}%</span>
                        </div>
                        <div className="profile-level-progress-track" role="progressbar" aria-label="Progress toward next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rewardProgress.percent}>
                          <span style={{ width: `${rewardProgress.percent}%` }} />
                        </div>
                      </div>
                      {badges.length > 0 ? (
                        <div className="profile-badge-list">
                          {badges.slice(0, 4).map((badge) => (
                            <span key={badge.id || badge.badge_name} className="profile-badge-chip" title={badge.description || badge.badge_description || badge.badge_name}>
                              <Star aria-hidden="true" />
                              {badge.badge_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="profile-overview-empty">No earned badges yet. Keep contributing to unlock achievements.</p>
                      )}
                      <div className="profile-overview-footer">
                        <Link href="/info/user/rewards">View rewards <span aria-hidden="true">→</span></Link>
                      </div>
                    </section>

                    {profileCompletion.items.length > 0 && !profileCompletion.items.every((item) => item.complete) && (
                      <section className="profile-overview-card">
                        <div className="profile-overview-heading">
                          <div>
                            <p className="profile-overview-eyebrow">Your profile</p>
                            <h3>Profile completion</h3>
                          </div>
                          <strong className="profile-completion-value">{profileCompletion.percent}%</strong>
                        </div>
                        <div className="profile-level-progress-track" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={profileCompletion.percent}>
                          <span style={{ width: `${profileCompletion.percent}%` }} />
                        </div>
                        <ul className="profile-completion-list">
                          {profileCompletion.items.map((item) => (
                            <li key={item.label} data-complete={item.complete}>
                              <span aria-hidden="true">{item.complete ? '✓' : '○'}</span>
                              {item.label}
                            </li>
                          ))}
                        </ul>
                        <Link className="profile-overview-link" href="/info/user/profile/edit">Complete your profile <span aria-hidden="true">→</span></Link>
                      </section>
                    )}

                    {pinnedPosts.length > 0 && (
                      <section className="profile-overview-card">
                        <div className="profile-overview-heading">
                          <div>
                            <p className="profile-overview-eyebrow">Showcase</p>
                            <h3>Featured content</h3>
                          </div>
                          <Star aria-hidden="true" />
                        </div>
                        <div className="profile-featured-list">
                          {pinnedPosts.slice(0, 3).map((post) => (
                            <Link key={`${post.type}-${post.id}`} href={post.href}>
                              <span>{post.type}</span>
                              <strong>{post.title}</strong>
                              <span aria-hidden="true">→</span>
                            </Link>
                          ))}
                        </div>
                      </section>
                    )}

                    <section className="profile-overview-card">
                      <div className="profile-overview-heading">
                        <div>
                          <p className="profile-overview-eyebrow">Explore</p>
                          <h3>My travel journey</h3>
                        </div>
                        <MapPin aria-hidden="true" />
                      </div>
                      {travelDestinations.length > 0 ? (
                        <div className="profile-travel-preview">
                          {travelDestinations.slice(0, 3).map((spot) => (
                            <Link key={spot.id} href={spot.href} className="profile-travel-item">
                              {spot.media ? <img src={spot.media} alt="" /> : <span className="profile-travel-placeholder"><MapPin aria-hidden="true" /></span>}
                              <span><strong>{spot.title}</strong><small>{spot.isFavorite ? 'Favorite destination' : spot.location || 'Shared destination'}</small></span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="profile-overview-empty">No shared or favorite destinations saved yet. This profile does not track visits automatically.</p>
                      )}
                      {profileTabs.includes('Travel') && <button type="button" className="profile-overview-link-button" onClick={() => setProfileTab('Travel')}>Explore shared destinations <span aria-hidden="true">→</span></button>}
                    </section>

                  </div>
                )}

                {profileTab === 'Travel' && (
                  <section className="profile-travel-section">
                    <div className="profile-overview-heading">
                      <div>
                        <p className="profile-overview-eyebrow">Tourism contributions</p>
                        <h3>Destinations shared</h3>
                      </div>
                      <MapPin aria-hidden="true" />
                    </div>
                    {travelDestinations.length > 0 ? (
                      <div className="profile-travel-grid">
                        {travelDestinations.map((spot) => (
                          <Link key={spot.id} href={spot.href} className="profile-travel-card">
                            {spot.media ? <img src={spot.media} alt="" /> : <span className="profile-travel-placeholder"><MapPin aria-hidden="true" /></span>}
                            <span className="profile-travel-card-copy">
                              <small>{spot.isFavorite ? 'Favorite destination' : spot.category || 'Destination'}</small>
                              <strong>{spot.title}</strong>
                              <span>{spot.location || 'Daet, Camarines Norte'}</span>
                            </span>
                            {spot.latitude != null && spot.longitude != null && (
                              <span className="profile-travel-coordinates">
                                {Number(spot.latitude).toFixed(3)}, {Number(spot.longitude).toFixed(3)}
                                <a href={`https://www.google.com/maps/search/?api=1&query=${spot.latitude},${spot.longitude}`} target="_blank" rel="noreferrer">Map</a>
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="profile-overview-empty">No shared or favorite destinations saved yet. Visit tracking is not available, so places are never marked visited by viewing them.</p>
                    )}
                  </section>
                )}

                <div className="space-y-1.5">
                    {visiblePosts.length ? visiblePosts.map((post) => post.isRepost ? (
                      <article key={`${post.type}-${post.id}`} className="usr-card feed-card profile-repost-card">
                        <QuoteRepostCard
                          item={post}
                          reposter={{
                            id: userId || post.reposted_by,
                            full_name: profile.full_name,
                            profile_image_url: profile.avatar_url,
                          }}
                          reposterName={profile.full_name}
                          userId={userId}
                          compactFeed
                          profileStyle
                          onEdit={(quoteText) => void updateProfileRepostNote(post, quoteText)}
                          onRemoveNote={() => void updateProfileRepostNote(post, null)}
                          onArchive={() => void updateProfilePost(post, 'archive', true)}
                          onDelete={() => void updateProfilePost(post, 'delete', true)}
                        />
                      </article>
                    ) : (
                      <article key={`${post.type}-${post.id}`} className="usr-card usr-content-card feed-card profile-post-card overflow-hidden">
                        <div className="profile-post-card-inner">
                        <div className="profile-post-header">
                          <span className="profile-post-avatar flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-50 text-xs font-black uppercase text-sky-700">
                            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : getInitials(profile.full_name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                              <p className="truncate font-bold text-slate-900">{profile.full_name}</p>
                              {profile.user_type === 'admin' && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Verified organization" />}
                              <span aria-hidden="true">·</span>
                              <PostTimestamp value={post.created_at} />
                            </div>
                          </div>
                        </div>

                        <Link href={post.href} className="profile-post-title mt-4 block"><h3>{post.title}</h3></Link>
                        <p className="profile-post-description">{post.type === 'Forum' ? parsePostContent(post.content).text : post.content}</p>
                        {(profileTab === 'Videos' ? getPostVideos(post).length > 0 : getPostImages(post).length > 0 || getPostVideos(post).length > 0) && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                          {profileTab !== 'Videos' && getPostImages(post).length > 0 && <PostMediaGallery images={getPostImages(post)} detailHref={post.href} />}
                          {profileTab !== 'Photos' && getPostVideos(post).map((url, index) => <video key={`${url}-${index}`} src={url} controls className="aspect-[16/8.5] w-full object-cover" preload="metadata" />)}
                        </div>}

                        <div className="profile-post-actions">
                          <ProfileFeedActions
                            post={post}
                            userId={userId}
                            postActionMenuProps={{
                              visibility: post.visibility || 'public',
                              onEdit: isOwnOriginalPost(post, userId) && post.type === 'Post' ? () => void editProfilePost(post) : undefined,
                              onPrivacyChange: isOwnOriginalPost(post, userId) && post.type === 'Post' ? (visibility) => updateProfilePostPrivacy(post, visibility) : undefined,
                              onArchive: isOwnOriginalPost(post, userId) && post.type === 'Post' ? () => void updateProfilePost(post, 'archive') : undefined,
                              onDelete: isOwnOriginalPost(post, userId) && post.type === 'Post' ? () => void updateProfilePost(post, 'delete') : undefined,
                            }}
                          />
                        </div>
                        </div>
                      </article>
                    )) : (
                      <div className="usr-empty-state !border-dashed text-sm text-slate-500">
                        <p className="font-semibold text-slate-700">{profileTab === 'Overview' ? 'No recent posts yet' : `No ${profileTab.toLowerCase()} to show`}</p>
                        <p className="mt-1">{profileTab === 'Overview' ? 'Share a story or start a forum discussion to add your first community update.' : `Your ${profileTab.toLowerCase()} will appear here when you share them.`}</p>
                        <Link href="/info/user/blogs/new" className="usr-section-primary mt-5 inline-flex">Create a post</Link>
                      </div>
                    )}
                </div>

              <div id="profile-editor" className="usr-card hidden p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-teal-700" />
                  <h3 className="text-lg font-bold text-slate-900">Edit profile</h3>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
                    <input
                      value={profileForm.full_name}
                      onChange={(event) => setProfileForm((previous) => ({ ...previous, full_name: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-300 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                    <input
                      value={profileForm.email}
                      readOnly
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-600 outline-none"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                      <input
                        value={profileForm.city}
                        onChange={(event) => setProfileForm((previous) => ({
                          ...previous,
                          city: event.target.value,
                          location: [event.target.value, previous.country].filter(Boolean).join(', '),
                        }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-300 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
                      <input
                        value={profileForm.country}
                        onChange={(event) => setProfileForm((previous) => ({
                          ...previous,
                          country: event.target.value,
                          location: [previous.city, event.target.value].filter(Boolean).join(', '),
                        }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-300 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Location</label>
                    <input
                      value={profileForm.location}
                      onChange={(event) => setProfileForm((previous) => ({ ...previous, location: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-300 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Bio</label>
                    <textarea
                      rows={4}
                      value={profileForm.bio}
                      onChange={(event) => setProfileForm((previous) => ({ ...previous, bio: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-300 focus:bg-white"
                    />
                  </div>

                  <div id="privacy" className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-700">Avatar</p>
                      <ProfilePhotoCropper
                        userId={userId}
                        imageUrl={profileForm.avatar_url}
                        onUploadComplete={(url) => setProfileForm((previous) => ({ ...previous, avatar_url: url }))}
                        onUploadError={setSaveNotice}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-700">Cover photo</p>
                      <MediaUpload
                        bucket="profile-media"
                        folder={`covers/${userId || 'me'}`}
                        mediaType="image"
                        trimLetterbox
                        existingMediaUrl={profileForm.cover_photo_url}
                        previewClassName="h-32 w-full max-w-lg aspect-[3/1]"
                        buttonText="Upload cover"
                        onUploadComplete={(url) => setProfileForm((previous) => ({ ...previous, cover_photo_url: url }))}
                        onUploadError={(message) => setSaveNotice(message)}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-sm font-medium text-slate-700">Privacy</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {['public', 'followers', 'private'].map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setPrivacyLevel(level)}
                          className={`rounded-[12px] border px-3 py-2 text-sm font-medium ${
                            privacyLevel === level ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-sm font-medium text-slate-700">Language</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[
                        { code: 'en', label: 'English' },
                        { code: 'fil', label: 'Filipino' },
                        { code: 'bik', label: 'Bikol' },
                      ].map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          onClick={() => setLanguagePreference(option.code)}
                          className={`rounded-[12px] border px-3 py-2 text-sm font-medium ${
                            languagePreference === option.code ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                  {saveNotice ? <p className="text-sm text-slate-600">{saveNotice}</p> : null}
                </div>
              </div>
            </section>
          </div>
        </div>

        {loading ? (
          <div className="usr-surface mt-6 p-5 text-sm text-slate-600">
            Loading your profile...
          </div>
        ) : null}
        {profileLoadError ? (
          <div className="usr-surface mt-6 p-5 text-sm text-rose-700" role="alert">
            {profileLoadError}
          </div>
        ) : null}
      </div>
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        title="Confirm Logout"
        message="Are you sure you want to logout?"
        confirmText={loggingOut ? 'Logging out...' : 'Log out'}
        cancelText="Cancel"
        isDangerous
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </main>
  )
}
