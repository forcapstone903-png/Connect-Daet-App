'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Eye, EyeOff, KeyRound } from 'lucide-react'
import { getPasswordChecks, getPasswordStrength, isPasswordValid } from '@/lib/passwordPolicy'
import { supabase } from '@/lib/supabase'
import '../auth.css'

function ResetPasswordContent() {
  const router = useRouter()
  const recoveryPromiseRef = useRef(null)
  const [accessToken, setAccessToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loadingLink, setLoadingLink] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    if (!recoveryPromiseRef.current) {
      recoveryPromiseRef.current = (async () => {
        const searchParams = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams(window.location.hash.slice(1))
        const code = searchParams.get('code')
        const tokenHash = searchParams.get('token_hash')
        const tokenType = searchParams.get('type') || hashParams.get('type')
        const recoveryPending = window.sessionStorage.getItem('daet:password-recovery-pending') === '1'
        let authError = null

        if (code) {
          const result = await supabase.auth.exchangeCodeForSession(code)
          authError = result.error
        } else if (tokenHash && tokenType === 'recovery') {
          const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
          authError = result.error
        } else if (tokenType === 'recovery') {
          const token = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')
          if (token && refreshToken) {
            const result = await supabase.auth.setSession({ access_token: token, refresh_token: refreshToken })
            authError = result.error
          }
        } else if (recoveryPending) {
          const { error } = await supabase.auth.getSession()
          authError = error
        } else {
          authError = new Error('The recovery link is invalid or expired.')
        }

        if (!authError) {
          const { data, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) authError = sessionError
          else if (data.session?.access_token) {
            window.sessionStorage.removeItem('daet:password-recovery-pending')
            return { accessToken: data.session.access_token }
          }
          else authError = new Error('The recovery link is invalid or expired.')
        }

        return { errorMessage: authError.message }
      })()
    }

    recoveryPromiseRef.current.then(({ accessToken: token }) => {
      if (!active) return
      if (token) setAccessToken(token)
      else setError('This password reset link is invalid, expired, or already used. Request a new link to continue.')
      setLoadingLink(false)
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }).catch((sessionError) => {
      if (!active) return
      console.error('Password recovery session could not be established:', { message: sessionError.message })
      setError('This password reset link is invalid, expired, or already used. Request a new link to continue.')
      setLoadingLink(false)
      window.history.replaceState(window.history.state, '', window.location.pathname)
    })

    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!isPasswordValid(password)) {
      setError('Meet all password requirements before saving.')
      return
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }
    if (!accessToken) {
      setError('This password reset link is invalid or expired. Request a new link.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/info/api/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ newPassword: password }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to reset your password. Request a new link and try again.')
      }

      await supabase.auth.signOut({ scope: 'local' })
      const notificationMessage = result.emailNotificationSent
        ? ' A security notification was sent to your registered email.'
        : ' Your password was reset, but the security notification could not be delivered.'
      const sessionMessage = result.sessionsRevoked
        ? ' Other active sessions were signed out.'
        : ' Some active sessions may need to be signed out manually.'
      setSuccess(`Your password was reset successfully.${notificationMessage}${sessionMessage}`)
      setPassword('')
      setConfirmPassword('')
      window.setTimeout(() => {
        router.replace('/info/login?message=Password%20reset%20successful.%20Please%20sign%20in%20with%20your%20new%20password.')
      }, 2200)
    } catch (requestError) {
      setError(requestError.message || 'Unable to reset your password right now.')
    } finally {
      setLoading(false)
    }
  }

  const strength = getPasswordStrength(password)
  const checks = getPasswordChecks(password)
  const strengthColor = {
    Weak: 'bg-red-500',
    Medium: 'bg-amber-500',
    Strong: 'bg-emerald-500',
  }[strength.label]
  const canReset = Boolean(accessToken)

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
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Create a new password</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Choose a strong password you have not used for this account.</p>
          </div>

          {loadingLink ? (
            <p role="status" className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">Verifying your secure reset link...</p>
          ) : null}

          {error ? (
            <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {error}
              {!canReset ? <p className="mt-2"><Link href="/info/forgot-password" className="font-bold underline">Request a new reset link</Link></p> : null}
            </div>
          ) : null}

          {success ? (
            <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">{success}</p>
          ) : null}

          {!loadingLink && !success && canReset ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="reset-password" className="mb-2 block text-sm font-semibold text-slate-700">New password</label>
                <div className="relative">
                  <input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-slate-900 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-100"
                    placeholder="Create a new password"
                  />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-blue-700">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-3 space-y-2" aria-live="polite">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">Password strength</span>
                    <span className="font-bold text-slate-700">{password ? strength.label : 'Not set'}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: `${(strength.score / checks.length) * 100}%` }} />
                  </div>
                  <ul className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                    {checks.map((check) => (
                      <li key={check.key} className="flex items-center gap-1.5">
                        <Check className={`h-3.5 w-3.5 ${check.valid ? 'text-emerald-600' : 'text-slate-300'}`} aria-hidden="true" />
                        {check.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <label htmlFor="reset-confirm-password" className="mb-2 block text-sm font-semibold text-slate-700">Confirm new password</label>
                <div className="relative">
                  <input
                    id="reset-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    maxLength={128}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-slate-900 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-100"
                    placeholder="Enter your new password again"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-blue-700">
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword ? <p className="mt-1 text-xs font-medium text-red-600">Passwords do not match.</p> : null}
              </div>

              <button
                type="submit"
                disabled={loading || !isPasswordValid(password) || password !== confirmPassword}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Updating password...' : 'Reset password'}
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="auth-page min-h-dvh bg-[#eef3fb]" />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
