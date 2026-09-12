'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, Check, FileText, MapPin, MessageCircle, MoreHorizontal, UserPlus, Users } from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import UserProfileLink from '@/app/components/user/UserProfileLink'

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'T'
}

export default function PublicProfilePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const profileId = params?.id
  const fromReactions = searchParams.get('from') === 'reactions'
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [followers, setFollowers] = useState([])
  const [following, setFollowing] = useState([])
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [viewerId, setViewerId] = useState(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isFollowedBy, setIsFollowedBy] = useState(false)
  const [isMutual, setIsMutual] = useState(false)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profileId) return

    const loadProfile = async () => {
      setLoading(true)
      setError('')

      try {
        const profileResponse = await fetch(`/api/users/${profileId}`, { credentials: 'same-origin' })
        const profileResult = await profileResponse.json()

        if (!profileResponse.ok || !profileResult.success) {
          setError(profileResult.message || 'This profile could not be found.')
          return
        }

        const currentViewerId = profileResult.viewer_id || null
        const content = profileResult.content || {}
        setViewerId(currentViewerId)
        setProfile(profileResult.profile)
        setIsFollowing(Boolean(profileResult.is_following))
        setIsFollowedBy(Boolean(profileResult.is_followed_by))
        setIsMutual(Boolean(profileResult.is_mutual))
        setFollowers(profileResult.followers || [])
        setFollowing(profileResult.following || [])
        setFollowerCount(profileResult.followers_count ?? profileResult.followers?.length ?? 0)
        setFollowingCount(profileResult.following_count ?? profileResult.following?.length ?? 0)
        setPosts([
          ...(content.user_posts || []).map((post) => ({
            id: post.id,
            type: 'Post',
            title: post.title,
            text: post.content || 'Shared a community post.',
            date: post.created_at,
            href: `/user/posts/${post.id}`,
          })),
          ...(content.blogs || []).map((post) => ({
            id: post.id,
            type: 'Blog',
            title: post.title,
            text: post.excerpt || 'Shared a new story with the community.',
            date: post.published_at || post.created_at,
            href: `/user/blogs/${post.id}`,
          })),
          ...(content.threads || []).map((post) => ({
            id: post.id,
            type: 'Forum',
            title: post.title,
            text: post.content || 'Started a community discussion.',
            date: post.created_at,
            href: `/user/forums/${post.id}`,
          })),
          ...(content.events || []).map((post) => ({
            id: post.id,
            type: 'Event',
            title: post.title,
            text: post.description || 'Shared a community event.',
            date: post.start_date || post.created_at,
            href: `/user/events/${post.id}`,
          })),
        ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)))
      } catch (loadError) {
        console.error('Public profile load failed:', loadError)
        setError('Unable to load this profile right now.')
      } finally {
        setLoading(false)
      }
    }

    void loadProfile()
  }, [profileId])

  const toggleFollow = async () => {
    if (!viewerId) {
      alert('Please log in to follow this user.')
      return
    }

    setFollowLoading(true)
    try {
      if (isFollowing) {
        const response = await fetch(`/api/users/${profileId}/follow`, { method: 'DELETE', credentials: 'same-origin' })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to unfollow this user.')
        setIsFollowing(Boolean(result.is_following))
        setIsMutual(Boolean(result.is_mutual))
        setFollowerCount(result.followers_count ?? 0)
        setFollowingCount(result.following_count ?? 0)
      } else {
        const response = await fetch(`/api/users/${profileId}/follow`, { method: 'POST', credentials: 'same-origin' })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to follow this user.')
        setIsFollowing(Boolean(result.is_following))
        setIsFollowedBy(Boolean(result.is_followed_by))
        setIsMutual(Boolean(result.is_mutual))
        setFollowerCount(result.followers_count ?? 0)
        setFollowingCount(result.following_count ?? 0)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('daet-notifications-updated'))
        }
      }
    } catch (followError) {
      console.error('Follow update failed:', followError?.message || followError)
      alert(followError?.message || 'Unable to update your follow right now.')
    } finally {
      setFollowLoading(false)
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-50 p-4"><div className="mx-auto max-w-2xl animate-pulse rounded-[24px] bg-white p-6 shadow-sm"><div className="h-8 w-40 rounded bg-slate-200" /><div className="mt-4 h-4 w-64 rounded bg-slate-200" /></div></main>
  }

  if (error || !profile) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="text-center"><p className="text-slate-600">{error || 'Profile unavailable.'}</p></div></main>
  }

  const location = [profile.city, profile.country].filter(Boolean).join(', ') || 'Daet, Camarines Norte'
  const isOwnProfile = viewerId === profile.id
  const typeStyles = {
    Post: { icon: MessageCircle, tone: 'bg-amber-50 text-amber-700', label: 'Community post' },
    Blog: { icon: FileText, tone: 'bg-sky-50 text-sky-700', label: 'Travel story' },
    Forum: { icon: MessageCircle, tone: 'bg-cyan-50 text-cyan-700', label: 'Discussion' },
    Event: { icon: CalendarDays, tone: 'bg-emerald-50 text-emerald-700', label: 'Event' },
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-[1280px] px-3 pb-24 sm:px-5 sm:pb-10 lg:px-8">
        {fromReactions && (
          <div className="pt-3 sm:pt-5">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back to reactions"
              title="Back to reactions"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
        )}
        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_8px_25px_rgba(15,23,42,0.06)]">
          <div className="profile-cover-frame h-40 bg-gradient-to-r from-sky-700 via-cyan-600 to-emerald-600 sm:h-56">
            {profile.cover_photo_url && <img src={profile.cover_photo_url} alt={`${profile.full_name || 'User'} cover`} className="profile-cover-image" />}
            <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),_transparent_28%),linear-gradient(135deg,_rgba(2,6,23,0.12),_rgba(15,23,42,0.35))]" />
          </div>
          <div className="border-b border-slate-200 px-4 pb-4 sm:px-7 sm:pb-5">
            <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 items-end gap-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-sky-100 text-2xl font-black text-sky-700 shadow-lg sm:h-24 sm:w-24">
                  {profile.profile_image_url ? <img src={profile.profile_image_url} alt={profile.full_name} className="h-full w-full object-cover" /> : getInitials(profile.full_name)}
                </div>
                <div className="min-w-0 pb-1">
                  <h1 className="break-words text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{profile.full_name || 'Community member'}</h1>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4 text-sky-600" />{location}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOwnProfile ? <Link href="/user/blogs/new" className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-700 hover:bg-sky-100">Create post</Link> : (
                  <>
                  <button type="button" onClick={toggleFollow} disabled={followLoading} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-black transition ${isFollowing ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'bg-sky-600 text-white shadow-sm hover:bg-sky-700'} disabled:opacity-60`}>
                    {isFollowing ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                    {followLoading ? 'Updating...' : isFollowing ? 'Following' : isFollowedBy && !isMutual ? 'Follow Back' : 'Follow'}
                  </button>
                  {isMutual && (
                    <Link href={`/user/messaging/${encodeURIComponent(profile.id)}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                      <MessageCircle className="h-4 w-4" />
                      Message
                    </Link>
                  )}
                  </>
                )}
                <Link href="/user/settings" aria-label="Open profile settings" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><MoreHorizontal className="h-5 w-5" /></Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 border-b border-slate-200 bg-white text-center">
            <div className="border-r border-slate-200 px-2 py-3"><p className="text-lg font-black text-slate-900">{posts.length}</p><p className="text-[11px] text-slate-500">Posts</p></div>
            <Link href={`/user/profile/connections?user=${profile.id}&tab=followers`} className="border-r border-slate-200 px-2 py-3 hover:bg-slate-50"><p className="text-lg font-black text-slate-900">{followerCount}</p><p className="text-[11px] text-slate-500">Followers</p></Link>
            <Link href={`/user/profile/connections?user=${profile.id}&tab=following`} className="px-2 py-3 hover:bg-slate-50"><p className="text-lg font-black text-slate-900">{followingCount}</p><p className="text-[11px] text-slate-500">Following</p></Link>
          </div>

          <div className="p-4 sm:p-6"><section className="mb-5 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">About</p><p className="max-w-3xl text-sm leading-6 text-slate-700">{profile.bio || 'Sharing local experiences and community discoveries.'}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-600"><span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" />{location}</span><span className="flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" />{profile.points || 0} points</span></div></section></div>
        </section>

        <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 border-x border-slate-200 bg-white sm:rounded-2xl sm:border">
            <div className="grid grid-cols-4 border-b border-slate-200 text-center text-xs font-bold text-slate-500">
              <button type="button" className="border-b-2 border-sky-600 px-2 py-3 text-sky-700">Posts</button>
              <button type="button" className="px-2 py-3 hover:bg-slate-50">Replies</button>
              <button type="button" className="px-2 py-3 hover:bg-slate-50">Media</button>
              <button type="button" className="px-2 py-3 hover:bg-slate-50">Likes</button>
            </div>
            <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">Activity</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Shared content <span className="ml-1 text-xs font-bold text-slate-400">{posts.length}</span></h2>
            </div>
            {posts.length ? <div className="space-y-3 px-4 py-3 sm:px-6">{posts.map((post) => { const meta = typeStyles[post.type] || typeStyles.Post; const Icon = meta.icon; return <Link key={`${post.type}-${post.id}`} href={post.href} className="group block rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"><div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className={`text-[10px] font-black uppercase tracking-[0.16em] ${meta.tone.split(' ')[1]}`}>{meta.label}</span><span className="text-[11px] text-slate-400">{post.date ? new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'}</span></div><h3 className="mt-1 break-words font-black text-slate-900 group-hover:text-sky-700">{post.title || 'Untitled community update'}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{post.text}</p></div></div></Link> })}</div> : <div className="p-8 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-600">No published content yet</p><p className="mt-1 text-xs text-slate-400">Their travel stories and community updates will appear here.</p></div>}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Followers</p><span className="text-xs font-bold text-slate-500">{followers.length}</span></div>{followers.length ? <div className="space-y-2">{followers.map((person) => <UserProfileLink key={person.id} user={person} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50"><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-[10px] font-bold text-sky-700">{person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(person.full_name)}</span><span className="truncate text-sm font-semibold text-slate-700">{person.full_name || 'Community member'}</span></UserProfileLink>)}</div> : <p className="text-sm text-slate-500">No followers yet.</p>}</div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Following</p><span className="text-xs font-bold text-slate-500">{following.length}</span></div>{following.length ? <div className="space-y-2">{following.map((person) => <UserProfileLink key={person.id} user={person} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50"><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">{person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(person.full_name)}</span><span className="truncate text-sm font-semibold text-slate-700">{person.full_name || 'Community member'}</span></UserProfileLink>)}</div> : <p className="text-sm text-slate-500">Not following anyone yet.</p>}</div>
            </div>
            <div className="rounded-[24px] bg-slate-950 p-5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.14)]"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Traveler snapshot</p><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-black">{profile.points || 0}</p><p className="mt-1 text-[11px] text-slate-300">Points</p></div><div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-black">{posts.length}</p><p className="mt-1 text-[11px] text-slate-300">Shared</p></div></div><p className="mt-4 text-xs leading-5 text-slate-300">Follow this traveler to keep their Daet stories and community discoveries close to your feed.</p></div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Profile details</p><div className="mt-4 space-y-3 text-sm text-slate-600"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-sky-600" />{location}</div><div className="flex items-center gap-2"><Users className="h-4 w-4 text-sky-600" />Community member</div></div></div>
          </aside>
        </div>
      </div>
    </main>
  )
}
