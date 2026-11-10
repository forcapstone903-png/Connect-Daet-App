'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
import { setAuthCookie } from '@/lib/authCookies'
import { supabase } from '@/lib/supabase'
import '../auth.css'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [verificationSent, setVerificationSent] = useState(false)
  const [resending, setResending] = useState(false)
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const messageFromQuery = searchParams.get('message') || ''
      if (messageFromQuery) {
        setMessage(messageFromQuery)
      } else {
        const rememberSessionRaw = localStorage.getItem('daet_remember_me_session')
        if (rememberSessionRaw) {
          try {
            const rememberSession = JSON.parse(rememberSessionRaw)
            if (rememberSession?.expiresAt && Number(rememberSession.expiresAt) > Date.now()) {
              setMessage('Welcome back! Your session is still active.')
            }
          } catch (error) {
            console.error('Failed to parse remembered session:', error)
          }
        }
      }

      const remembered = localStorage.getItem('remembered_email') || ''
      setFormData({ email: remembered, password: '' })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [searchParams])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleResendVerification = async () => {
    if (!formData.email.trim()) {
      setError('Enter your email address before requesting a new verification email.')
      return
    }

    setResending(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/info/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email.trim() }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to resend verification email')
      }

      setVerificationSent(true)
      setMessage('A new verification email has been sent.')
    } catch (err) {
      setError(err.message || 'Unable to resend the verification email right now.')
    } finally {
      setResending(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    setVerificationSent(false)

    try {
      const response = await fetch('/info/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          rememberMe,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to sign in right now')
      }

      const user = data.user
      const shouldStartOnboarding = user.onboarding_completed !== true && (
        searchParams.get('onboarding') === '1' || user.onboarding_completed === false
      )
      const sessionData = {
        user_id: user.id,
        user_name: user.full_name,
        user_email: user.email,
        role: user.user_type,
        avatar_url: user.profile_image_url || '',
        profile_image_url: user.profile_image_url || '',
        onboarding_completed: !!user.onboarding_completed,
        logged_in: true,
        login_time: new Date().toISOString(),
      }

      if (data.session?.access_token && data.session?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        })

        if (sessionError) {
          console.warn('Supabase session sync warning:', sessionError)
        }
      }

      sessionStorage.setItem('user_session', JSON.stringify(sessionData))
      setAuthCookie(sessionData, rememberMe ? 30 : 1)

      // Remembered sessions are persisted server-side via the HTTP-only
      // `daet_secure_session` cookie (see /info/api/login). The localStorage entry
      // below is only a convenience reminder for the "welcome back" banner; it
      // is no longer used to restore authentication.
      const rememberMeKey = 'daet_remember_me_session'

      if (rememberMe) {
        const rememberSession = {
          userId: user.id,
          email: user.email,
          userName: user.full_name,
          token: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        }
        localStorage.setItem(rememberMeKey, JSON.stringify(rememberSession))
        localStorage.setItem('remembered_email', formData.email)
      } else {
        localStorage.removeItem(rememberMeKey)
        localStorage.removeItem('remembered_email')
      }

      if (user.user_type === 'admin') {
        router.push('/info/admin/dashboard')
      } else if (shouldStartOnboarding) {
        router.push('/info/user/onboarding')
      } else {
        router.push('/info/user/dashboard')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="auth-page min-h-screen w-full bg-[#eef3fb]">
        <div className="grid min-h-dvh w-full lg:grid-cols-[1.2fr_0.8fr] xl:grid-cols-[1.15fr_0.85fr]">
          <div className="relative hidden overflow-hidden lg:block">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80')",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-blue-950/75 to-slate-900/80" />

            <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14 text-white">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Daet logo" className="h-14 w-14 rounded-2xl border border-white/20 bg-white/10 p-1" />
                <div>
                  <p className="text-sm font-bold tracking-[0.25em] text-white/85">DAET</p>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-sky-100">Camarines Norte</p>
                </div>
              </div>

              <div className="max-w-lg xl:max-w-xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
                  <Sparkles size={12} />
                  Welcome back
                </div>

                <h1 className="text-4xl font-black leading-tight xl:text-5xl">Plan your next Daet getaway.</h1>
                <p className="mt-4 text-base text-sky-50/90 xl:text-lg">
                  Continue exploring surf-ready shores, local stories, and unforgettable travel experiences across Daet, Camarines Norte.
                </p>

                <div className="mt-8 space-y-4 xl:mt-10">
                  {[
                    'Discover beaches and local stories',
                    'Keep track of tourist spots and blogs',
                    'Manage your travel community engagement',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm xl:px-5 xl:py-4">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-400/20 text-blue-200">
                        <MapPin size={14} />
                      </span>
                      <span className="text-sm font-medium text-slate-100 xl:text-base">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-sm text-sky-100/80 xl:text-base">Travel better. Explore local. Stay connected.</div>
            </div>
          </div>

          <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-[#edf2f9] via-[#f7f9fc] to-[#e7effb] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 xl:px-12">
            <div
              className="w-full max-w-[540px] p-4 sm:p-8 xl:p-10"
            >
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white ring-4 ring-blue-100">
                  <img src="/logo.png" alt="Daet logo" className="h-12 w-12 object-contain" />
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-700">Daet Connect</p>
                <h2 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">Welcome back</h2>
                <p className="mt-2 text-sm text-slate-600">Sign in to continue your local travel journey.</p>
              </div>

              {message && (
                <div suppressHydrationWarning className="mb-4 rounded-xl border border-blue-100 bg-white/80 px-3 py-2.5 text-sm text-blue-800 shadow-sm">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span suppressHydrationWarning>{message}</span>
                  </div>
                </div>
              )}

              {error && (
                <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>

                  {error.toLowerCase().includes('confirm') && (
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resending}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resending ? 'Sending...' : 'Resend verification email'}
                    </button>
                  )}
                </div>
              )}

              {verificationSent && !message && (
                <div role="status" className="mb-4 rounded-xl border border-blue-100 bg-white/80 px-3 py-2.5 text-sm text-blue-800 shadow-sm">
                  A new verification email has been sent.
                </div>
              )}

              <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm leading-5 text-blue-900">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                  <span>For security, your account must be verified before you can sign in.</span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
                <div>
                  <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
                  <input
                    suppressHydrationWarning
                    id="login-email"
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-100"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      required
                      autoComplete="current-password"
                      value={formData.password}
                      onChange={handleChange}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-11 text-slate-900 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-100"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-[#2563EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <label htmlFor="remember" className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" id="remember" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-[#2563EB] focus:ring-[#2563EB]" />
                    Remember me
                  </label>

                  <Link href="/info/forgot-password" className="text-sm font-semibold text-[#2563EB] transition hover:text-blue-800 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <p className="text-center text-xs text-slate-600">
                  Account deletion scheduled?{' '}
                  <Link href="/info/account-recovery" className="font-semibold text-[#2563EB] hover:text-blue-700">
                    Restore your account
                  </Link>
                </p>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition duration-200 hover:bg-blue-700 hover:shadow-lg active:translate-y-px active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                  <ArrowRight size={16} />
                </button>
              </form>

              <div className="mt-6 space-y-2 text-center text-sm text-slate-600">
                <div>
                  Don&apos;t have an account?{' '}
                  <Link href="/info/register" className="font-semibold text-[#2563EB] transition hover:text-blue-800 hover:underline">
                    Sign up here
                  </Link>
                </div>
                <div>
                  <Link href="/info/visitor" className="font-semibold text-slate-700 transition hover:text-slate-900">
                    ← Back to visitor page
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}