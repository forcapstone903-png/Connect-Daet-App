'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { formatSuspensionDuration } from '@/lib/suspensionDuration.mjs'

const STATUS_LABELS = {
  active: 'Active',
  pending: 'Pending',
  suspended: 'Suspended',
  banned: 'Banned',
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatAction(value) {
  return String(value || 'Moderation decision')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function ModerationDetailsPage() {
  const [decision, setDecision] = useState(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const decisionId = new URLSearchParams(window.location.search).get('decision') || ''
      if (!decisionId) {
        setError('This notification does not include a moderation decision reference.')
        setLoading(false)
        return
      }

      void (async () => {
        try {
          const response = await fetch(`/info/api/user/moderation-details?decision=${encodeURIComponent(decisionId)}`, {
            credentials: 'same-origin',
            cache: 'no-store',
          })
          const result = await response.json()
          if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load moderation details.')
          setDecision(result.decision)
          setReport(result.report || null)
        } catch (loadError) {
          setError(loadError.message || 'Unable to load moderation details.')
        } finally {
          setLoading(false)
        }
      })()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/info/user/notifications" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to notifications
        </Link>
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-sky-50 p-3 text-sky-700">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-xl font-bold">Moderation details</h1>
              <p className="mt-1 text-sm text-slate-600">Information about the account status action recorded by Connect Daet administration.</p>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 animate-pulse space-y-5" role="status" aria-label="Loading moderation details">
              <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2" aria-hidden="true">
                {[0, 1, 2, 3].map((item) => <div key={item} className="h-12 rounded-lg bg-slate-200/70" />)}
              </div>
              <div className="space-y-3" aria-hidden="true">
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="h-24 rounded-xl bg-slate-100" />
              </div>
            </div>
          ) : null}
          {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
          {decision ? (
            <div className="mt-6 space-y-5">
              <dl className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action</dt><dd className="mt-1 font-semibold">{formatAction(decision.decision_type)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recorded</dt><dd className="mt-1">{formatDate(decision.created_at)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous status</dt><dd className="mt-1">{STATUS_LABELS[decision.previous_status] || decision.previous_status || '—'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current status after action</dt><dd className="mt-1">{STATUS_LABELS[decision.new_status] || decision.new_status || '—'}</dd></div>
                {decision.suspension_duration_days ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</dt><dd className="mt-1">{formatSuspensionDuration(decision.suspension_duration_days)}</dd></div> : null}
                {decision.effective_at ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Effective from</dt><dd className="mt-1">{formatDate(decision.effective_at)}</dd></div> : null}
                {decision.expires_at ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suspension ends</dt><dd className="mt-1">{formatDate(decision.expires_at)}</dd></div> : null}
                {decision.violation_category ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guideline category</dt><dd className="mt-1">{decision.violation_category}</dd></div> : null}
              </dl>

              <section>
                <h2 className="text-sm font-bold text-slate-900">Moderation reason</h2>
                <p className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-700">{decision.reason}</p>
              </section>

              {report ? (
                <section>
                  <h2 className="text-sm font-bold text-slate-900">Related report</h2>
                  <div className="mt-2 rounded-xl border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">{report.report_type || 'Report'} · {formatDate(report.created_at)}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{report.reason}</p>
                    {report.description ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{report.description}</p> : null}
                    <p className="mt-3 text-xs text-slate-500">Report reference: {report.id}</p>
                  </div>
                </section>
              ) : null}

              {decision.new_status === 'suspended' || decision.new_status === 'banned' ? (
                <Link href="/info/user/moderation-appeals" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-sky-700 px-5 text-sm font-bold text-white hover:bg-sky-800">
                  View appeal options
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
