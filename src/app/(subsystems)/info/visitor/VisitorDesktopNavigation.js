'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { getActiveNavigationHref } from '@/lib/routeMatching.mjs'
import { visitorNavigationItems } from './navigation'

export default function VisitorDesktopNavigation() {
  const pathname = usePathname()
  const activeHref = getActiveNavigationHref(pathname, visitorNavigationItems)

  return (
    <aside
      aria-label="Visitor navigation"
      className="fixed inset-y-16 left-0 z-40 hidden w-[286px] flex-col border-r border-slate-200 bg-white text-slate-800 lg:flex"
    >
      <Link href="/info/visitor" className="flex min-h-20 items-center gap-3 border-b border-slate-200 px-6">
        <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
        <span className="min-w-0">
          <span className="block truncate text-base font-black tracking-tight text-slate-900">Connect Daet</span>
          <span className="block text-xs font-medium text-slate-500">Explore the municipality</span>
        </span>
      </Link>
      <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto p-4">
        {visitorNavigationItems.filter((item) => item.mobileShell !== false).map(({ href, label, icon: Icon }) => {
          const isActive = activeHref === href

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                isActive
                  ? 'bg-sky-50 text-sky-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}