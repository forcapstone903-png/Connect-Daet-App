'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthConfirmPage() {
  const router = useRouter()
  
  // Derive initial message from URL params synchronously
  const [message, setMessage] = useState(() => {
    if (typeof window === 'undefined') return 'Verifying your email...'
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    if (!tokenHash || !type) {
      return 'Missing verification data. Please request a new confirmation email.'
    }
    return 'Verifying your email...'
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')

    if (!tokenHash || !type) {
      return
    }

    const confirmEmail = async () => {
      try {
        const response = await fetch('/api/auth/confirm-email', {
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
          router.push('/login?message=Your email has been verified. Please sign in.&onboarding=1')
        }, 2000)
      } catch (error) {
        setMessage(error.message || 'Unable to verify your email right now.')
      }
    }

    confirmEmail()
  }, [router])

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
      </div>
    </div>
  )
}