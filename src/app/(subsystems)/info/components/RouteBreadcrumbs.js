'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { getNavigationBreadcrumbs } from '@/lib/navigationBreadcrumbs.mjs'

function RouteBreadcrumbsContent({
  homeHref,
  homeLabel,
  role,
  permissionOverrides,
}) {
  const pathname = usePathname()
  const breadcrumbs = getNavigationBreadcrumbs(pathname, {
    homeHref,
    homeLabel,
    role,
    permissionOverrides,
  })

  if (!breadcrumbs.length) return null

  return (
    <nav aria-label="Breadcrumb" className="px-4 pt-4 sm:px-6 lg:px-8">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500">
        {breadcrumbs.map((item, index) => {
          const isCurrent = index === breadcrumbs.length - 1
          return (
            <li
              key={`${item.href || 'current'}-${item.label}`}
              className="inline-flex items-center gap-2"
            >
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
              {isCurrent ? (
                <span aria-current="page" className="font-semibold text-slate-800">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="rounded-sm hover:text-sky-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default function RouteBreadcrumbs(props) {
  return (
    <Suspense fallback={null}>
      <RouteBreadcrumbsContent {...props} />
    </Suspense>
  )
}