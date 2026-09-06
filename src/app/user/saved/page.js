'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bookmark, CalendarDays, FileText, Loader, MapPin, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'

export default function UserSavedPage() {
  const router = useRouter()
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [savedItems, setSavedItems] = useState([])

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
        await loadSavedItems(activeSession.user.id)
      } catch (err) {
        console.error('Auth error:', err)
        router.push('/login')
      }
    }

    checkAuth()
  }, [router])

  const loadSavedItems = async (userId) => {
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

      savedKeys.forEach((key) => {
        const [type, id] = key.split('-')
        if (!type || !id) return
        if (type === 'blog') blogIds.push(id)
        else if (type === 'event') eventIds.push(id)
        else if (type === 'forum') forumIds.push(id)
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
          .eq('status', 'published')
        ;(data || []).forEach(item => results.push({ ...item, type: 'forum', typeLabel: 'Forum', href: `/user/forums/${item.id}` }))
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

  const removeSaved = (e, key) => {
    e.preventDefault()
    e.stopPropagation()
    const [type, id] = key.split('-')
    const itemType = type === 'post' ? 'user_post' : type
    void supabase.from('user_favorites').delete().eq('item_type', itemType).eq('item_id', id).then(({ error }) => {
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
    return Bookmark
  }

  const getTypeColor = (type) => {
    if (type === 'blog') return 'bg-sky-100 text-sky-700'
    if (type === 'event') return 'bg-emerald-100 text-emerald-700'
    if (type === 'forum') return 'bg-violet-100 text-violet-700'
    return 'bg-slate-100 text-slate-700'
  }

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
      <div className="mx-auto max-w-[800px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        <Link href="/user/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-sky-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">Your Library</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 md:text-3xl">Saved Items</h1>
          <p className="mt-1 text-sm text-slate-600">Blogs, events, and forum posts you've saved for later</p>
        </div>

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
        ) : savedItems.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <Bookmark className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-500">No saved items yet</p>
            <p className="mt-1 text-xs text-slate-400">Tap the bookmark icon on blogs, events, or forum posts to save them here</p>
            <Link href="/user/dashboard" className="mt-4 inline-block rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
              Explore Content
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {savedItems.map((item) => {
              const TypeIcon = getTypeIcon(item.type)
              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={item.href}
                  className="group flex items-center gap-4 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  {item.featured_image ? (
                    <img src={item.featured_image} alt={item.title} className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl ${getTypeColor(item.type)}`}>
                      <TypeIcon className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getTypeColor(item.type)}`}>
                        {item.typeLabel}
                      </span>
                      {item.category && <span className="text-xs text-slate-400">{item.category}</span>}
                    </div>
                    <h3 className="mt-1 truncate text-sm font-bold text-slate-900 group-hover:text-sky-700">{item.title}</h3>
                    {item.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{item.location}</span>
                      </p>
                    )}
                    {item.excerpt && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.excerpt}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => removeSaved(e, `${item.type}-${item.id}`)}
                    className="flex-shrink-0 rounded-full p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                    title="Remove from saved"
                  >
                    <Bookmark className="h-4 w-4 fill-current" />
                  </button>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}