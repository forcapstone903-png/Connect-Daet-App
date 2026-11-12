'use client'

// One alert, shareable. Live: an "all clear" or correction appears without
// reloading. Opening it marks the signed-in user's inbox copy as read.

import { startTransition, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CheckCircle2, ChevronLeft, MapPin, Share2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { ALERT_PHASE_LABELS, PUBLIC_ALERT_COLUMNS, getAlertPhase, getSeverity } from '@/lib/alerts.mjs'
import { SEVERITY_CARD, formatAlertTime } from '../_components/AlertCard'

const UUID = /^[0-9a-f-]{36}$/i

export default function AlertDetailPage() {
  const { id } = useParams()
  const alertId = UUID.test(String(id)) ? String(id) : null
  const [alert, setAlert] = useState(null)
  const [categoryName, setCategoryName] = useState('')
  const [status, setStatus] = useState(alertId ? 'loading' : 'missing')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!alertId) return false
    const { data, error } = await supabase.from('alerts').select(PUBLIC_ALERT_COLUMNS).eq('id', alertId).maybeSingle()
    if (error) {
      setStatus('error')
      return false
    }
    if (!data) {
      setStatus('missing')
      return true
    }
    setAlert(data)
    setStatus('ready')
    const { data: category } = await supabase.from('alert_categories').select('name').eq('slug', data.category).maybeSingle()
    setCategoryName(category?.name || data.category)
    return true
  }, [alertId])

  const realtime = useRealtimeRefresh({
    channelName: `visitor-alert-${alertId || 'none'}`,
    tables: [{ table: 'alerts', filter: `id=eq.${alertId}` }],
    enabled: Boolean(alertId),
  })
  const { setRefreshCallback } = realtime
  useEffect(() => { setRefreshCallback(load) }, [load, setRefreshCallback])
  useEffect(() => {
    startTransition(() => { void load() })
  }, [load])

  // Count the open toward reach (signed-in users only; guests are anonymous).
  useEffect(() => {
    if (!alertId) return
    void fetch(`/info/api/alerts/${alertId}/opened`, { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  }, [alertId])

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: alert.title, text: alert.message.slice(0, 140), url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2500)
      }
    } catch {
      // Share sheet dismissed.
    }
  }

  if (status === 'loading') {
    return <main className="min-h-screen bg-[#f3f5f9] p-6"><div className="mx-auto h-64 max-w-2xl animate-pulse rounded-2xl bg-white" /></main>
  }

  if (status !== 'ready' || !alert) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-600">{status === 'error' ? 'This alert could not be loaded. Check your connection and try again.' : 'This alert does not exist or has not been published.'}</p>
          <Link href="/info/visitor/alerts" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-blue-700 hover:underline">See all alerts</Link>
        </div>
      </main>
    )
  }

  const phase = getAlertPhase(alert)
  const style = SEVERITY_CARD[alert.severity] || SEVERITY_CARD.advisory
  const Icon = style.icon
  const isCurrent = phase === 'active'

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-2xl px-4 pb-12 pt-4 sm:px-6">
        <Link href="/info/visitor/alerts" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />All alerts
        </Link>

        <article className={`mt-2 rounded-2xl border p-5 sm:p-6 ${isCurrent ? style.box : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${isCurrent ? style.badge : 'bg-slate-100 text-slate-600'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{getSeverity(alert.severity).label}
            </span>
            <span className="text-slate-500">{categoryName}</span>
            <span className={phase === 'active' ? 'text-red-700' : phase === 'all_clear' ? 'text-emerald-700' : 'text-slate-500'}>· {ALERT_PHASE_LABELS[phase]}</span>
          </div>

          <h1 className="mt-3 text-xl font-bold leading-7 sm:text-2xl">{alert.title}</h1>

          {phase === 'all_clear' ? (
            <div className="mt-4 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">All clear · {formatAlertTime(alert.all_clear_at)}</p>
                <p className="mt-0.5 text-sm">{alert.all_clear_message}</p>
              </div>
            </div>
          ) : null}
          {phase === 'withdrawn' ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>This alert was withdrawn</strong> on {formatAlertTime(alert.cancelled_at)}.{alert.cancel_reason ? ` ${alert.cancel_reason}` : ''}
            </p>
          ) : null}

          <p className="mt-4 whitespace-pre-line text-base leading-7 text-slate-800">{alert.message}</p>

          <dl className="mt-5 grid gap-3 border-t border-slate-200/70 pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Area</dt>
              <dd className="mt-0.5 flex items-start gap-1"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{alert.affected_area || (alert.barangays?.length ? alert.barangays.join(', ') : 'All of Daet')}</dd>
              {alert.affected_area && alert.barangays?.length ? <dd className="mt-1 text-xs text-slate-500">{alert.barangays.join(', ')}</dd> : null}
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Issued</dt>
              <dd className="mt-0.5"><time dateTime={alert.sent_at}>{formatAlertTime(alert.sent_at)}</time>{alert.edited_after_send ? <span className="text-slate-500"> · updated {formatAlertTime(alert.updated_at)}</span> : null}</dd>
              {alert.expires_at ? <dd className="mt-1 text-xs text-slate-500">{phase === 'expired' ? 'Ended' : 'Until'} {formatAlertTime(alert.expires_at)}</dd> : null}
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={share} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Share2 className="h-4 w-4" aria-hidden="true" />{copied ? 'Link copied' : 'Share'}
            </button>
          </div>
        </article>

        <p className="mt-4 text-center text-xs text-slate-500">Issued by the Daet tourism office through CONNECT-Daet. In an emergency, follow instructions from local authorities.</p>
      </div>
    </main>
  )
}
