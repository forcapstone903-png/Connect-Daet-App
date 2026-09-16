'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Bookmark, CalendarDays, FileText, Home, MessageCircle, PlusCircle, Search, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'

const UNREAD_REFRESH_INTERVAL_MS = 10_000

const navItems = [
  { href: '/user/dashboard', label: 'Feed', icon: Home },
  { href: '/user/forums', label: 'Forums', icon: MessageCircle },
  { href: '/user/blogs/new', label: 'Create', icon: PlusCircle, highlight: true },
  { href: '/user/blogs', label: 'Blogs', icon: FileText },
  { href: '/user/events', label: 'Events', icon: CalendarDays },
]

const desktopNavItems = [
  { href: '/user/dashboard', label: 'Feed', icon: Home },
  { href: '/user/forums', label: 'Forums', icon: MessageCircle },
  { href: '/user/blogs', label: 'Blogs', icon: FileText },
  { href: '/user/events', label: 'Events', icon: CalendarDays },
  { href: '/user/saved', label: 'Saved', icon: Bookmark },
  { href: '/user/settings', label: 'Settings', icon: Settings },
]

export default function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false)

  useEffect(() => {
    const handleCommentsSheetState = (event) => setCommentsSheetOpen(Boolean(event.detail?.open))
    window.addEventListener('daet-comments-sheet-state', handleCommentsSheetState)
    return () => window.removeEventListener('daet-comments-sheet-state', handleCommentsSheetState)
  }, [])

  useEffect(() => {
    let active = true
    const session = getStoredSessionObject()
    const userId = session?.user_id || session?.id || session?.userId || session?.sub || ''

    const loadUnreadAlerts = async () => {
      try {
        const [notificationsResponse, messagesResponse] = await Promise.all([
          fetch('/api/notifications', { credentials: 'same-origin', cache: 'no-store' }),
          fetch('/api/messages', { credentials: 'same-origin', cache: 'no-store' }),
        ])
        const notificationsResult = notificationsResponse.ok ? await notificationsResponse.json() : null
        const messagesResult = messagesResponse.ok ? await messagesResponse.json() : null
        if (active && notificationsResult?.success) {
          const unreadCount = Number.isFinite(Number(notificationsResult.unread_count))
            ? Number(notificationsResult.unread_count)
            : (notificationsResult.notifications || []).filter((notification) => !notification.is_read).length
          setUnreadAlerts(unreadCount)
        }
        if (active && messagesResult?.success) setUnreadMessages(messagesResult.unread_messages || 0)
      } catch {
        // Notifications are optional for the navigation shell.
      }
    }

    loadUnreadAlerts()
    const updateUnreadAlerts = (event) => {
      const detailUnreadCount = Number(event?.detail?.unreadCount)

      if (Number.isFinite(detailUnreadCount)) {
        setUnreadAlerts(detailUnreadCount)
        return
      }

      void loadUnreadAlerts()
    }

    const updateUnreadMessages = () => {
      void loadUnreadAlerts()
    }

    window.addEventListener('daet-notifications-updated', updateUnreadAlerts)
    window.addEventListener('daet-messages-updated', updateUnreadMessages)
    const refreshTimer = window.setInterval(loadUnreadAlerts, UNREAD_REFRESH_INTERVAL_MS)
    let realtimeChannel = null
    if (userId && supabase?.channel) {
      realtimeChannel = supabase.channel(`navigation-realtime-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'info_notifications', filter: `user_id=eq.${userId}` }, () => {
          if (active) void loadUnreadAlerts()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, (payload) => {
          const message = payload?.new || payload?.old
          if (active && message && (message.sender_id === userId || message.recipient_id === userId)) void loadUnreadAlerts()
        })
        .subscribe()
      }

    return () => {
      active = false
      window.removeEventListener('daet-notifications-updated', updateUnreadAlerts)
      window.removeEventListener('daet-messages-updated', updateUnreadMessages)
      window.clearInterval(refreshTimer)
      if (realtimeChannel) supabase.removeChannel(realtimeChannel)
    }
  }, [])

  const submitSearch = (event) => {
    event.preventDefault()
    const query = searchQuery.trim()
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  const totalUnread = unreadAlerts + unreadMessages
  const unreadLabel = totalUnread > 9 ? '9+' : totalUnread

  return (
    <>
      <nav className="sticky top-0 z-40 hidden border-b border-[#dfe7e1] bg-[#fffefa]/95 shadow-[0_6px_20px_rgba(29,42,39,0.04)] backdrop-blur-sm lg:block">
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/user/dashboard" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <img src="/logo.png" alt="Daet tourism logo" className="h-9 w-9 object-contain" />
            </Link>
            <form onSubmit={submitSearch} className="flex min-w-0 max-w-[300px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 focus-within:border-sky-400 focus-within:bg-white">
              <Search className="h-4 w-4 shrink-0" />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search Daet Connect" aria-label="Search Daet Connect" className="min-w-0 w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
            </form>
          </div>
          <div className="flex items-center justify-center gap-1 whitespace-nowrap">
            {desktopNavItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || (href !== '/user/dashboard' && pathname.startsWith(href))
              return <Link key={href} href={href} aria-current={isActive ? 'page' : undefined} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Icon className="h-4 w-4" />{label}</Link>
            })}
          </div>
          <div className="flex items-center justify-self-end">
            <Link href="/user/notifications" aria-label="Notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-50">
              <Bell className="h-4 w-4" />
              {totalUnread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[#fffefa]">
                  {unreadLabel}
                </span>
              )}
            </Link>
          </div>
        </div>
      </nav>
      {!commentsSheetOpen && <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dfe7e1] bg-[#fffefa]/96 shadow-[0_-8px_24px_rgba(29,42,39,0.08)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur-sm lg:hidden">
        <div className="mx-auto grid max-w-[520px] grid-cols-5 items-center gap-1 px-2 py-1.5">
          {navItems.map(({ href, label, icon: Icon, highlight }) => {
            const isActive = pathname === href || (href !== '/user/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`flex h-14 min-w-0 flex-col items-center justify-center rounded-lg px-1 text-center transition ${
                    highlight ? 'text-white' : isActive ? 'text-[#16766f]' : 'text-[#72807a] hover:bg-[#edf4f0] hover:text-[#0e514d]'
                }`}
              >
                {highlight ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#16766f] shadow-[0_6px_14px_rgba(22,118,111,0.25)]">
                    <Icon className="h-5 w-5" />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon className={`h-5 w-5 ${isActive ? 'fill-sky-100' : ''}`} />
                    {href === '/user/notifications' && unreadAlerts > 0 && (
                      <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                        {unreadAlerts > 9 ? '9+' : unreadAlerts}
                      </span>
                    )}
                    {href === '/user/messaging' && unreadMessages > 0 && (
                      <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                        {unreadMessages > 9 ? '9+' : unreadMessages}
                      </span>
                    )}
                  </span>
                )}
                <span className={`mt-1 block text-[10px] font-semibold leading-none ${!highlight && isActive ? 'text-sky-700' : highlight ? 'text-sky-600' : ''}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>}
    </>
  )
}