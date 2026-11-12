'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react'

export default function ModerationAppealsPage() {
  const [restriction, setRestriction] = useState(null)
  const [appeals, setAppeals] = useState([])
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadAppeals = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/info/api/user/moderation-appeals', { credentials: 'same-origin', cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load appeal information.')
      setRestriction(result.restriction || null)
      setAppeals(Array.isArray(result.appeals) ? result.appeals : [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load appeal information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAppeals()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadAppeals])

  const submitAppeal = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/info/api/user/moderation-appeals', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to submit your appeal.')
      setReason('')
      setSuccess('Your appeal was submitted for moderator review.')
      await loadAppeals()
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit your appeal.')
    } finally {
      setSubmitting(false)
    }
  }

  const hasPendingAppeal = appeals.some((appeal) => appeal.status === 'pending')

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/info/user/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to dashboard
        </Link>
        <header className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-sky-50 p-3 text-sky-700"><ShieldAlert className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <h1 className="text-xl font-bold">Posting restriction appeals</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">Review your current restriction and submit a request for moderator review.</p>
            </div>
          </div>
          {loading ? <p className="mt-6 text-sm text-slate-500">Loading your appeal information...</p> : restriction ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 font-semibold text-amber-900"><AlertCircle className="h-4 w-4" aria-hidden="true" /> Posting is currently restricted</p>
              <p className="mt-2 text-sm text-amber-900">{restriction.reason}</p>
              <p className="mt-2 text-xs text-amber-800">
                {restriction.expires_at ? `Restriction ends ${new Date(restriction.expires_at).toLocaleString()}.` : 'This restriction has no automatic expiry.'}
              </p>
            </div>
          ) : !error ? (
            <p className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">You do not have an active posting restriction.</p>
          ) : null}
        </header>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{success}</p>}

        {!loading && restriction && !hasPendingAppeal && (
          <form onSubmit={submitAppeal} className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label htmlFor="appeal-reason" className="block text-sm font-semibold text-slate-800">Why should this restriction be reviewed?</label>
            <textarea
              id="appeal-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
              required
              rows={5}
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder="Explain the context and why you are requesting a review."
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">{reason.length}/2,000 characters</p>
              <button type="submit" disabled={submitting || !reason.trim()} className="rounded-full bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? 'Submitting...' : 'Submit appeal'}
              </button>
            </div>
          </form>
        )}

        {hasPendingAppeal && (
          <p className="mt-5 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" /> Your appeal is waiting for moderator review.
          </p>
        )}

        {appeals.length > 0 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Appeal history</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {appeals.map((appeal) => (
                <article key={appeal.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-slate-800">{appeal.status}</p>
                    <p className="text-xs text-slate-500">{new Date(appeal.created_at).toLocaleString()}</p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{appeal.reason}</p>
                  {appeal.decision_notes && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden="true" />Moderator note: {appeal.decision_notes}</p>}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
