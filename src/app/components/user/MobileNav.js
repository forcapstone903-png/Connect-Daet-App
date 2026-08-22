'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, Home, MessageSquare, PlusCircle, User } from 'lucide-react'

const navItems = [
  { href: '/user/dashboard', label: 'Home', icon: Home },
  { href: '/user/events', label: 'Events', icon: Compass },
  { href: '/user/blogs/new', label: 'Create', icon: PlusCircle, highlight: true },
  { href: '/user/forums', label: 'Forums', icon: MessageSquare },
  { href: '/user/profile', label: 'Profile', icon: User },
]

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-center px-2 py-1.5">
          {navItems.map(({ href, label, icon: Icon, highlight }) => {
            const isActive = pathname === href || (href !== '/user/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 rounded-[14px] px-2 py-1.5 transition ${
                  highlight ? 'text-white' : isActive ? 'text-sky-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {highlight ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 shadow-md shadow-sky-500/30 -mt-5">
                    <Icon className="h-5 w-5" />
                  </span>
                ) : (
                  <Icon className={`h-5 w-5 ${isActive ? 'fill-sky-100' : ''}`} />
                )}
                <span className={`text-[10px] font-semibold ${!highlight && isActive ? 'text-sky-700' : highlight ? 'text-sky-600' : ''}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
      <div className="h-16 lg:hidden" />
    </>
  )
}