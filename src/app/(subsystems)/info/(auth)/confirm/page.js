'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function AuthConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const queryEmail = searchParams.get('email')
  const missingVerification = !tokenHash || !type
  const [message, setMessage] = useState(
    missingVerification ? 'Checking your verification status...' : 'Verifying your email...'
  )
  const [emailVerified, setEmailVerified] = useState(false)
  const [emailAddress, setEmailAddress] = useState(queryEmail || '')
  const [canResend, setCanResend] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    if (missingVerification) {
      const checkVerifiedSession = async () => {
        try {
          if (!supabase) throw new Error('Supabase authentication is not configured.')

          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError

          if (!session) {
            setMessage('Verification link data is missing or may already have been used. If you already verified your email, sign in; otherwise request a new confirmation email.')
            return
          }

          const { data: { user }, error: userError } = await supabase.auth.getUser()
          if (userError) throw userError

          if (user?.email_confirmed_at) {
            setMessage('Your email is already verified. Continue to sign in.')
            setEmailVerified(true)
            return
          }

          setMessage('The verification link is missing its token or may no longer be valid. Sign in if you already verified, or request a new email below.')
        } catch (error) {
          console.error('Email verification status check failed:', error)
          setMessage('We could not confirm your email status. If you have already verified, sign in; otherwise request a new confirmation email below.')
        }
      }

      void checkVerifiedSession()
      return
    }

    const confirmEmail = async () => {
      try {
        const response = await fetch('/info/api/auth/confirm-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_hash: tokenHash, type }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || 'Email verification failed.')
        }

        setMessage('Email verified successfully. Redirecting to login...')
        setEmailVerified(true)

        setTimeout(() => {
          router.push('/info/login?message=Your email has been verified. Please sign in.&onboarding=1')
        }, 2000)
      } catch (error) {
        setMessage(error.message || 'Unable to verify your email right now.')
        setCanResend(true)
      }
    }

    confirmEmail()
  }, [missingVerification, router, tokenHash, type])

  const handleResend = async (event) => {
    event.preventDefault()
    const email = emailAddress.trim()
    setResending(true)
    setResendMessage('')
    setResendError('')

    try {
      const response = await fetch('/info/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to resend verification email.')
      }

      setResendMessage('A new confirmation email has been sent. Check your inbox.')
    } catch (error) {
      setResendError(error.message || 'Unable to resend the confirmation email right now.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="h-16 w-16 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800">Email Verification</h2>
        <p className="mt-4 text-gray-600">{message}</p>
        {emailVerified && (
          <Link
            href="/info/login"
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            Continue to sign in
          </Link>
        )}
        {missingVerification && !emailVerified && !canResend && (
          <div className="mt-6 space-y-3">
            <Link
              href="/info/login"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              Already verified? Sign in
            </Link>
            <button
              type="button"
              onClick={() => setCanResend(true)}
              className="w-full text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              Need another email? Request one
            </button>
          </div>
        )}
        {canResend && !emailVerified && (
          <form onSubmit={handleResend} className="mt-6 space-y-3 text-left">
            <label htmlFor="verification-email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              name="email"
              id="verification-email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="you@example.com"
            />
            <button
              type="submit"
              disabled={resending}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending ? 'Sending...' : 'Resend confirmation email'}
            </button>
            {resendMessage && <p role="status" className="text-sm text-green-700">{resendMessage}</p>}
            {resendError && <p role="alert" className="text-sm text-red-700">{resendError}</p>}
          </form>
        )}
      </div>
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-800">Email Verification</h2>
          <p className="mt-4 text-gray-600">Verifying your email...</p>
        </div>
      </div>
    }>
      <AuthConfirmContent />
    </Suspense>
  )
}