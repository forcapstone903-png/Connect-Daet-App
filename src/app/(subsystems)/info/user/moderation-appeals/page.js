'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react'

export default function ModerationAppealsPage() {
  const [restriction, setRestriction] = useState(null)
  const [accountSuspension, setAccountSuspension] = useState(null)
  const [appeals, setAppeals] = useState([])
  const [reason, setReason] = useState('')
  const [explanation, setExplanation] = useState('')
  const [evidenceFiles, setEvidenceFiles] = useState([])
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
      setAccountSuspension(result.accountSuspension || null)
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
    const form = event.currentTarget
    setSubmitting(true)
    setError('')
    setSuccess('')
    const totalEvidenceSize = evidenceFiles.reduce((total, file) => total + file.size, 0)
    if (evidenceFiles.length > 3 || totalEvidenceSize > 20 * 1024 * 1024) {
      setError('Attach no more than three supported files totaling 20 MB.')
      setSubmitting(false)
      return
    }
    try {
      const formData = new FormData()
      const requestedFollowUp = appeals.find((appeal) => appeal.status === 'more_information_required')
      formData.set('caseReference', accountSuspension?.id || restriction?.id || '')
      formData.set('appealId', requestedFollowUp?.id || '')
      formData.set('reason', reason || requestedFollowUp?.reason || '')
      formData.set('explanation', explanation)
      evidenceFiles.forEach((file) => formData.append('evidence', file))
      const response = await fetch('/info/api/user/moderation-appeals', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to submit your appeal.')
      setReason('')
      setExplanation('')
      setEvidenceFiles([])
      form.reset()
      setSuccess('Your appeal was submitted for moderator review.')
      await loadAppeals()
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit your appeal.')
    } finally {
      setSubmitting(false)
    }
  }

  const hasPendingAppeal = appeals.some((appeal) => ['pending', 'under_review'].includes(appeal.status))
  const appealNeedsInformation = appeals.find((appeal) => appeal.status === 'more_information_required')
  const hasAppealableRestriction = Boolean(accountSuspension || restriction)

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href={accountSuspension ? '/info/account-suspended' : '/info/user/dashboard'} className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {accountSuspension ? 'Back to suspension notice' : 'Back to dashboard'}
        </Link>
        <header className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-sky-50 p-3 text-sky-700"><ShieldAlert className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <h1 className="text-xl font-bold">Account and posting restriction appeals</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">Review your current restriction and submit a request for moderator review.</p>
            </div>
          </div>
          {loading ? (
            <div className="mt-6 animate-pulse space-y-3 rounded-xl border border-slate-200 p-4" role="status" aria-label="Loading appeal information">
              <div className="h-4 w-2/5 rounded bg-slate-200" aria-hidden="true" />
              <div className="h-3 w-full rounded bg-slate-100" aria-hidden="true" />
              <div className="h-3 w-4/5 rounded bg-slate-100" aria-hidden="true" />
            </div>
          ) : accountSuspension ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="flex items-center gap-2 font-semibold text-red-900"><AlertCircle className="h-4 w-4" aria-hidden="true" /> Your account is suspended</p>
              <p className="mt-2 text-sm text-red-900">{accountSuspension.reason}</p>
              <p className="mt-2 text-xs text-red-800">
                {accountSuspension.expires_at ? `Suspension ends ${new Date(accountSuspension.expires_at).toLocaleString()}.` : 'This suspension has no automatic expiry.'}
              </p>
            </div>
          ) : restriction ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 font-semibold text-amber-900"><AlertCircle className="h-4 w-4" aria-hidden="true" /> Posting is currently restricted</p>
              <p className="mt-2 text-sm text-amber-900">{restriction.reason}</p>
              <p className="mt-2 text-xs text-amber-800">
                {restriction.expires_at ? `Restriction ends ${new Date(restriction.expires_at).toLocaleString()}.` : 'This restriction has no automatic expiry.'}
              </p>
            </div>
          ) : !error ? (
            <p className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">You do not have an active account suspension or posting restriction.</p>
          ) : null}
        </header>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{success}</p>}

        {!loading && hasAppealableRestriction && !hasPendingAppeal && (
          <form onSubmit={submitAppeal} className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-4 text-xs text-slate-500">Case reference: <span className="font-mono">{accountSuspension?.id || restriction?.id}</span></p>
            <label htmlFor="appeal-reason" className="block text-sm font-semibold text-slate-800">
              {accountSuspension ? 'Why should this account suspension be appealed?' : 'Why should this posting restriction be reviewed?'}
            </label>
            <textarea
              id="appeal-reason"
              value={reason || appealNeedsInformation?.reason || ''}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
              required
              rows={5}
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder="Explain the context and why you are requesting a review."
            />
            <label htmlFor="appeal-explanation" className="mt-4 block text-sm font-semibold text-slate-800">
              {appealNeedsInformation ? 'Additional information requested' : 'Explanation'}
            </label>
            {appealNeedsInformation?.decision_notes && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Review team request: {appealNeedsInformation.decision_notes}
              </p>
            )}
            <textarea
              id="appeal-explanation"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              maxLength={5000}
              required
              rows={5}
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder="Provide your explanation and any requested information."
            />
            <label htmlFor="appeal-evidence" className="mt-4 block text-sm font-semibold text-slate-800">Supporting evidence (optional)</label>
            <input
              id="appeal-evidence"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
              onChange={(event) => setEvidenceFiles(Array.from(event.target.files || []))}
              className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-800 hover:file:bg-sky-100"
              aria-describedby="appeal-evidence-help"
            />
            <p id="appeal-evidence-help" className="mt-1 text-xs text-slate-500">Attach up to three supported images or videos, totaling no more than 20 MB. Files are visible only to you and authorized moderators.</p>
            {evidenceFiles.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {evidenceFiles.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB</li>)}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">{(reason || appealNeedsInformation?.reason || '').length}/2,000 reason characters · {explanation.length}/5,000 explanation characters</p>
              <button type="submit" disabled={submitting || !(reason || appealNeedsInformation?.reason || '').trim() || !explanation.trim()} className="rounded-full bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? 'Submitting...' : appealNeedsInformation ? 'Send additional information' : 'Submit appeal'}
              </button>
            </div>
          </form>
        )}

        {hasPendingAppeal && (
          <p className="mt-5 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" /> Your appeal is {appeals.find((appeal) => ['pending', 'under_review'].includes(appeal.status))?.status === 'under_review' ? 'under review' : 'waiting for review'}.
          </p>
        )}

        {appeals.length > 0 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Appeal history</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {appeals.map((appeal) => (
                <article key={appeal.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-slate-800">
                      {appeal.appeal_type === 'account_suspension' ? 'Account suspension appeal' : 'Posting restriction appeal'} · {appeal.status}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(appeal.created_at).toLocaleString()}</p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{appeal.reason}</p>
                  {appeal.explanation && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{appeal.explanation}</p>}
                  {appeal.evidence?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      {appeal.evidence.map((file) => file.url
                        ? <a key={file.name} href={file.url} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 underline">{file.name}</a>
                        : <span key={file.name} className="text-slate-500">{file.name} (unavailable)</span>)}
                    </div>
                  )}
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
