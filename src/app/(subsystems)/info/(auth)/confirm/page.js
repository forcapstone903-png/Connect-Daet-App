'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function AuthConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const queryEmail = searchParams.get('email')
  const missingVerification = !tokenHash || !type
  const [message, setMessage] = useState('Verifying your email...')
  const emailInputRef = useRef(null)
  const [canResend, setCanResend] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    if (emailInputRef.current) {
      emailInputRef.current.value = queryEmail || ''
    }

    if (missingVerification) {
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

        setMessage('✅ Email verified successfully. Redirecting to login...')

        setTimeout(() => {
          router.push('/info/login?message=Your email has been verified. Please sign in.&onboarding=1')
        }, 2000)
      } catch (error) {
        setMessage(error.message || 'Unable to verify your email right now.')
        setCanResend(true)
      }
    }

    confirmEmail()
  }, [missingVerification, queryEmail, router, tokenHash, type])

  const handleResend = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') || '').trim()
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
        <p className="mt-4 text-gray-600">
          {missingVerification
            ? 'Missing or expired verification data. Request a new confirmation email below.'
            : message}
        </p>
        {(canResend || missingVerification) && (
          <form onSubmit={handleResend} className="mt-6 space-y-3 text-left">
            <label htmlFor="verification-email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              ref={emailInputRef}
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