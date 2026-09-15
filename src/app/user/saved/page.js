'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, CalendarDays, FileText, Loader, MapPin, MessageSquare, MapPinned, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import UserTopHeader from '@/app/components/user/UserTopHeader'

function parseSavedKey(key) {
  const separatorIndex = key.indexOf('-')
  return separatorIndex === -1 ? [key, ''] : [key.slice(0, separatorIndex), key.slice(separatorIndex + 1)]
}

export default function UserSavedPage() {
  const router = useRouter()
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [savedItems, setSavedItems] = useState([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [activeType, setActiveType] = useState('all')

  async function loadSavedItems(userId) {
    try {
      const { data: favorites, error: favoritesError } = await supabase
        .from('user_favorites')
        .select('item_type, item_id')
        .eq('user_id', userId)
      if (favoritesError) throw favoritesError
      const savedKeys = (favorites || []).map((favorite) => `${favorite.item_type}-${favorite.item_id}`)

      if (savedKeys.length === 0) {
        setSavedItems([])
        setLoading(false)
        return
      }

      // Group by type: blog-{id}, event-{id}, forum-{id}
      const blogIds = []
      const eventIds = []
      const forumIds = []
      const touristSpotIds = []

      savedKeys.forEach((key) => {
        const [type, id] = parseSavedKey(key)
        if (!type || !id) return
        if (type === 'blog') blogIds.push(id)
        else if (type === 'event') eventIds.push(id)
        else if (type === 'forum') forumIds.push(id)
        else if (type === 'tourist_spot') touristSpotIds.push(id)
      })

      const results = []

      if (blogIds.length > 0) {
        const { data } = await supabase
          .from('info_blogs')
          .select('id, title, excerpt, featured_image, category, published_at')
          .in('id', blogIds)
          .eq('status', 'published')
        ;(data || []).forEach(item => results.push({ ...item, type: 'blog', typeLabel: 'Blog', href: `/user/blogs/${item.id}` }))
      }

      if (eventIds.length > 0) {
        const { data } = await supabase
          .from('info_events')
          .select('id, title, description, location, featured_image, category, start_date')
          .in('id', eventIds)
          .eq('status', 'published')
        ;(data || []).forEach(item => results.push({ ...item, type: 'event', typeLabel: 'Event', href: `/user/events/${item.id}` }))
      }

      if (forumIds.length > 0) {
        const { data } = await supabase
          .from('forum_threads')
          .select('id, title, content, reply_count, last_activity_at')
          .in('id', forumIds)
          .eq('status', 'active')
        ;(data || []).forEach(item => results.push({ ...item, type: 'forum', typeLabel: 'Forum', href: `/user/forums/${item.id}` }))
      }

      if (touristSpotIds.length > 0) {
        const { data } = await supabase
          .from('info_tourist_spots')
          .select('id, name, description, location, featured_image, category, updated_at')
          .in('id', touristSpotIds)
          .eq('status', 'active')
        ;(data || []).forEach(item => results.push({ ...item, title: item.name, excerpt: item.description, type: 'tourist_spot', typeLabel: 'Destination', href: `/tourist-spots/${item.id}` }))
      }

      const sorted = results.sort((a, b) => {
        const dateA = new Date(a.published_at || a.start_date || a.last_activity_at || 0)
        const dateB = new Date(b.published_at || b.start_date || b.last_activity_at || 0)
        return dateB - dateA
      })

      setSavedItems(sorted)
    } catch (err) {
      console.error('Error loading saved items:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const cookieSession = getAuthCookieFromDocument()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const activeSession = session || (cookieSession?.logged_in ? { user: { id: cookieSession.user_id } } : null)

        if (!activeSession?.user) {
          router.push('/login')
          return
        }

        setAuthChecking(false)
        setCurrentUserId(activeSession.user.id)
        await loadSavedItems(activeSession.user.id)
      } catch (err) {
        console.error('Auth error:', err)
        router.push('/login')
      }
    }

    checkAuth()
  }, [router])

  const removeSaved = (e, key) => {
    e.preventDefault()
    e.stopPropagation()
    const [type, id] = parseSavedKey(key)
    const itemType = type === 'post' ? 'user_post' : type
    void supabase.from('user_favorites').delete().eq('user_id', currentUserId).eq('item_type', itemType).eq('item_id', id).then(({ error }) => {
      if (error) {
        console.error('Saved item removal failed:', error)
        return
      }
      setSavedItems((previous) => previous.filter((item) => `${item.type}-${item.id}` !== key))
    })
  }

  const getTypeIcon = (type) => {
    if (type === 'blog') return FileText
    if (type === 'event') return CalendarDays
    if (type === 'forum') return MessageSquare
    if (type === 'tourist_spot') return MapPinned
    return Bookmark
  }

  const getTypeColor = (type) => {
    if (type === 'blog') return 'bg-sky-100 text-sky-700'
    if (type === 'event') return 'bg-emerald-100 text-emerald-700'
    if (type === 'forum') return 'bg-violet-100 text-violet-700'
    if (type === 'tourist_spot') return 'bg-amber-100 text-amber-700'
    return 'bg-slate-100 text-slate-700'
  }

  const visibleItems = activeType === 'all' ? savedItems : savedItems.filter((item) => item.type === activeType)

  if (authChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Loader className="mx-auto mb-4 animate-spin text-slate-600" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <UserTopHeader />
      <div className="mx-auto max-w-[800px] px-3 pb-10 pt-2 sm:px-4 lg:px-6">
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">Your Library</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 md:text-3xl">Saved Items</h1>
          <p className="mt-1 text-sm text-slate-600">Blogs, events, and forum posts you&apos;ve saved for later</p>
        </div>

        <nav className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-slate-200" aria-label="Saved content filters">
          {[['all', 'All'], ['blog', 'Blogs'], ['event', 'Events'], ['forum', 'Forums']].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setActiveType(value)} className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-bold transition ${activeType === value ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-5">
                <div className="h-5 w-1/3 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-full rounded bg-slate-200" />
                <div className="mt-2 h-3 w-2/3 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <Bookmark className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-500">No saved {activeType === 'all' ? 'items' : `${activeType}s`} yet</p>
            <p className="mt-1 text-xs text-slate-400">Save blogs, events, or forum posts to find them here.</p>
            <Link href="/user/dashboard" className="mt-4 inline-block rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
              Explore Content
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleItems.map((item) => {
              const TypeIcon = getTypeIcon(item.type)
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  className="group flex items-center gap-4 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-4">
                    {item.featured_image ? (
                      <img src={item.featured_image} alt={item.title} className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl ${getTypeColor(item.type)}`}>
                        <TypeIcon className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getTypeColor(item.type)}`}>{item.typeLabel}</span>
                        {item.category && <span className="text-xs text-slate-400">{item.category}</span>}
                      </div>
                      <h3 className="mt-1 truncate text-sm font-bold text-slate-900 group-hover:text-sky-700">{item.title}</h3>
                      {item.location && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" /><span className="truncate">{item.location}</span></p>}
                      {item.excerpt && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.excerpt}</p>}
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => removeSaved(e, `${item.type}-${item.id}`)}
                    className="flex-shrink-0 rounded-full p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                    title="Remove from saved"
                    aria-label={`Remove ${item.title} from saved`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}