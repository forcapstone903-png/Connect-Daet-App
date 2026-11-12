'use client'

import Link from 'next/link'
import { ChevronRight, Info, ShieldAlert, TriangleAlert } from 'lucide-react'
import { ALERT_PHASE_LABELS, getSeverity } from '@/lib/alerts.mjs'

export const SEVERITY_CARD = {
  critical: { box: 'border-red-300 bg-red-50', badge: 'bg-red-600 text-white', icon: ShieldAlert, iconColor: 'text-red-600' },
  warning: { box: 'border-orange-300 bg-orange-50', badge: 'bg-orange-500 text-white', icon: TriangleAlert, iconColor: 'text-orange-600' },
  advisory: { box: 'border-amber-200 bg-amber-50', badge: 'bg-amber-100 text-amber-900', icon: TriangleAlert, iconColor: 'text-amber-600' },
  info: { box: 'border-sky-200 bg-sky-50', badge: 'bg-sky-100 text-sky-900', icon: Info, iconColor: 'text-sky-600' },
}

const MANILA = { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }
export const formatAlertTime = (value) => (value ? new Date(value).toLocaleString('en-PH', MANILA) : '')

export function relativeTime(value, now) {
  if (!value) return ''
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return formatAlertTime(value)
}

export default function AlertCard({ alert, categoryName, now, compact = false }) {
  const style = SEVERITY_CARD[alert.severity] || SEVERITY_CARD.advisory
  const Icon = style.icon
  const isCurrent = alert.phase === 'active'
  return (
    <Link
      href={`/info/visitor/alerts/${alert.id}`}
      className={`group flex gap-3 rounded-2xl border p-4 transition hover:shadow-md ${isCurrent ? style.box : 'border-slate-200 bg-white'}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${isCurrent ? style.iconColor : 'text-slate-400'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
          <span className={`rounded-full px-2 py-0.5 ${isCurrent ? style.badge : 'bg-slate-100 text-slate-600'}`}>{getSeverity(alert.severity).label}</span>
          <span className="text-slate-500">{categoryName(alert.category)}</span>
          {!isCurrent ? <span className={alert.phase === 'all_clear' ? 'text-emerald-700' : 'text-slate-500'}>· {ALERT_PHASE_LABELS[alert.phase]}</span> : null}
        </div>
        <h3 className="mt-1 text-sm font-bold leading-5 text-slate-900">{alert.title}</h3>
        {!compact ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-700">{alert.message}</p> : null}
        <p className="mt-1.5 text-xs text-slate-500">
          {alert.affected_area || (alert.barangays?.length ? alert.barangays.join(', ') : 'All of Daet')}
          {' · '}
          <time dateTime={alert.sent_at}>{relativeTime(alert.sent_at, now)}</time>
          {alert.edited_after_send ? ' · updated' : ''}
        </p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  )
}
