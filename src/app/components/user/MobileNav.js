'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, Home, Mail, MessageSquare, PlusCircle, User } from 'lucide-react'

const navItems = [
  { href: '/user/dashboard', label: 'Home', icon: Home },
  { href: '/user/events', label: 'Events', icon: Compass },
  { href: '/user/blogs/new', label: 'Create', icon: PlusCircle, highlight: true },
  { href: '/user/messaging', label: 'Messages', icon: Mail },
  { href: '/user/forums', label: 'Forums', icon: MessageSquare },
  { href: '/user/profile', label: 'Profile', icon: User },
]

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur-sm lg:hidden">
        <div className="mx-auto grid max-w-[520px] grid-cols-6 items-end gap-1 px-2 pt-2 pb-1.5">
          {navItems.map(({ href, label, icon: Icon, highlight }) => {
            const isActive = pathname === href || (href !== '/user/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-w-0 flex-col items-center justify-end rounded-lg px-1.5 py-1.5 text-center transition ${
                  highlight ? 'text-white' : isActive ? 'text-sky-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {highlight ? (
                  <span className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 shadow-[0_10px_20px_rgba(14,165,233,0.35)]">
                    <Icon className="h-5 w-5" />
                  </span>
                ) : (
                  <Icon className={`h-5 w-5 ${isActive ? 'fill-sky-100' : ''}`} />
                )}
                <span className={`mt-1 block text-[10px] font-semibold leading-none ${!highlight && isActive ? 'text-sky-700' : highlight ? 'text-sky-600' : ''}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
      <div className="h-20 lg:hidden" />
    </>
  )
}