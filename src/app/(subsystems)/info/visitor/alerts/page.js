'use client'

// Public alerts: what is happening now, plus past alerts.
// Live via Supabase Realtime (see useAlertFeed).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronLeft, RefreshCw } from 'lucide-react'
import { useAlertFeed } from '@/lib/useAlertFeed'
import AlertCard from './_components/AlertCard'
import DeviceAlertsCard from './_components/DeviceAlertsCard'

export default function PublicAlertsPage() {
  const { current, past, categories, loading, error, refresh, connectionStatus } = useAlertFeed({ channelName: 'visitor-alerts-page', limit: 100 })
  const [category, setCategory] = useState('all')
  const [now] = useState(() => Date.now())

  const categoryName = (slug) => categories.find((item) => item.slug === slug)?.name || slug
  const filteredPast = useMemo(
    () => (category === 'all' ? past : past.filter((alert) => alert.category === category)),
    [past, category]
  )

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-5xl px-4 pb-12 pt-4 sm:px-6">
        <Link href="/info/visitor" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />Home
        </Link>

        <header className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Alerts for Daet</h1>
            <p className="mt-1 text-sm text-slate-600">Official weather, sea, traffic and emergency alerts from the Daet tourism office.</p>
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-500" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${connectionStatus === 'live' ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
            {connectionStatus === 'live' ? 'Live updates on' : 'Checking for updates'}
            <button type="button" onClick={() => { void refresh() }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-white" aria-label="Refresh alerts">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh
            </button>
          </p>
        </header>

        {error ? <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error} Showing the last alerts we could load.</p> : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-8">
            <section aria-labelledby="current-alerts-heading">
              <h2 id="current-alerts-heading" className="text-sm font-bold uppercase tracking-wide text-slate-500">Happening now</h2>
              {loading ? (
                <div className="mt-3 h-28 animate-pulse rounded-2xl bg-white" aria-hidden="true" />
              ) : current.length ? (
                <ul className="mt-3 space-y-3">
                  {current.map((alert) => <li key={alert.id}><AlertCard alert={alert} categoryName={categoryName} now={now} /></li>)}
                </ul>
              ) : (
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                  <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold">No active alerts</p>
                    <p className="text-xs">There are no current weather, traffic or safety alerts for Daet.</p>
                  </div>
                </div>
              )}
            </section>

            <section aria-labelledby="past-alerts-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="past-alerts-heading" className="text-sm font-bold uppercase tracking-wide text-slate-500">Past alerts</h2>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  Category
                  <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal text-slate-700">
                    <option value="all">All</option>
                    {categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                  </select>
                </label>
              </div>
              {loading ? null : filteredPast.length ? (
                <ul className="mt-3 space-y-2">
                  {filteredPast.map((alert) => <li key={alert.id}><AlertCard alert={alert} categoryName={categoryName} now={now} compact /></li>)}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No past alerts{category === 'all' ? '' : ' in this category'}.</p>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <DeviceAlertsCard categories={categories} />
          </aside>
        </div>
      </div>
    </main>
  )
}
