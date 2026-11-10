'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react'
import '../auth.css'

function AccountRecoveryForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [emailNotificationSent, setEmailNotificationSent] = useState(false)
  const scheduledNotice = searchParams.get('scheduled') === '1'
  const scheduledEmailSent = searchParams.get('emailNotificationSent') === 'true'
  const scheduledForParam = searchParams.get('deletionScheduledFor')
  const scheduledFor = scheduledForParam && Number.isFinite(Date.parse(scheduledForParam))
    ? new Date(scheduledForParam).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
    : null

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setPending(true)

    try {
      const response = await fetch('/info/api/account/recovery', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to restore the account.')
      }

      setSuccess(result.message)
      setEmailNotificationSent(result.emailNotificationSent === true)
      setPassword('')
    } catch (requestError) {
      setError(requestError.message || 'Unable to restore the account right now.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-page min-h-dvh bg-gradient-to-br from-[#edf2f9] via-[#f7f9fc] to-[#e7effb] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col justify-center">
        <Link href="/info/login" className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-800">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>

        <section className="rounded-2xl border border-white/80 bg-white/90 p-6 shadow-xl shadow-blue-900/5 backdrop-blur sm:p-8">
          <div className="mb-7 text-center">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB] ring-1 ring-blue-100">
              <KeyRound className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-700">DAET CONNECT</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Restore your account</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Sign in with your account email and password to cancel a deletion request during the 30-day grace period.
            </p>
          </div>

          {scheduledNotice ? (
            <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Your account is scheduled for permanent deletion{scheduledFor ? ` on ${scheduledFor}` : ''}. You have 30 days from the request to restore your account.
              {scheduledEmailSent ? ' A confirmation email was sent.' : ' The confirmation email could not be delivered.'}
            </p>
          ) : null}

          {error ? <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          {success ? (
            <div role="status" aria-live="polite" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
              <p>{success}</p>
              <p className="mt-2">{emailNotificationSent ? 'A confirmation email was sent.' : 'The confirmation email could not be delivered.'}</p>
              <Link href="/info/login" className="mt-3 inline-flex font-bold text-blue-700 underline">Continue to sign in</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="recovery-email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <div>
                <label htmlFor="recovery-password" className="mb-2 block text-sm font-semibold text-slate-700">Current password</label>
                <input
                  id="recovery-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <p className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Your password is used only to verify your identity. It is never stored or emailed.
              </p>
              <button
                type="submit"
                disabled={pending}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? 'Verifying...' : 'Cancel deletion request'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}

export default function AccountRecoveryPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-[#f1f5f9]" aria-busy="true" />}>
      <AccountRecoveryForm />
    </Suspense>
  )
}
