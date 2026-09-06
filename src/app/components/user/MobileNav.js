'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Home, Mail, PlusCircle, Search } from 'lucide-react'

const navItems = [
  { href: '/user/dashboard', label: 'Feed', icon: Home },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/user/blogs/new', label: 'Create', icon: PlusCircle, highlight: true },
  { href: '/user/notifications', label: 'Alerts', icon: Bell },
  { href: '/user/messaging', label: 'Messages', icon: Mail },
]

export default function MobileNav() {
  const pathname = usePathname()
  const [unreadAlerts, setUnreadAlerts] = useState(0)

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

  return (
    <>
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