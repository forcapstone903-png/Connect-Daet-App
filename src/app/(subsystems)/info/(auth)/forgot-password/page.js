'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react'
import '../auth.css'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/info/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.message || 'Password recovery is temporarily unavailable. Try again later.')
      }

      setSuccess(true)
      setEmail('')
    } catch (requestError) {
      setError(requestError.message || 'Password recovery is temporarily unavailable. Try again later.')
    } finally {
      setLoading(false)
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
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Forgot your password?</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Enter your account email and we’ll send instructions to reset your password.
            </p>
          </div>

          {error ? (
            <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          ) : null}

          {success ? (
            <div role="status" aria-live="polite" className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-900">
              <div className="flex items-start gap-3">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#2563EB]" aria-hidden="true" />
                <p>If an account exists for that email, a password reset link will be sent. Check your inbox and spam folder.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="recovery-email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
                <input
                  id="recovery-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-600">
            Remember your password?{' '}
            <Link href="/info/login" className="font-bold text-[#2563EB] hover:underline">Sign in</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
