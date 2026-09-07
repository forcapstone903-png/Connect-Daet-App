'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Bookmark, CalendarDays, FileText, Home, LogOut, Mail, MessageCircle, PlusCircle, Search, Settings, UserRound } from 'lucide-react'
import { performLogout } from '@/lib/clientLogout'

const navItems = [
  { href: '/user/dashboard', label: 'Feed', icon: Home },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/user/blogs/new', label: 'Create', icon: PlusCircle, highlight: true },
  { href: '/user/notifications', label: 'Alerts', icon: Bell },
  { href: '/user/messaging', label: 'Messages', icon: Mail },
]

const desktopNavItems = [
  { href: '/user/dashboard', label: 'Feed', icon: Home },
  { href: '/user/forums', label: 'Forums', icon: MessageCircle },
  { href: '/user/blogs', label: 'Blogs', icon: FileText },
  { href: '/user/events', label: 'Events', icon: CalendarDays },
  { href: '/user/saved', label: 'Saved', icon: Bookmark },
]

export default function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [accountOpen, setAccountOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let active = true

    const loadUnreadAlerts = async () => {
      try {
        const response = await fetch('/api/notifications', { credentials: 'same-origin' })
        if (!response.ok) return

        const result = await response.json()
        if (active && result.success) {
          setUnreadAlerts((result.notifications || []).filter((notification) => !notification.is_read).length)
        }
      } catch {
        // Notifications are optional for the navigation shell.
      }
    }

    loadUnreadAlerts()
    const refreshTimer = window.setInterval(loadUnreadAlerts, 30000)

    return () => {
      active = false
      window.clearInterval(refreshTimer)
    }
  }, [])

  const handleLogout = async () => {
    await performLogout()
    router.push('/login')
  }

  const submitSearch = (event) => {
    event.preventDefault()
    const query = searchQuery.trim()
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  return (
    <>
      <nav className="sticky top-0 z-40 hidden border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm lg:block">
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[minmax(25rem,1fr)_auto_minmax(12rem,auto)] items-center gap-6 px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/user/dashboard" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <img src="/logo.png" alt="Daet tourism logo" className="h-9 w-9 object-contain" />
              <span>
                <span className="block text-sm font-black tracking-tight text-slate-900">Daet Connect</span>
                <span className="block text-[10px] font-medium text-slate-500">Daet community</span>
              </span>
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
          <div className="relative flex items-center justify-self-end gap-2">
            <Link href="/user/notifications" aria-label="Notifications" className="rounded-lg p-2 text-slate-600 hover:bg-slate-50"><Bell className="h-4 w-4" /></Link>
            <button type="button" aria-label="Open account menu" onClick={() => setAccountOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900">
              <UserRound className="h-4 w-4" />Me
            </button>
            {accountOpen && <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <Link href="/user/profile" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><UserRound className="h-4 w-4" />View profile</Link>
              <Link href="/user/settings" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />Profile settings</Link>
              <Link href="/user/messaging" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Mail className="h-4 w-4" />Messages</Link>
              <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Log out</button>
            </div>}
          </div>
        </div>
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur-sm lg:hidden">
        <div className="mx-auto grid max-w-[520px] grid-cols-5 items-center gap-1 px-2 py-1.5">
          {navItems.map(({ href, label, icon: Icon, highlight }) => {
            const isActive = pathname === href || (href !== '/user/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`flex h-14 min-w-0 flex-col items-center justify-center rounded-lg px-1 text-center transition ${
                  highlight ? 'text-white' : isActive ? 'text-sky-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {highlight ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 shadow-[0_6px_14px_rgba(14,165,233,0.3)]">
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
                  </span>
                )}
                <span className={`mt-1 block text-[10px] font-semibold leading-none ${!highlight && isActive ? 'text-sky-700' : highlight ? 'text-sky-600' : ''}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}