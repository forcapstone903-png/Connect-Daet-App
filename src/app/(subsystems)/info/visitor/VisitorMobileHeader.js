'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getActiveNavigationHref } from '@/lib/routeMatching.mjs'
import { visitorMobileNavigationItems } from './navigation'

export default function VisitorMobileHeader() {
  const pathname = usePathname()
  const activeHref = getActiveNavigationHref(pathname, visitorMobileNavigationItems)

  return (
    <nav
      aria-label="Visitor navigation"
      className="fixed inset-x-0 bottom-0 z-50 grid min-h-[60px] grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
    >
      {visitorMobileNavigationItems.map(({ href, label, icon: Icon }) => {
        const isActive = activeHref === href

        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-semibold transition ${
              isActive ? 'text-sky-700' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}