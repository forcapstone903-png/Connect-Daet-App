'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react'

const EVIDENCE_LIMIT = 20 * 1024 * 1024

export default function AccountAppealPage() {
  const [token, setToken] = useState('')
  const [caseReference, setCaseReference] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [explanation, setExplanation] = useState('')
  const [evidenceFiles, setEvidenceFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentUrl = new URL(window.location.href)
      const linkParameters = new URLSearchParams(currentUrl.hash.slice(1))
      const accessToken = linkParameters.get('token') || ''
      setCaseReference(linkParameters.get('caseReference') || '')
      if (accessToken) {
        window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}`)
      }
      setToken(accessToken)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const requestAccess = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/info/api/user/moderation-appeals', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request-access',
          caseReference: caseReference.trim(),
          email: email.trim(),
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to request an appeal link.')
      setSuccess(result.message || 'If those details match, a secure appeal link will be sent shortly.')
    } catch (requestError) {
      setError(requestError.message || 'Unable to request an appeal link.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitAppeal = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')
    const totalBytes = evidenceFiles.reduce((sum, file) => sum + file.size, 0)
    if (evidenceFiles.length > 3 || totalBytes > EVIDENCE_LIMIT) {
      setError('Attach no more than three supported files totaling 20 MB.')
      setSubmitting(false)
      return
    }

    try {
      const formData = new FormData()
      formData.set('token', token)
      formData.set('caseReference', caseReference.trim())
      formData.set('reason', reason.trim())
      formData.set('explanation', explanation.trim())
      evidenceFiles.forEach((file) => formData.append('evidence', file))
      const response = await fetch('/info/api/user/moderation-appeals', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to submit your appeal.')
      setSuccess('Your appeal was submitted for authorized staff review.')
      setReason('')
      setExplanation('')
      setEvidenceFiles([])
      window.history.replaceState({}, '', '/info/account-appeal')
      setToken('')
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit your appeal.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/info/visitor" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Daet Connect
        </Link>
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-sky-50 p-3 text-sky-700">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Connect Daet · Account review</p>
              <h1 className="mt-1 text-2xl font-bold">Account Appeal</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use the case reference and email address registered to the account to request a one-time secure appeal link.
                If you already received a link, open it to submit an appeal without signing in.
              </p>
            </div>
          </div>

          {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
          {success && (
            <p role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {success}
            </p>
          )}

          {token ? (
            <form onSubmit={submitAppeal} className="mt-6 space-y-4">
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                Case reference: <span className="font-mono font-semibold">{caseReference || 'Verified by your secure appeal link'}</span>
              </p>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="appeal-reason">
                Appeal reason
                <input
                  id="appeal-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={2000}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="Briefly state why you are appealing."
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="appeal-explanation">
                Explanation
                <textarea
                  id="appeal-explanation"
                  value={explanation}
                  onChange={(event) => setExplanation(event.target.value)}
                  maxLength={5000}
                  rows={6}
                  required
                  className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="Provide context and any information the reviewers should consider."
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="appeal-evidence">
                Supporting evidence (optional)
                <input
                  id="appeal-evidence"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                  onChange={(event) => setEvidenceFiles(Array.from(event.target.files || []))}
                  className="mt-2 block w-full text-sm font-normal text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-800 hover:file:bg-sky-100"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">Up to three supported images or videos, totaling no more than 20 MB.</span>
              </label>
              <button
                type="submit"
                disabled={submitting || !reason.trim() || !explanation.trim()}
                className="rounded-full bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit appeal'}
              </button>
            </form>
          ) : (
            <form onSubmit={requestAccess} className="mt-6 space-y-4">
              <label className="block text-sm font-semibold text-slate-800" htmlFor="case-reference">
                Case reference number
                <input
                  id="case-reference"
                  value={caseReference}
                  onChange={(event) => setCaseReference(event.target.value)}
                  required
                  maxLength={100}
                  autoComplete="off"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="Enter the case reference from your notice"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="registered-email">
                Registered email address
                <input
                  id="registered-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={320}
                  autoComplete="email"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="you@example.com"
                />
              </label>
              <button
                type="submit"
                disabled={submitting || !caseReference.trim() || !email.trim()}
                className="rounded-full bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Requesting link...' : 'Email me a secure appeal link'}
              </button>
              <p className="text-xs leading-5 text-slate-500">For your privacy, this page does not confirm whether a case reference or email address matches an account.</p>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
