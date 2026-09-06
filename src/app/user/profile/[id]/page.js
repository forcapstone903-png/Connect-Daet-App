'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, MapPin, UserPlus, Users } from 'lucide-react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  const profileId = params?.id
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [viewerId, setViewerId] = useState(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profileId) return

    const loadProfile = async () => {
      setLoading(true)
      setError('')

      try {
        const [{ data: userData, error: userError }, { data: authData }] = await Promise.all([
          supabase
            .from('info_users')
            .select('id, full_name, profile_image_url, bio, city, country, points, level, user_type')
            .eq('id', profileId)
            .maybeSingle(),
          supabase.auth.getUser(),
        ])

        if (userError) throw userError
        if (!userData) {
          setError('This profile could not be found.')
          return
        }

        const currentViewerId = authData?.user?.id || null
        setViewerId(currentViewerId)

        const [{ data: blogRows }, { data: threadRows }, { data: followRow }] = await Promise.all([
          supabase
            .from('info_blogs')
            .select('id, title, excerpt, created_at, published_at, category, slug')
            .eq('created_by', profileId)
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(6),
          supabase
            .from('forum_threads')
            .select('id, title, content, created_at, category_id')
            .eq('created_by', profileId)
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(6),
          currentViewerId && currentViewerId !== profileId
            ? supabase
                .from('user_follows')
                .select('id')
                .eq('follower_id', currentViewerId)
                .eq('following_id', profileId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ])

        setProfile(userData)
        setIsFollowing(Boolean(followRow))
        setPosts([
          ...(blogRows || []).map((post) => ({
            id: post.id,
            type: 'Blog',
            title: post.title,
            text: post.excerpt || 'Shared a new story with the community.',
            date: post.published_at || post.created_at,
            href: post.slug ? `/user/blogs/${post.slug}` : `/user/blogs/${post.id}`,
          })),
          ...(threadRows || []).map((post) => ({
            id: post.id,
            type: 'Forum',
            title: post.title,
            text: post.content || 'Started a community discussion.',
            date: post.created_at,
            href: `/user/forums/${post.id}`,
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
        const { error: deleteError } = await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', viewerId)
          .eq('following_id', profileId)
        if (deleteError) throw deleteError
        setIsFollowing(false)
      } else {
        const { error: insertError } = await supabase
          .from('user_follows')
          .insert({ follower_id: viewerId, following_id: profileId })
        if (insertError) throw insertError
        setIsFollowing(true)
      }
    } catch (followError) {
      console.error('Follow update failed:', followError)
      alert('Unable to update your follow right now.')
    } finally {
      setFollowLoading(false)
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-50 p-4"><div className="mx-auto max-w-2xl animate-pulse rounded-[24px] bg-white p-6 shadow-sm"><div className="h-8 w-40 rounded bg-slate-200" /><div className="mt-4 h-4 w-64 rounded bg-slate-200" /></div></main>
  }

  if (error || !profile) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="text-center"><p className="text-slate-600">{error || 'Profile unavailable.'}</p><Link href="/user/dashboard" className="mt-4 inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Back to dashboard</Link></div></main>
  }

  const location = [profile.city, profile.country].filter(Boolean).join(', ') || 'Daet, Camarines Norte'
  const isOwnProfile = viewerId === profile.id

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_35%,_#f1f5f9_100%)] px-3 pb-10 pt-3 text-slate-900 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/user/dashboard" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-700"><ArrowLeft className="h-4 w-4" />Back to dashboard</Link>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="h-28 bg-gradient-to-r from-sky-700 via-cyan-600 to-emerald-600 sm:h-36" />
          <div className="px-5 pb-5 sm:px-7">
            <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-3">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-sky-100 text-2xl font-black text-sky-700 shadow-md">
                  {profile.profile_image_url ? <img src={profile.profile_image_url} alt={profile.full_name} className="h-full w-full object-cover" /> : getInitials(profile.full_name)}
                </div>
                <div className="pb-1">
                  <h1 className="text-2xl font-black text-slate-900">{profile.full_name || 'Community member'}</h1>
                  <p className="mt-1 text-sm text-slate-500">Level {profile.level || 1} · {profile.points || 0} points</p>
                </div>
              </div>
              {!isOwnProfile && (
                <button type="button" onClick={toggleFollow} disabled={followLoading} className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition ${isFollowing ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'bg-sky-600 text-white hover:bg-sky-700'} disabled:opacity-60`}>
                  {isFollowing ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" />{location}</span>
              <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-400" />{posts.length} shared posts</span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{profile.bio || 'Sharing local experiences and community discoveries.'}</p>
          </div>
        </section>

        <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">Shared content</h2><span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{posts.length} posts</span></div>
          {posts.length ? <div className="space-y-3">{posts.map((post) => <Link key={`${post.type}-${post.id}`} href={post.href} className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">{post.type}</span><h3 className="mt-1 font-bold text-slate-900">{post.title}</h3><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{post.text}</p></Link>)}</div> : <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No published content yet.</p>}
        </section>
      </div>
    </main>
  )
}
