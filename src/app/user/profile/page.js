'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  Briefcase,
  Camera,
  Check,
  FilePenLine,
  FileText,
  Globe,
  MapPin,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PencilLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Wand2,
} from 'lucide-react'
import MediaUpload from '@/app/components/MediaUpload'
import MobileNav from '@/app/components/user/MobileNav'
import { supabase } from '@/lib/supabase'
import { getStoredSession } from '@/lib/authCookies'

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

function getLevelName(points) {
  if (points >= 2500) return 'Local Legend'
  if (points >= 1500) return 'Trusted Explorer'
  if (points >= 800) return 'Community Guide'
  if (points >= 350) return 'Seasoned Traveler'
  if (points >= 120) return 'Curious Discoverer'
  return 'New Explorer'
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
  const [showMenu, setShowMenu] = useState(false)
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
  const [privacyLevel, setPrivacyLevel] = useState(() => readLocalState(STORAGE_KEYS.profilePreferences, null)?.privacyLevel || 'public')
  const [languagePreference, setLanguagePreference] = useState(() => readLocalState(STORAGE_KEYS.profilePreferences, null)?.languagePreference || 'en')
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

  useEffect(() => {
    const currentSession = readStoredSession()

    const fallbackUserId = currentSession?.user_id || currentSession?.id || currentSession?.userId || currentSession?.sub || ''
    const fallbackName = currentSession?.full_name || currentSession?.user_name || currentSession?.userName || currentSession?.email?.split('@')[0] || 'Traveler'
    const fallbackEmail = currentSession?.email || currentSession?.user_email || ''
    const fallbackLocation = currentSession?.city && currentSession?.country
      ? `${currentSession.city}, ${currentSession.country}`
      : 'Daet, Camarines Norte'

    setProfileForm((previous) => ({
      ...previous,
      full_name: fallbackName,
      email: fallbackEmail,
      city: currentSession?.city || '',
      country: currentSession?.country || '',
      location: fallbackLocation,
    }))

    setProfile((previous) => ({
      ...previous,
      full_name: fallbackName,
      email: fallbackEmail,
      location: fallbackLocation,
      points: currentSession?.points || 0,
      reputation: currentSession?.reputation || 0,
      level: currentSession?.level || 1,
    }))

    setUserId(fallbackUserId)
    if (!fallbackUserId) {
      setLoading(false)
      return
    }

    const loadProfile = async () => {
      try {
        const [{ data: userData }, { data: profileData }, { data: followRows }, { data: badgeRows }, { data: activityRows }, { data: blogsData }, { data: threadsData }, { data: eventsData }] = await Promise.all([
          supabase
            .from('info_users')
            .select('id, email, full_name, profile_image_url, bio, city, country, points, reputation, level, created_at, user_type')
            .eq('id', fallbackUserId)
            .maybeSingle(),
          supabase
            .from('profiles')
            .select('*')
            .eq('user_id', fallbackUserId)
            .maybeSingle(),
          supabase
            .from('user_follows')
            .select('id, follower_id, following_id, created_at')
            .or(`follower_id.eq.${fallbackUserId},following_id.eq.${fallbackUserId}`),
          supabase
            .from('user_badges')
            .select('*')
            .eq('user_id', fallbackUserId)
            .order('awarded_at', { ascending: false }),
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
        ])

        const relatedIds = Array.from(
          new Set(
            (followRows || [])
              .flatMap((row) => [row.follower_id, row.following_id])
              .filter(Boolean)
          )
        )

        let relatedUsersById = {}
        if (relatedIds.length > 0) {
          const { data: relatedUsers } = await supabase
            .from('info_users')
            .select('id, full_name, profile_image_url')
            .in('id', relatedIds)

          relatedUsersById = Object.fromEntries((relatedUsers || []).map((user) => [user.id, user]))
        }

        const followingRows = (followRows || []).filter((row) => row.follower_id === fallbackUserId)
        const followerRows = (followRows || []).filter((row) => row.following_id === fallbackUserId)

        const nextFollowers = followerRows.map((row) => relatedUsersById[row.follower_id] || { id: row.follower_id, full_name: 'Community member', profile_image_url: '' })
        const nextFollowing = followingRows.map((row) => relatedUsersById[row.following_id] || { id: row.following_id, full_name: 'Community member', profile_image_url: '' })

        const mergedLocation = profileData?.location || [userData?.city, userData?.country].filter(Boolean).join(', ') || 'Daet, Camarines Norte'
        const nextProfile = {
          full_name: profileData?.full_name || userData?.full_name || fallbackName,
          email: userData?.email || fallbackEmail,
          bio: profileData?.bio || userData?.bio || 'Tell the community what kind of experiences you love most.',
          avatar_url: profileData?.profile_image_url || userData?.profile_image_url || '',
          cover_photo_url: profileData?.cover_photo_url || '',
          location: mergedLocation,
          points: userData?.points || 0,
          reputation: userData?.reputation || 0,
          level: userData?.level || 1,
          created_at: userData?.created_at || new Date().toISOString(),
        }

        const createdPosts = [
          ...(blogsData || []).map((blog) => ({
            id: blog.id,
            type: 'Blog',
            title: blog.title || 'Untitled blog',
            content: blog.excerpt || blog.content || 'Shared a new story.',
            created_at: blog.published_at || blog.created_at,
            category: blog.category || 'Story',
            href: blog.slug ? `/user/blogs/${blog.slug}` : `/user/blogs/${blog.id}`,
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
        setFollowers(nextFollowers)
        setFollowing(nextFollowing)
        setBadges((badgeRows || []).map((badge) => ({ ...badge, badge_name: badge.badge_name || badge.name || 'Badge' })))
        setActivityLog((activityRows || []).map((item) => ({
          id: item.id,
          type: item.activity_type || 'activity',
          description: item.description || 'Updated profile activity',
          created_at: item.created_at,
        })))
        setUserPosts(createdPosts)
        setStats({
          followers: nextFollowers.length,
          following: nextFollowing.length,
          posts: createdPosts.length,
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

  const levelName = useMemo(() => getLevelName(profile.points || stats.points || 0), [profile.points, stats.points])
  const visiblePosts = userPosts
  const pinnedPosts = useMemo(() => userPosts.filter((post) => post.pinned), [userPosts])

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
        location: nextLocation,
        privacy_level: privacyLevel,
        language_preference: languagePreference,
        notification_preferences: notificationPrefs,
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
      writeLocalState(STORAGE_KEYS.profilePreferences, {
        privacyLevel,
        languagePreference,
        notificationPrefs,
      })
      setSaveNotice('Profile updated successfully.')
    } catch (error) {
      console.error('Profile update failed:', error)
      setSaveNotice(error?.message || 'Unable to save changes right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen w-full overflow-x-clip bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] text-slate-900">
      <MobileNav />
      <div className="mx-auto w-full max-w-[1280px] px-3 pb-24 pt-0 sm:px-5 sm:pt-3 lg:px-8 lg:pb-10">
        <header className="sticky top-0 z-30 mb-4 rounded-[22px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_12px_35px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:top-2 sm:p-4 lg:rounded-[26px]">
          <div className="flex items-center justify-between gap-3">
            <Link href="/user/dashboard" className="flex min-w-0 shrink-0 items-center gap-2">
              <img src="/logo.png" alt="Daet tourism logo" className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-black tracking-tight text-sky-700 sm:text-base">Daet Connect</span>
                <span className="block truncate text-[10px] font-medium text-slate-500 sm:text-xs">My profile</span>
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <Link href="/user/rewards" aria-label="Open rewards" className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600 transition hover:bg-amber-200">
                <Star className="h-5 w-5" />
              </Link>
              <div className="relative">
                <button type="button" onClick={() => setShowMenu((value) => !value)} aria-label="Open profile settings" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-sky-50 hover:text-sky-700">
                  <Menu className="h-5 w-5" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-12 z-40 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <Link href="/user/profile/edit" onClick={() => setShowMenu(false)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                      <PencilLine className="h-4 w-4" /> Edit profile
                    </Link>
                    <Link href="/user/drafts" onClick={() => setShowMenu(false)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                      <FilePenLine className="h-4 w-4" /> Drafts
                    </Link>
                    <Link href="/user/settings" onClick={() => setShowMenu(false)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                      <Settings className="h-4 w-4" /> Settings
                    </Link>
                    <Link href="/user/profile#privacy" onClick={() => setShowMenu(false)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                      <ShieldCheck className="h-4 w-4" /> Privacy
                    </Link>
                    <Link href="/user/notifications" onClick={() => setShowMenu(false)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                      <Bell className="h-4 w-4" /> Notifications
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_8px_25px_rgba(15,23,42,0.06)]">
          <div className="relative h-56 bg-gradient-to-r from-sky-700 via-cyan-600 to-emerald-600 sm:h-64">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),_transparent_28%),linear-gradient(135deg,_rgba(2,6,23,0.12),_rgba(15,23,42,0.35))]" />
            {profile.cover_photo_url ? (
              <img src={profile.cover_photo_url} alt="Cover photo" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}

            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-6">
              <div className="flex min-w-0 items-end justify-between gap-3">
                <div className="flex min-w-0 items-end gap-3">
                  <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-200 text-2xl font-bold text-slate-700 shadow-lg sm:h-24 sm:w-24">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.full_name} className="h-full w-full object-cover" />
                    ) : (
                      getInitials(profile.full_name)
                    )}
                    <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white shadow-sm">
                      <Camera className="h-3.5 w-3.5" />
                    </div>
                  </div>

                  <div className="min-w-0 pb-2 text-white">
                    <div className="flex items-center flex-wrap gap-2">
                      <h2 className="min-w-0 break-words text-lg font-black sm:text-2xl">{profile.full_name}</h2>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-50">
                        <Sparkles className="h-3 w-3" />
                        {levelName}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-cyan-50/90">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {profile.location}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 pb-1">
                  <Link href="/user/profile/edit" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100 sm:h-auto sm:px-4 sm:py-2.5 sm:text-sm">
                    <PencilLine className="h-4 w-4" />
                    <span className="hidden sm:inline">Edit profile</span>
                  </Link>

                  <Link href="/user/settings" aria-label="Open profile settings" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/15 sm:h-10 sm:w-10">
                    <MoreHorizontal className="h-5 w-5" />
                  </Link>

                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 border-b border-slate-200 bg-white text-center">
            <div className="border-r border-slate-200 px-2 py-3"><p className="text-lg font-black text-slate-900">{stats.posts}</p><p className="text-[11px] text-slate-500">Posts</p></div>
            <div className="border-r border-slate-200 px-2 py-3"><p className="text-lg font-black text-slate-900">{stats.followers}</p><p className="text-[11px] text-slate-500">Followers</p></div>
            <div className="px-2 py-3"><p className="text-lg font-black text-slate-900">{stats.following}</p><p className="text-[11px] text-slate-500">Following</p></div>
          </div>

          <div className="p-4 sm:p-6">
            <section className="mb-5 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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

            {pinnedPosts.length > 0 && <section className="mb-5 rounded-[22px] border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-black text-slate-900">Pinned content</h2><Star className="h-4 w-4 text-amber-500" /></div><div className="grid gap-2 sm:grid-cols-2">{pinnedPosts.slice(0, 4).map((post) => <Link key={`${post.type}-${post.id}`} href={post.href} className="rounded-xl bg-white/80 p-3 hover:bg-white"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">{post.type}</span><p className="mt-1 text-[13px] font-bold text-slate-800">{post.title}</p></Link>)}</div></section>}

            <section className="space-y-6">
              <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Wall</p><h2 className="mt-1 text-lg font-black text-slate-900">Shared content</h2></div>
                  <div className="flex items-center gap-2">
                    <Link href="/user/blogs/new" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                      <FileText className="h-4 w-4" /> Write blog
                    </Link>
                    <Link href="/user/forums" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                      <MessageSquareText className="h-4 w-4" /> Start forum
                    </Link>
                  </div>
                </div>

                <div className="space-y-4">
                    {visiblePosts.length ? visiblePosts.map((post) => (
                      <div key={`${post.type}-${post.id}`} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${post.accent}`}>
                              {post.type}
                            </span>
                            <span className="text-xs text-slate-500">{post.category}</span>
                          </div>
                          <span className="text-xs text-slate-500">{formatDate(post.created_at)}</span>
                        </div>

                        <h3 className="text-base font-bold leading-6 text-slate-900">{post.title}</h3>
                        <p className="mt-2 text-[13px] leading-6 text-slate-600">{post.content}</p>

                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{post.type === 'Blog' ? 'Story' : 'Community'}</span>
                          </div>
                          <Link href={post.href} className="text-sm font-semibold text-sky-700">View post</Link>
                        </div>
                      </div>
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
                        onChange={(event) => setProfileForm((previous) => ({ ...previous, city: event.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
                      <input
                        value={profileForm.country}
                        onChange={(event) => setProfileForm((previous) => ({ ...previous, country: event.target.value }))}
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

        {loading ? (
          <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            Loading your profile...
          </div>
        ) : null}
      </div>
    </main>
  )
}
