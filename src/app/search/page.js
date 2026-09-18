'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search as SearchIcon, MapPin, CalendarDays, MessageSquare, Compass, Newspaper, X, Sparkles, ArrowRight, SlidersHorizontal, UserRound, AtSign, ExternalLink, UserPlus, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import UserTopHeader from '@/app/components/user/UserTopHeader'
import UserProfileLink from '@/app/components/user/UserProfileLink'
import UserSectionHeader from '@/app/components/user/UserSectionHeader'
import { Suspense } from 'react'

const defaultSpotImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80'
const defaultBlogImage = 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80'
const popularSearches = ['Bagasbas Beach', 'Calaguas', 'Daet events', 'local food', 'travel stories']

function SearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQuery = searchParams?.get('q') || ''
  const [query, setQuery] = useState(initialQuery)
  const [searchFocused, setSearchFocused] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [recentSearches, setRecentSearches] = useState(() => {
    if (typeof window === 'undefined') return []

    try {
      const storedSearches = JSON.parse(localStorage.getItem('daet_recent_searches') || '[]')
      return Array.isArray(storedSearches) ? storedSearches.slice(0, 5) : []
    } catch {
      return []
    }
  })
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [followingIds, setFollowingIds] = useState(new Set())
  const [authorProfiles, setAuthorProfiles] = useState({})
  const [followBusyId, setFollowBusyId] = useState(null)
  const [results, setResults] = useState({
    spots: [],
    events: [],
    blogs: [],
    threads: [],
    users: [],
    userContent: [],
    userComments: [],
    forumComments: [],
    mentions: [],
  })

  const saveRecentSearch = (value) => {
    const normalizedValue = value.trim()
    if (!normalizedValue) return
    const nextSearches = [normalizedValue, ...recentSearches.filter((entry) => entry.toLowerCase() !== normalizedValue.toLowerCase())].slice(0, 5)
    setRecentSearches(nextSearches)
    localStorage.setItem('daet_recent_searches', JSON.stringify(nextSearches))
  }

  useEffect(() => {
    const loadResults = async () => {
      setLoading(true)
      setError('')
      try {
        const q = query.trim().toLowerCase()

        if (!q) {
          setResults({ spots: [], events: [], blogs: [], threads: [], users: [], userContent: [], userComments: [], forumComments: [], mentions: [] })
          setLoading(false)
          return
        }

        const [{ data: sessionData }, spotsRes, eventsRes, blogsRes, threadsRes, usersResponse] = await Promise.all([
          supabase.auth.getSession(),
          supabase
            .from('info_tourist_spots')
            .select('*')
            .eq('status', 'active')
            .or(`name.ilike.%${q}%,location.ilike.%${q}%,category.ilike.%${q}%,description.ilike.%${q}%`),
          supabase
            .from('info_events')
            .select('*')
            .eq('status', 'published')
            .or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`),
          supabase
            .from('info_blogs')
            .select('*')
            .eq('status', 'published')
            .or(`title.ilike.%${q}%,excerpt.ilike.%${q}%,content.ilike.%${q}%,category.ilike.%${q}%`),
          supabase
            .from('forum_threads')
            .select('*')
            .eq('status', 'published')
            .or(`title.ilike.%${q}%,content.ilike.%${q}%`),
          fetch(`/api/search/users?q=${encodeURIComponent(q)}&limit=20`, { credentials: 'same-origin' }).then((response) => response.json()),
        ])

        const viewerId = sessionData?.session?.user?.id || null
        const { data: followingRows } = viewerId
          ? await supabase.from('user_follows').select('following_id').eq('follower_id', viewerId)
          : { data: [] }
        if (viewerId) setFollowingIds(new Set((followingRows || []).map((row) => row.following_id)))

        const authorIds = [...new Set([
          ...(blogsRes.data || []).map((item) => item.created_by),
          ...(eventsRes.data || []).map((item) => item.created_by),
          ...(threadsRes.data || []).map((item) => item.created_by),
        ].filter(Boolean))]
        if (authorIds.length) {
          const { data: authors } = await supabase.from('info_users').select('id, full_name, email, profile_image_url').in('id', authorIds)
          setAuthorProfiles(Object.fromEntries((authors || []).map((author) => [author.id, author])))
        } else {
          setAuthorProfiles({})
        }

        const users = usersResponse.success ? usersResponse.users || [] : []
        const forumIds = (threadsRes.data || []).map((thread) => thread.id).filter(Boolean)
        const { data: forumComments } = forumIds.length
          ? await supabase.from('content_comments').select('id, content_id, user_id, body, created_at, info_users(full_name, profile_image_url)').eq('content_type', 'forum_thread').eq('status', 'active').in('content_id', forumIds).ilike('body', `%${q}%`).order('created_at', { ascending: false })
          : { data: [] }
        const userIds = users.map((user) => user.id).filter(Boolean)
        let userContent = []
        let userComments = []
        let mentions = []

        if (userIds.length) {
          const [userPostsRes, blogsByUserRes, eventsByUserRes, threadsByUserRes, commentsRes, mentionsRes] = await Promise.all([
            supabase.from('info_user_posts').select('id, user_id, title, content, created_at').in('user_id', userIds).eq('status', 'published').order('created_at', { ascending: false }),
            supabase.from('info_blogs').select('id, created_by, title, excerpt, content, featured_image, created_at').in('created_by', userIds).eq('status', 'published').order('created_at', { ascending: false }),
            supabase.from('info_events').select('id, created_by, title, description, featured_image, start_date, location').in('created_by', userIds).eq('status', 'published').order('start_date', { ascending: false }),
            supabase.from('forum_threads').select('id, created_by, title, content, created_at').in('created_by', userIds).eq('status', 'published').order('created_at', { ascending: false }),
            supabase.from('content_comments').select('id, user_id, content_type, content_id, body, gif_url, sticker_url, created_at').in('user_id', userIds).eq('status', 'active').order('created_at', { ascending: false }),
            supabase.from('mentions').select('id, mentioned_user_id, content_type, content_id, mention_text, created_at').in('mentioned_user_id', userIds).order('created_at', { ascending: false }),
          ])
          userContent = [
            ...(userPostsRes.data || []).map((item) => ({ ...item, contentKind: 'post', authorId: item.user_id, href: `/user/profile/${item.user_id}` })),
            ...(blogsByUserRes.data || []).map((item) => ({ ...item, contentKind: 'blog', authorId: item.created_by, href: `/blog/${item.id}` })),
            ...(eventsByUserRes.data || []).map((item) => ({ ...item, contentKind: 'event', authorId: item.created_by, href: `/events/${item.id}` })),
            ...(threadsByUserRes.data || []).map((item) => ({ ...item, contentKind: 'forum', authorId: item.created_by, href: `/forum/${item.id}` })),
          ]
          userComments = commentsRes.data || []
          mentions = mentionsRes.data || []
        }

        setResults({
          spots: spotsRes.data || [],
          events: eventsRes.data || [],
          blogs: blogsRes.data || [],
          threads: threadsRes.data || [],
          users,
          userContent,
          userComments,
          forumComments: forumComments || [],
          mentions,
        })
      } catch (error) {
        console.error('Search failed:', error)
        setError('We could not complete your search right now. Please check your connection and try again.')
        setResults({ spots: [], events: [], blogs: [], threads: [], users: [], userContent: [], userComments: [], forumComments: [], mentions: [] })
      } finally {
        setLoading(false)
      }
    }

    const debounceTimer = setTimeout(loadResults, 300)
    return () => clearTimeout(debounceTimer)
  }, [query, refreshKey])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    saveRecentSearch(query)
    setSearchFocused(false)
    router.push(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  const toggleFollow = async (event, userId) => {
    event.preventDefault()
    event.stopPropagation()
    if (!userId || followBusyId === userId) return

    const isFollowing = followingIds.has(userId)
    setFollowBusyId(userId)
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/follow`, {
        method: isFollowing ? 'DELETE' : 'POST',
        credentials: 'same-origin',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update follow status.')
      setFollowingIds((previous) => {
        const next = new Set(previous)
        if (isFollowing) next.delete(userId)
        else next.add(userId)
        return next
      })
    } catch (followError) {
      console.error('Search follow update failed:', followError)
    } finally {
      setFollowBusyId(null)
    }
  }

  const suggestions = [
    ...results.spots.map((item) => item.name),
    ...results.events.map((item) => item.title),
    ...results.blogs.map((item) => item.title),
    ...results.threads.map((item) => item.title),
  ].filter((value, index, values) => value && values.indexOf(value) === index).slice(0, 5)

  const visibleSuggestions = query.trim() ? suggestions : popularSearches

  const communityCount = results.users.length + results.userContent.length + results.userComments.length + results.mentions.length
  const totalCount = results.spots.length + results.events.length + results.blogs.length + results.threads.length + communityCount

  const tabs = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'spots', label: 'Destinations', count: results.spots.length },
    { id: 'events', label: 'Events', count: results.events.length },
    { id: 'blogs', label: 'Blogs', count: results.blogs.length },
    { id: 'threads', label: 'Forums', count: results.threads.length },
    { id: 'people', label: 'People', count: results.users.length },
    { id: 'community', label: 'Community', count: communityCount },
  ]

  const formatDate = (value) => {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getImage = (item) => {
    const image = item.featured_image || item.image_url || (Array.isArray(item.images) && item.images[0])
    if (typeof image === 'string' && image.trim()) return image
    return item.category === 'blog' ? defaultBlogImage : defaultSpotImage
  }

  const getContentHref = (contentType, contentId) => {
    if (contentType === 'blog') return `/blog/${contentId}`
    if (contentType === 'forum_thread') return `/forum/${contentId}`
    if (contentType === 'event') return `/events/${contentId}`
    return `/search?q=${encodeURIComponent(query.trim())}`
  }

  const userNames = new Map(results.users.map((user) => [user.id, user.full_name || user.email || 'Community member']))
  const getAuthor = (authorId) => authorProfiles[authorId] || null

  const renderFollowButton = (authorId) => {
    if (!authorId || !authorProfiles[authorId]) return null
    const isFollowing = followingIds.has(authorId)
    return (
      <button type="button" onClick={(event) => toggleFollow(event, authorId)} disabled={followBusyId === authorId} className={`usr-press inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition ${isFollowing ? 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600' : 'bg-teal-700 text-white hover:bg-teal-800'}`}>
        {isFollowing ? <UserCheck className="h-2.5 w-2.5" /> : <UserPlus className="h-2.5 w-2.5" />}
        {isFollowing ? 'Following' : 'Follow'}
      </button>
    )
  }

  return (
    <main className="tourism-shell usr-section-page usr-search min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-5xl px-3 pb-28 pt-2 sm:px-4 sm:pb-12 lg:px-6">
        <UserSectionHeader
          eyebrow="Explore Daet"
          title="Search"
          description="Find destinations, stories, events, forum discussions, and community members in one place."
          emoji="🔎"
        >
          <span className="usr-section-counter">{loading ? 'Searching…' : `${totalCount} result${totalCount === 1 ? '' : 's'}`}</span>
        </UserSectionHeader>

        {/* Header */}
        <header className="usr-card usr-glass sticky top-2 z-30 mb-4 px-3 py-3 md:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="relative hidden flex-1 items-center justify-center lg:flex">
            <div className="flex w-full max-w-xl items-center gap-2">
            <form onSubmit={handleSubmit} className="min-w-0 flex-1">
              <div className="w-full max-w-xl rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 shadow-inner">
                <div className="flex items-center gap-2">
                  <SearchIcon className="h-4 w-4 flex-shrink-0" />
                  <input
                    value={query}
                    onFocus={() => setSearchFocused(true)}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search destinations, events, blogs, forums..."
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => { setQuery(''); router.push('/search') }}
                      className="flex-shrink-0 text-slate-400 hover:text-slate-600"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </form>
            <button type="button" onClick={() => setShowFilters((value) => !value)} aria-label="Open search filters" aria-expanded={showFilters} className={`usr-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${showFilters ? 'border-teal-300 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-500 hover:border-teal-200 hover:text-teal-700'}`}>
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            </div>
            {searchFocused && (
              <div className="absolute left-1/2 top-[calc(100%+0.5rem)] z-40 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-xl">
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{query.trim() ? 'Suggestions' : recentSearches.length ? 'Recent searches' : 'Popular searches'}</p>
                {(query.trim() ? suggestions : recentSearches.length ? recentSearches : popularSearches).length ? <div className="space-y-1">{(query.trim() ? suggestions : recentSearches.length ? recentSearches : popularSearches).map((suggestion) => <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); saveRecentSearch(suggestion); setSearchFocused(false); router.push(`/search?q=${encodeURIComponent(suggestion)}`) }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-teal-50"><SearchIcon className="h-4 w-4 text-slate-400" />{suggestion}</button>)}</div> : <p className="px-3 py-2 text-sm text-slate-500">{query.trim() ? 'No suggestions yet.' : 'No popular searches yet.'}</p>}
                <button type="button" onClick={() => setSearchFocused(false)} className="mt-1 w-full border-t border-slate-100 px-3 pt-3 text-left text-xs font-bold text-sky-700">View search history</button>
              </div>
            )}
            </div>

          </div>

          <div className="mt-3 lg:hidden">
            <div className="relative flex items-center gap-2">
            <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <SearchIcon className="h-4 w-4 flex-shrink-0" />
              <input
                value={query}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="flex-shrink-0 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>
            <button type="button" onClick={() => setShowFilters((value) => !value)} aria-label="Open search filters" aria-expanded={showFilters} className={`usr-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${showFilters ? 'border-teal-300 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-500 hover:border-teal-200 hover:text-teal-700'}`}>
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {searchFocused && <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{query.trim() ? 'Suggestions' : recentSearches.length ? 'Recent searches' : 'Popular searches'}</p>{(query.trim() ? suggestions : recentSearches.length ? recentSearches : popularSearches).slice(0, 5).map((suggestion) => <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); saveRecentSearch(suggestion); setSearchFocused(false); router.push(`/search?q=${encodeURIComponent(suggestion)}`) }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-teal-50"><SearchIcon className="h-4 w-4 text-slate-400" />{suggestion}</button>)}</div>}
            </div>
          </div>

          {showFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 lg:mx-auto lg:max-w-xl">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Filter by</span>
              {tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setShowFilters(false) }} className="usr-section-tab usr-press" aria-pressed={activeTab === tab.id}>
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Search Results Header */}
        <div className="usr-card usr-enter mb-6 p-4 sm:p-5">
          <p className="usr-section-eyebrow">{query.trim() ? 'Search results' : 'Start exploring'}</p>
          <h2 className="mt-1 text-2xl font-black text-slate-900">
            {query.trim() ? (
              <>
                Results for <span className="text-teal-700">&quot;{query.trim()}&quot;</span>
              </>
            ) : (
              'What are you looking for?'
            )}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {loading ? 'Searching...' : `${totalCount} result${totalCount === 1 ? '' : 's'} found`}
          </p>
          {!query.trim() && (
            <div className="mt-4 flex flex-wrap gap-2">
              {popularSearches.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); saveRecentSearch(suggestion); router.push(`/search?q=${encodeURIComponent(suggestion)}`) }} className="usr-press inline-flex items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 transition hover:border-teal-200 hover:bg-teal-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        {!loading && totalCount > 0 && (
          <div className="usr-section-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
                className="usr-section-tab usr-press"
              >
                {tab.label}
                <span className="usr-section-tab-count">{tab.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="usr-section-loading">
            {[1, 2, 3].map((i) => (
              <div key={i} className="usr-card p-4">
                <div className="usr-section-skeleton h-4 w-1/3 rounded-full" />
                <div className="usr-section-skeleton mt-3 h-3 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : totalCount === 0 && error ? (
          <div role="alert" className="usr-empty-state !border-red-200 !bg-red-50 sm:p-10">
            <SearchIcon className="mx-auto mb-3 h-10 w-10 text-red-400" />
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              className="usr-section-primary mt-4"
            >
              Try again
            </button>
          </div>
        ) : totalCount === 0 ? (
          <div className="usr-empty-state sm:p-10">
            <SearchIcon className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <p className="text-sm text-slate-500">
              {query.trim() ? 'No results found. Try different keywords.' : 'Type something to search across Daet.'}
            </p>
            {!query.trim() && <div className="mt-5 flex flex-wrap justify-center gap-2">{visibleSuggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); saveRecentSearch(suggestion); router.push(`/search?q=${encodeURIComponent(suggestion)}`) }} className="usr-press inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-teal-300 hover:text-teal-700">{suggestion}<ArrowRight className="h-3 w-3" /></button>)}</div>}
            {query.trim() && (
              <button
                type="button"
                onClick={() => { setQuery(''); router.push('/search') }}
                className="mt-3 text-xs font-bold text-teal-700 hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {(activeTab === 'all' || activeTab === 'people') && results.users.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-teal-700">
                  <UserRound className="h-4 w-4" />
                  People ({results.users.length})
                </h2>
                <div className="usr-card space-y-1.5 p-1.5">
                  {results.users.map((user) => (
                    <div key={user.id} className="usr-list-row">
                          <UserProfileLink user={user} className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-50 text-sm font-black text-teal-700">
                        {user.profile_image_url ? <img src={user.profile_image_url} alt={user.full_name || 'Community member'} className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-900">{user.full_name || user.email || 'Community member'}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{user.bio || [user.city, user.country].filter(Boolean).join(', ') || 'Daet community member'}</p>
                        {user.mutual_friends?.length > 0 && <span className="mt-2 inline-flex items-center rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700">{user.mutual_friends.length} mutual {user.mutual_friends.length === 1 ? 'friend' : 'friends'}</span>}
                      </div>
                      </UserProfileLink>
                      <button type="button" onClick={(event) => toggleFollow(event, user.id)} disabled={followBusyId === user.id} className={`usr-press inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition ${followingIds.has(user.id) ? 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600' : 'bg-teal-700 text-white hover:bg-teal-800'}`}>
                        {followingIds.has(user.id) ? <UserCheck className="h-2.5 w-2.5" /> : <UserPlus className="h-2.5 w-2.5" />}
                        {followingIds.has(user.id) ? 'Following' : 'Follow'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(activeTab === 'all' || activeTab === 'community') && (results.userContent.length > 0 || results.userComments.length > 0 || results.mentions.length > 0) && (
              <section className="usr-card p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <AtSign className="h-4 w-4 text-teal-700" />
                  <div><h2 className="text-base font-black text-slate-900">Community activity</h2><p className="text-xs text-slate-500">Public posts, comments, and mentions connected to these people.</p></div>
                </div>
                <div className="space-y-3">
                  {results.userContent.map((item) => (
                    <div key={`${item.contentKind}-${item.id}`} className="border border-slate-100 bg-slate-50 p-3 transition hover:border-sky-200 hover:bg-teal-50">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={item.href} className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">{item.contentKind === 'post' ? 'Public post' : item.contentKind}</span>
                          <p className="mt-1 text-sm font-bold text-slate-900">{item.title || item.content || item.description}</p>
                        </Link>
                        <button type="button" onClick={(event) => toggleFollow(event, item.authorId)} disabled={followBusyId === item.authorId} className={`usr-press inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition ${followingIds.has(item.authorId) ? 'bg-white text-slate-600 hover:bg-red-50 hover:text-red-600' : 'bg-teal-700 text-white hover:bg-teal-800'}`}>
                          {followingIds.has(item.authorId) ? <UserCheck className="h-2.5 w-2.5" /> : <UserPlus className="h-2.5 w-2.5" />}
                          {followingIds.has(item.authorId) ? 'Following' : 'Follow'}
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">By {userNames.get(item.authorId) || 'Community member'}</p>
                      {item.excerpt && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.excerpt}</p>}
                    </div>
                  ))}

                  {results.userComments.map((comment) => (
                    <Link key={`comment-${comment.id}`} href={getContentHref(comment.content_type, comment.content_id)} className="block border border-slate-100 bg-amber-50/60 p-3 transition hover:border-amber-200 hover:bg-amber-50">
                      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">Comment</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-amber-600" /></div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-700">{comment.body}</p>
                      <p className="mt-1 text-[11px] text-slate-500">On {comment.content_type.replace('_', ' ')}</p>
                    </Link>
                  ))}

                  {results.mentions.map((mention) => (
                    <Link key={`mention-${mention.id}`} href={getContentHref(mention.content_type, mention.content_id)} className="block border border-slate-100 bg-violet-50/60 p-3 transition hover:border-violet-200 hover:bg-violet-50">
                      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Mentioned or tagged</span><AtSign className="h-3.5 w-3.5 shrink-0 text-violet-600" /></div>
                      <p className="mt-1 text-sm font-bold text-slate-800">{mention.mention_text || `Mentioned in a ${mention.content_type.replace('_', ' ')}`}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Spots */}
            {(activeTab === 'all' || activeTab === 'spots') && results.spots.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-teal-700">
                  <Compass className="h-4 w-4" />
                  Destinations ({results.spots.length})
                </h2>
                <div className="usr-card space-y-1.5 p-1.5">
                  {results.spots.slice(0, activeTab === 'all' ? 4 : undefined).map((spot) => (
                    <Link
                      key={spot.id}
                      href={`/tourist-spots/${spot.id}`}
                      className="usr-list-row group"
                    >
                      <img
                        src={getImage(spot)}
                        alt={spot.name}
                        className="h-20 w-24 flex-shrink-0 object-cover"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700">{spot.name}</h3>
                        {spot.location && (
                          <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {spot.location}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-slate-600">{spot.description}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Events */}
            {(activeTab === 'all' || activeTab === 'events') && results.events.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-teal-700">
                  <CalendarDays className="h-4 w-4" />
                  Events ({results.events.length})
                </h2>
                <div className="usr-card space-y-1.5 p-1.5">
                  {results.events.slice(0, activeTab === 'all' ? 4 : undefined).map((event) => (
                    <Link
                      key={event.id}
                      href={`/events/${event.id}`}
                      className="usr-list-row group"
                    >
                      {event.featured_image ? (
                        <img
                          src={event.featured_image}
                          alt={event.title}
                          className="h-20 w-24 flex-shrink-0 object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-24 flex-shrink-0 items-center justify-center bg-gradient-to-br from-sky-100 to-emerald-100">
                          <CalendarDays className="h-8 w-8 text-sky-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700">{event.title}</h3>
                        {getAuthor(event.created_by) && <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><span>By {getAuthor(event.created_by).full_name || 'Community member'}</span>{renderFollowButton(event.created_by)}</div>}
                        <p className="mt-1 text-xs text-slate-500">{formatDate(event.start_date)}</p>
                        {event.location && (
                          <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {event.location}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Blogs */}
            {(activeTab === 'all' || activeTab === 'blogs') && results.blogs.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-teal-700">
                  <Newspaper className="h-4 w-4" />
                  Blogs ({results.blogs.length})
                </h2>
                <div className="usr-card space-y-1.5 p-1.5">
                  {results.blogs.slice(0, activeTab === 'all' ? 4 : undefined).map((blog) => (
                    <Link
                      key={blog.id}
                      href={`/blog/${blog.id}`}
                      className="usr-list-row group"
                    >
                      <img
                        src={getImage(blog)}
                        alt={blog.title}
                        className="h-20 w-24 flex-shrink-0 object-cover"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700">{blog.title}</h3>
                        {getAuthor(blog.created_by) && <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><span>By {getAuthor(blog.created_by).full_name || 'Community member'}</span>{renderFollowButton(blog.created_by)}</div>}
                        <p className="mt-1 text-xs text-slate-600">{blog.excerpt}</p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                          {blog.category || 'Blog'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Forum Threads */}
            {(activeTab === 'all' || activeTab === 'threads') && results.threads.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-teal-700">
                  <MessageSquare className="h-4 w-4" />
                  Forum Discussions ({results.threads.length})
                </h2>
                <div className="usr-card space-y-1.5 p-1.5">
                  {results.threads.slice(0, activeTab === 'all' ? 4 : undefined).map((thread) => (
                    <div
                      key={thread.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/forum/${thread.id}`} className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-slate-900 hover:text-teal-700">{thread.title}</h3>
                          {getAuthor(thread.created_by) && <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><span>By {getAuthor(thread.created_by).full_name || 'Community member'}</span>{renderFollowButton(thread.created_by)}</div>}
                        </Link>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{thread.content}</p>
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
                        <span>{formatDate(thread.last_activity_at || thread.created_at)}</span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {thread.reply_count || 0} replies
                        </span>
                      </div>
                      {results.forumComments.filter((comment) => comment.content_id === thread.id).map((comment) => (
                        <Link key={comment.id} href={`/forum/${thread.id}#comment-${comment.id}`} className="mt-3 block border-l-2 border-emerald-300 bg-emerald-50/60 px-3 py-2.5 hover:bg-emerald-50">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Related comment</p>
                          <p className="mt-1 text-xs leading-5 text-slate-700">{comment.body}</p>
                          <p className="mt-1 text-[10px] text-slate-500">By {comment.info_users?.full_name || 'Community member'}</p>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#f3f5f9]"><p className="text-slate-600">Loading...</p></div>}>
      <SearchContent />
    </Suspense>
  )
}