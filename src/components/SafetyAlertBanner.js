'use client'

// Site-wide banner for ACTIVE warning and emergency alerts. Lower severities
// appear on /info/visitor/alerts and in inboxes only, so the banner stays
// meaningful. Collapsing is remembered for this tab only and re-opens when a
// new alert arrives.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, ShieldAlert, TriangleAlert } from 'lucide-react'
import { BANNER_SEVERITIES } from '@/lib/alerts.mjs'
import { useAlertFeed } from '@/lib/useAlertFeed'

const COLLAPSE_KEY = 'daet:alert-banner-collapsed'

const HIDDEN_PREFIXES = ['/info/admin', '/info/visitor/alerts']

function readCollapsed() {
  try {
    return window.sessionStorage.getItem(COLLAPSE_KEY) || ''
  } catch {
    return ''
  }
}

export default function SafetyAlertBanner() {
  const pathname = usePathname() || ''
  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  const { current } = useAlertFeed({ channelName: 'site-safety-alert-banner', enabled: !hidden, limit: 20 })
  const [collapsedFor, setCollapsedFor] = useState(() => (typeof window === 'undefined' ? '' : readCollapsed()))

  const bannerAlerts = useMemo(
    () => current.filter((alert) => BANNER_SEVERITIES.includes(alert.severity)),
    [current]
  )
  const signature = bannerAlerts.map((alert) => `${alert.id}:${alert.updated_at}`).join('|')

  if (hidden || !bannerAlerts.length) return null

  const top = bannerAlerts[0]
  const isCritical = top.severity === 'critical'
  const collapsed = collapsedFor === signature
  const Icon = isCritical ? ShieldAlert : TriangleAlert
  const tone = isCritical
    ? 'border-red-700 bg-red-600 text-white'
    : 'border-orange-300 bg-orange-50 text-orange-950'

  const setCollapsed = (value) => {
    const next = value ? signature : ''
    setCollapsedFor(next)
    try {
      window.sessionStorage.setItem(COLLAPSE_KEY, next)
    } catch {
      // Storage is optional.
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={`fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[95] inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-bold shadow-lg lg:top-20 ${tone}`}
        aria-label={`Show ${bannerAlerts.length} active ${bannerAlerts.length === 1 ? 'alert' : 'alerts'}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {bannerAlerts.length} active {bannerAlerts.length === 1 ? 'alert' : 'alerts'}
      </button>
    )
  }

  return (
    <aside
      role={isCritical ? 'alert' : 'status'}
      aria-live={isCritical ? 'assertive' : 'polite'}
      className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[95] flex justify-center lg:top-20"
    >
      <div className={`pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-2xl border p-3 shadow-xl ${tone}`}>
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-90">
            {isCritical ? 'Emergency alert' : 'Warning'}
            {top.affected_area ? ` · ${top.affected_area}` : ''}
          </p>
          <p className="mt-0.5 text-sm font-bold leading-5">{top.title}</p>
          <p className={`mt-0.5 line-clamp-2 text-xs leading-4 ${isCritical ? 'text-white/90' : 'text-orange-900'}`}>{top.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold">
            <Link href={`/info/visitor/alerts/${top.id}`} className="underline underline-offset-2">Details</Link>
            {bannerAlerts.length > 1 ? (
              <Link href="/info/visitor/alerts" className="underline underline-offset-2">+{bannerAlerts.length - 1} more</Link>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className={`shrink-0 rounded-lg p-1.5 ${isCritical ? 'hover:bg-white/15' : 'hover:bg-orange-100'}`}
          aria-label="Minimise alert"
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
