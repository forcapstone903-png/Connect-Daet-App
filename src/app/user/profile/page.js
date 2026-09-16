'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Briefcase,
  FilePenLine,
  FileText,
  Globe,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  Star,
  Trophy,
  Users,
  Wand2,
} from 'lucide-react'
import MediaUpload from '@/app/components/MediaUpload'
import UserProfileLink from '@/app/components/user/UserProfileLink'
import ProfileFeedActions from '@/app/components/user/ProfileFeedActions'
import { supabase } from '@/lib/supabase'
import { getStoredSession, updateStoredSession } from '@/lib/authCookies'
import { invalidateCachePrefix } from '@/lib/cache'

const STORAGE_KEYS = {
  profilePreferences: 'daet_user_profile_preferences',
}

function readStoredSession() {
  if (typeof window === 'undefined') return null

  try {
    const raw = getStoredSession()
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function readLocalState(key, fallback) {
  if (typeof window === 'undefined') return fallback

  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function writeLocalState(key, value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore local storage failures
  }
}

function formatDate(value) {
  if (!value) return 'Recently'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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
  const [session] = useState(readStoredSession)
  const [loading, setLoading] = useState(true)
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
    ...(readLocalState(STORAGE_KEYS.profilePreferences, null)?.notificationPrefs || {}),
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
  const [openPostMenu, setOpenPostMenu] = useState(null)
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [badges, setBadges] = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [userPosts, setUserPosts] = useState([])
  const [stats, setStats] = useState({
    followers: 0,
    following: 0,
    posts: 0,
    points: 0,
  })
  const [saving, setSaving] = useState(false)
  const levelName = `Level ${profile.level || 1}`

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
        const [{ data: userData }, { data: profileData }, { data: followSummary }, { data: badgeRows }, { data: activityRows }, { data: blogsData }, { data: threadsData }, { data: eventsData }, { data: profileContent }] = await Promise.all([
          supabase
            .from('info_users')
            .select('id, email, full_name, profile_image_url, bio, city, country, points, level, created_at, user_type')
            .eq('id', fallbackUserId)
            .maybeSingle(),
          supabase
            .from('profiles')
            .select('*')
            .eq('user_id', fallbackUserId)
            .maybeSingle(),
          fetch(`/api/users/${fallbackUserId}`, { credentials: 'same-origin' }).then(async (response) => {
            const result = await response.json()
            if (!response.ok || !result.success) throw new Error(result.message || 'Failed to load follow relationships')
            return { data: result }
          }),
          supabase
            .from('user_badges')
            .select('*')
            .eq('user_id', fallbackUserId)
            .order('earned_at', { ascending: false }),
          supabase
            .from('user_activity_log')
            .select('*')
            .eq('user_id', fallbackUserId)
            .order('created_at', { ascending: false })
            .limit(6),
          supabase
            .from('info_blogs')
            .select('*')
            .eq('created_by', fallbackUserId)
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
            .order('start_date', { ascending: false }),
          fetch(`/api/users/${fallbackUserId}`, { credentials: 'same-origin' }).then(async (response) => {
            const result = await response.json()
            if (!response.ok || !result.success) throw new Error(result.message || 'Failed to load profile content')
            return { data: result.content || {} }
          }),
        ])

        const mergedLocation = profileData?.location || [userData?.city, userData?.country].filter(Boolean).join(', ') || 'Daet, Camarines Norte'
        const nextProfile = {
          full_name: profileData?.full_name || userData?.full_name || fallbackName,
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
            href: `/user/posts/${post.id}`,
            media: post.featured_image || (post.images || [])[0] || '',
            pinned: false,
            accent: 'bg-amber-100 text-amber-700',
          }))),
          ...(blogsData || []).map((blog) => ({
            id: blog.id,
            type: 'Blog',
            title: blog.title || 'Untitled blog',
            content: blog.excerpt || blog.content || 'Shared a new story.',
            created_at: blog.published_at || blog.created_at,
            category: blog.category || 'Story',
            href: `/user/blogs/${blog.id}`,
            media: blog.featured_image || '',
            pinned: Boolean(blog.is_pinned || blog.pinned),
            accent: 'bg-sky-100 text-sky-700',
          })),
          ...(threadsData || []).map((thread) => ({
            id: thread.id,
            type: 'Forum',
            title: thread.title || 'Community discussion',
            content: thread.content || 'Started a new discussion.',
            created_at: thread.created_at,
            category: thread.tags?.[0] || 'Community',
            href: `/user/forums/${thread.id}`,
            media: '',
            pinned: Boolean(thread.is_pinned || thread.pinned),
            accent: 'bg-cyan-100 text-cyan-700',
          })),
          ...(eventsData || []).map((event) => ({
            id: event.id,
            type: 'Event',
            title: event.title || 'Community event',
            content: event.description || 'Shared an upcoming event.',
            created_at: event.start_date || event.created_at,
            category: event.category || 'Event',
            href: `/user/events/${event.id}`,
            media: event.featured_image || (Array.isArray(event.images) ? event.images[0] : '') || '',
            pinned: Boolean(event.is_pinned || event.pinned),
            accent: 'bg-amber-100 text-amber-700',
          })),
          ...((profileContent?.reposts || []).map((repost) => {
            const typeMap = {
              blog: { type: 'Blog', category: repost.category || 'Story', href: `/user/blogs/${repost.original_content_id}`, accent: 'bg-sky-100 text-sky-700', content: repost.excerpt || repost.content || 'Shared a new story.' },
              forum_thread: { type: 'Forum', category: 'Community', href: `/user/forums/${repost.original_content_id}`, accent: 'bg-cyan-100 text-cyan-700', content: repost.content || 'Started a new discussion.' },
              event: { type: 'Event', category: repost.category || 'Event', href: `/user/events/${repost.original_content_id}`, accent: 'bg-amber-100 text-amber-700', content: repost.description || 'Shared an upcoming event.' },
              user_post: { type: 'Post', category: 'Community', href: `/user/posts/${repost.original_content_id}`, accent: 'bg-amber-100 text-amber-700', content: repost.content || 'Shared a community post.' },
            }
            const mapped = typeMap[repost.original_content_type] || typeMap.user_post
            return {
              id: `repost-${repost.repost_id}`,
              repost_id: repost.repost_id,
              reposted_by: repost.reposted_by || repost.user_id,
              type: mapped.type,
              title: repost.title || 'Shared content',
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
        setPrivacyLevel(profileData?.privacy_level || 'public')
        setLanguagePreference(profileData?.language_preference || 'en')
        setNotificationPrefs({
          emailAlerts: true,
          activityDigest: true,
          newFollowers: true,
          forumMentions: true,
          announcementAlerts: false,
          ...(profileData?.notification_preferences || {}),
        })
        setFollowers(followSummary?.followers || [])
        setFollowing(followSummary?.following || [])
        setBadges((badgeRows || []).map((badge) => ({ ...badge, badge_name: badge.badge_name || badge.name || 'Badge' })))
        setActivityLog((activityRows || []).map((item) => ({
          id: item.id,
          type: item.activity_type || 'activity',
          description: item.description || 'Updated profile activity',
          created_at: item.created_at,
        })))
        const engagementRefs = createdPosts.map((post) => ({
          type: post.type === 'Blog' ? 'blog' : post.type === 'Forum' ? 'forum_thread' : post.type === 'Event' ? 'event' : 'user_post',
          id: post.id,
        }))
        const engagementIds = [...new Set(engagementRefs.map((item) => item.id))]
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
          const type = post.type === 'Blog' ? 'blog' : post.type === 'Forum' ? 'forum_thread' : post.type === 'Event' ? 'event' : 'user_post'
          return { ...post, ...(engagementCounts.get(`${type}:${post.id}`) || { reactionsCount: 0, commentsCount: 0 }) }
        })
        setUserPosts(enrichedPosts)
        setStats({
          followers: followSummary?.followers_count ?? 0,
          following: followSummary?.following_count ?? 0,
          posts: enrichedPosts.length,
          points: userData?.points || nextProfile.points || 0,
        })
      } catch (error) {
        console.error('Profile fetch failed:', error)
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
        invalidateCachePrefix(`profile:user:${userId}`)
        return
      }

      const original = detail.original
      const repost = detail.repost
      if (!original || !repost?.id) return
      const typeMap = {
        blog: { type: 'Blog', category: 'Story', href: `/user/blogs/${repost.original_content_id}`, content: original.excerpt || original.content || 'Shared a new story.' },
        forum_thread: { type: 'Forum', category: 'Community', href: `/user/forums/${repost.original_content_id}`, content: original.content || 'Started a new discussion.' },
        event: { type: 'Event', category: 'Event', href: `/user/events/${repost.original_content_id}`, content: original.description || 'Shared an upcoming event.' },
        user_post: { type: 'Post', category: 'Community', href: `/user/posts/${repost.original_content_id}`, content: original.content || 'Shared a community post.' },
      }
      const mapped = typeMap[repost.original_content_type] || typeMap.user_post
      const nextPost = {
        id: `repost-${repost.id}`,
        original_content_id: repost.original_content_id,
        type: mapped.type,
        title: original.title || 'Shared content',
        content: mapped.content,
        created_at: repost.created_at,
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
        originalAuthor: original.author || null,
        original_post: { ...original, author: original.author || null },
      }
      setUserPosts((previous) => [nextPost, ...previous.filter((post) => post.id !== nextPost.id)])
      setStats((previous) => ({ ...previous, posts: previous.posts + 1 }))
      invalidateCachePrefix(`profile:user:${userId}`)
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
      invalidateCachePrefix(`profile:user:${userId}`)
    }
    window.addEventListener('daet-repost-visibility-changed', handleRepostVisibilityChange)
    return () => window.removeEventListener('daet-repost-visibility-changed', handleRepostVisibilityChange)
  }, [userId])

  const visiblePosts = userPosts
  const pinnedPosts = useMemo(() => userPosts.filter((post) => post.pinned), [userPosts])

  const updateProfilePost = async (post, action) => {
    const isRepost = Boolean(post?.isRepost)
    const endpoint = isRepost ? `/api/reposts/${post.repost_id}` : `/api/posts/${post.id}`
    const isDelete = action === 'delete'
    if (isDelete && !window.confirm(isRepost ? 'Delete repost?\n\nThis removes only your repost.' : 'Delete post?\n\nThis permanently removes your post.')) return
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
    invalidateCachePrefix(`profile:user:${userId}`)
  }

  const handleSaveProfile = async () => {
    if (!userId) {
      setSaveNotice('Please sign in to update your profile.')
      return
    }

    setSaving(true)
    setSaveNotice('')

    try {
      const nextLocation = profileForm.location || [profileForm.city, profileForm.country].filter(Boolean).join(', ') || 'Daet, Camarines Norte'
      const baseProfile = {
        user_id: userId,
        full_name: profileForm.full_name,
        cover_photo_url: profileForm.cover_photo_url,
        bio: profileForm.bio,
        profile_image_url: profileForm.avatar_url || null,
        location: nextLocation,
        privacy_level: privacyLevel,
        language_preference: languagePreference,
        notification_preferences: notificationPrefs,
        is_public: privacyLevel !== 'private',
        updated_at: new Date().toISOString(),
      }

      const userUpdate = {
        full_name: profileForm.full_name,
        bio: profileForm.bio,
        city: profileForm.city,
        country: profileForm.country,
        profile_image_url: profileForm.avatar_url,
        updated_at: new Date().toISOString(),
      }

      const userResult = await supabase.from('info_users').update(userUpdate).eq('id', userId)
      const profileResult = await supabase.from('profiles').upsert(baseProfile, { onConflict: 'user_id' })

      if (userResult.error) throw userResult.error
      if (profileResult.error) throw profileResult.error

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
      updateStoredSession({
        full_name: updatedProfile.full_name,
        avatar_url: updatedProfile.avatar_url,
        profile_image_url: updatedProfile.avatar_url,
      })
      writeLocalState(STORAGE_KEYS.profilePreferences, {
        notificationPrefs,
      })
      invalidateCachePrefix(`profile:user:${userId}`)
      setSaveNotice('Profile updated successfully.')
    } catch (error) {
      console.error('Profile update failed:', error)
      setSaveNotice(error?.message || 'Unable to save changes right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="tourism-shell min-h-screen w-full overflow-x-clip">
      <div className="mx-auto w-full max-w-[1280px] px-0 pb-24 pt-0 sm:px-0 sm:pt-3 lg:px-6 lg:pb-10">
        <div className="tourism-panel overflow-hidden rounded-[22px]">
          <div className="profile-cover-frame h-40 bg-gradient-to-r from-sky-700 via-cyan-600 to-emerald-600 sm:h-56">
            {profile.cover_photo_url ? (
              <img src={profile.cover_photo_url} alt="Cover photo" className="profile-cover-image" />
            ) : null}
            <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),_transparent_28%),linear-gradient(135deg,_rgba(2,6,23,0.12),_rgba(15,23,42,0.35))]" />
          </div>

          <div className="border-b border-slate-200 px-4 pb-4 sm:px-7 sm:pb-5">
            <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-end gap-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-sky-100 text-2xl font-black text-sky-700 shadow-lg sm:h-24 sm:w-24">
                  {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.full_name} className="h-full w-full object-cover" /> : getInitials(profile.full_name)}
                </div>
                <div className="min-w-0 pb-1">
                  <h1 className="break-words text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{profile.full_name}</h1>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4 text-sky-600" />{profile.location}</p>
                </div>
              </div>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <Link href="/user/blogs/new" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-4 text-sm font-bold text-sky-700 hover:bg-sky-100">Create post</Link>
                <Link href="/user/profile/edit" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-slate-900 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800">Edit profile</Link>
                <div className="relative">
                  <button type="button" onClick={() => setProfileActionsOpen((value) => !value)} aria-label="Open profile actions" aria-expanded={profileActionsOpen} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  {profileActionsOpen && (
                    <div className="absolute right-0 top-12 z-20 w-44 overflow-hidden border border-slate-200 bg-white p-1.5 shadow-xl">
                      <Link href="/user/rewards" onClick={() => setProfileActionsOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-700"><Trophy className="h-4 w-4" />Rewards</Link>
                      <Link href="/user/profile/archive" onClick={() => setProfileActionsOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-700">Archive</Link>
                      <Link href="/user/settings" onClick={() => setProfileActionsOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Settings</Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 border-b border-[#dfe7e1] bg-[#fffefa] text-center">
            <div className="border-r border-slate-200 px-2 py-3"><p className="text-lg font-black text-slate-900">{stats.posts}</p><p className="text-[11px] text-slate-500">Posts</p></div>
            <Link href="/user/profile/connections?tab=followers" className="border-r border-slate-200 px-2 py-3 hover:bg-slate-50"><p className="text-lg font-black text-slate-900">{stats.followers}</p><p className="text-[11px] text-slate-500">Followers</p></Link>
            <Link href="/user/profile/connections?tab=following" className="px-2 py-3 hover:bg-slate-50"><p className="text-lg font-black text-slate-900">{stats.following}</p><p className="text-[11px] text-slate-500">Following</p></Link>
          </div>

          <div className="p-0">
            <section className="tourism-panel mb-5 rounded-[22px] p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">About</p>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{levelName}</span>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-700">{profile.bio}</p>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <span>{profile.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-slate-400" />
                    <span>{profile.email || 'No email available'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-slate-400" />
                    <span>{profile.points || 0} points</span>
                  </div>
              </div>

            </section>

          <div className="mt-3">
            <div className="min-w-0 p-0 sm:p-2">
            {pinnedPosts.length > 0 && <section className="mb-5 rounded-[22px] border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-black text-slate-900">Pinned content</h2><Star className="h-4 w-4 text-amber-500" /></div><div className="grid gap-2 sm:grid-cols-2">{pinnedPosts.slice(0, 4).map((post) => <Link key={`${post.type}-${post.id}`} href={post.href} className="rounded-xl bg-white/80 p-3 hover:bg-white"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">{post.type}</span><p className="mt-1 text-[13px] font-bold text-slate-800">{post.title}</p></Link>)}</div></section>}

            <section className="space-y-6">
              <div className="rounded-[16px] border border-slate-200 bg-white px-0 py-4 sm:py-5">
                <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="pl-2"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Wall</p><h2 className="mt-1 text-lg font-black text-slate-900">Shared content</h2></div>
                  <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                    <Link href="/user/blogs/new" className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 sm:flex-none">
                      <FileText className="h-4 w-4" /> Write blog
                    </Link>
                    <Link href="/user/forums" className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 sm:flex-none">
                      <MessageSquareText className="h-4 w-4" /> Start forum
                    </Link>
                  </div>
                </div>

                <div className="space-y-0">
                    {visiblePosts.length ? visiblePosts.map((post) => (
                      <article key={`${post.type}-${post.id}`} className={`tourism-panel feed-card overflow-hidden rounded-[22px] border border-slate-200 bg-white lg:rounded-[16px] ${post.type === 'Blog' ? 'border-l-4 border-l-violet-300 bg-violet-50/30' : post.type === 'Forum' ? 'border-l-4 border-l-emerald-300 bg-emerald-50/40' : post.type === 'Event' ? 'border-l-4 border-l-amber-200 bg-amber-50/30' : 'border-l-4 border-l-slate-200'}`}>
                        <div className="p-4 sm:p-5 lg:p-6">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-black uppercase text-sky-700 lg:h-12 lg:w-12">
                            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : getInitials(profile.full_name)}
                          </span>
                          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-600"><p className="truncate font-bold text-slate-900 lg:text-sm">{post.isRepost ? `${profile.full_name} 🔄 reposted` : profile.full_name}</p><span className="text-slate-400">·</span><time className="text-slate-500">{formatDate(post.created_at)}</time></div><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700"><span>{post.isRepost ? 'Repost' : post.type}</span>{post.type === 'Blog' && <span className="text-[10px] font-medium normal-case tracking-normal text-slate-500">Travel story</span>}</div></div>
                          <div className="relative shrink-0">
                            <button type="button" aria-label="Post options" aria-expanded={openPostMenu === `${post.type}-${post.id}`} onClick={() => setOpenPostMenu(openPostMenu === `${post.type}-${post.id}` ? null : `${post.type}-${post.id}`)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-500"><MoreHorizontal className="h-4 w-4" /></button>
                            {openPostMenu === `${post.type}-${post.id}` && <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                              {post.isRepost ? <>
                                <button type="button" onClick={() => void updateProfilePost(post, 'archive')} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50">Archive repost</button>
                                <button type="button" onClick={() => void updateProfilePost(post, 'delete')} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50">Delete repost</button>
                              </> : post.type === 'Post' && post.user_id === userId ? <>
                                <button type="button" onClick={() => void updateProfilePost(post, 'archive')} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50">Archive post</button>
                                <button type="button" onClick={() => void updateProfilePost(post, 'delete')} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50">Delete post</button>
                              </> : null}
                              <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}${post.href}`); setOpenPostMenu(null) }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">Copy link</button>
                            </div>}
                          </div>
                        </div>

                        {post.isRepost && post.repostQuote && <p className="mb-3 text-[13px] leading-6 text-slate-700">{post.repostQuote}</p>}
                        {post.isRepost && <div className="mb-3 flex items-center gap-2 text-xs text-slate-500"><span className="font-semibold text-slate-700">Originally shared by</span><span>{post.originalAuthor?.full_name || 'Community member'}</span></div>}
                        <Link href={post.href} className="mt-2 block"><h3 className="break-words text-left text-[15px] font-extrabold leading-5 text-slate-950 hover:text-sky-700 sm:text-base lg:text-lg lg:leading-7">{post.title}</h3></Link>
                        <p className="mt-3 break-words text-[13px] leading-5 text-slate-600 lg:text-[15px] lg:leading-7">{post.content}</p>
                        {(post.images?.length > 0 || post.videos?.length > 0 || post.video_url || post.media) && <div className="mt-4 grid gap-1 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-100 lg:mt-5 lg:rounded-[18px] sm:grid-cols-2">
                          {(post.images?.length ? post.images : (post.media ? [post.media] : [])).map((url, index) => <Link key={`${url}-${index}`} href={post.href} className="block"><img src={url} alt={`${post.title || 'Post'} ${index + 1}`} className="aspect-[16/8.5] w-full object-cover transition hover:brightness-95" /></Link>)}
                          {(post.videos?.length ? post.videos : (post.video_url ? [post.video_url] : [])).map((url, index) => <video key={`${url}-${index}`} src={url} controls className="aspect-[16/8.5] w-full object-cover" preload="metadata" />)}
                        </div>}

                        <ProfileFeedActions post={post} userId={userId} />
                        </div>
                      </article>
                    )) : (
                      <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                        You haven’t shared anything yet.
                      </div>
                    )}
                </div>
              </div>

              <div id="profile-editor" className="hidden rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-sky-600" />
                  <h3 className="text-lg font-bold text-slate-900">Edit profile</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
                    <input
                      value={profileForm.full_name}
                      onChange={(event) => setProfileForm((previous) => ({ ...previous, full_name: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
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
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
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
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Location</label>
                    <input
                      value={profileForm.location}
                      onChange={(event) => setProfileForm((previous) => ({ ...previous, location: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Bio</label>
                    <textarea
                      rows={4}
                      value={profileForm.bio}
                      onChange={(event) => setProfileForm((previous) => ({ ...previous, bio: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
                    />
                  </div>

                  <div id="privacy" className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-700">Avatar</p>
                      <MediaUpload
                        bucket="profile-media"
                        folder={`users/${userId || 'me'}`}
                        mediaType="image"
                        existingMediaUrl={profileForm.avatar_url}
                        buttonText="Upload avatar"
                        onUploadComplete={(url) => setProfileForm((previous) => ({ ...previous, avatar_url: url }))}
                        onUploadError={(message) => setSaveNotice(message)}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-700">Cover photo</p>
                      <MediaUpload
                        bucket="profile-media"
                        folder={`covers/${userId || 'me'}`}
                        mediaType="image"
                        existingMediaUrl={profileForm.cover_photo_url}
                        previewClassName="h-32 w-full max-w-lg aspect-[3/1]"
                        buttonText="Upload cover"
                        onUploadComplete={(url) => setProfileForm((previous) => ({ ...previous, cover_photo_url: url }))}
                        onUploadError={(message) => setSaveNotice(message)}
                      />
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-3">
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

                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-sm font-medium text-slate-700">Language</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[
                        { code: 'en', label: 'English' },
                        { code: 'fil', label: 'Filipino' },
                        { code: 'es', label: 'Español' },
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
        </div>
        </div>

        {loading ? (
          <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            Loading your profile...
          </div>
        ) : null}
      </div>
    </main>
  )
}
