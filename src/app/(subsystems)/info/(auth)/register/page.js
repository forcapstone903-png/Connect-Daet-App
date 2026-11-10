'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Eye, EyeOff, MapPin, ShieldCheck, Sparkles, XCircle } from 'lucide-react'
import '../auth.css'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [acceptsConsent, setAcceptsConsent] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
  })

  const getPasswordRequirements = (password) => {
    const checks = [
      { label: 'At least 8 characters', valid: password.length >= 8 },
      { label: 'One lowercase letter', valid: /[a-z]/.test(password) },
      { label: 'One uppercase letter', valid: /[A-Z]/.test(password) },
      { label: 'One number', valid: /\d/.test(password) },
      { label: 'One special character', valid: /[^A-Za-z0-9]/.test(password) },
    ]

    const metCount = checks.filter((item) => item.valid).length
    const score = Math.round((metCount / checks.length) * 100)

    let label = 'Weak'
    let color = 'bg-red-500'

    if (score >= 80) {
      label = 'Strong'
      color = 'bg-emerald-500'
    } else if (score >= 60) {
      label = 'Good'
      color = 'bg-blue-500'
    } else if (score >= 40) {
      label = 'Fair'
      color = 'bg-amber-500'
    }

    return {
      checks,
      score,
      label,
      color,
      width: `${score}%`,
    }
  }

  const checkPasswordStrength = (password) => {
    if (password.length === 0) {
      return { score: 0, label: '', color: 'bg-slate-200', width: '0%', checks: getPasswordRequirements('').checks }
    }

    return getPasswordRequirements(password)
  }

  const handlePasswordChange = (e) => {
    const password = e.target.value
    setFormData({ ...formData, password })
    setFieldErrors((previous) => ({
      ...previous,
      password: checkPasswordStrength(password).checks.every((item) => item.valid) ? '' : previous.password,
      confirm_password: formData.confirm_password && password !== formData.confirm_password ? 'Passwords do not match.' : '',
    }))
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((previous) => ({ ...previous, [name]: value }))
    setFieldErrors((previous) => ({
      ...previous,
      [name]: name === 'email' && value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
        ? 'Enter a valid email address.'
        : name === 'full_name' && !value.trim()
          ? 'Enter your full name.'
          : name === 'confirm_password' && value && value !== formData.password
            ? 'Passwords do not match.'
            : '',
    }))
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const passwordChecks = checkPasswordStrength(formData.password).checks
    const nextFieldErrors = {
      full_name: formData.full_name.trim() ? '' : 'Enter your full name.',
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim()) ? '' : 'Enter a valid email address.',
      password: passwordChecks.every((item) => item.valid) ? '' : 'Meet all password requirements.',
      confirm_password: formData.password && formData.password === formData.confirm_password ? '' : 'Passwords do not match.',
      consent: acceptsConsent ? '' : 'You must agree to the Terms of Service and Privacy Policy.',
    }
    setFieldErrors(nextFieldErrors)
    if (Object.values(nextFieldErrors).some(Boolean)) return

    setLoading(true)

    try {
      const response = await fetch('/info/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.full_name.trim(),
          email: formData.email.trim(),
          password: formData.password,
        }),
      })

      const text = await response.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : {}
      } catch (error) {
        throw new Error(`Server returned ${response.status}: ${text || response.statusText}`)
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Unable to register your account right now (${response.status})`)
      }

      setSuccess('✅ ' + (data.message || 'Registration successful! Please check your email to confirm your account.'))

      setFormData({
        full_name: '',
        email: '',
        password: '',
        confirm_password: '',
      })

      setTimeout(() => {
        router.push('/info/login?message=Please check your email to confirm your account before logging in.&onboarding=1')
      }, 5000)
    } catch (error) {
      setError(error.message || 'An error occurred during registration')
    } finally {
      setLoading(false)
    }
  }

  const passwordStrength = checkPasswordStrength(formData.password)

  return (
    <>
      <div className="auth-page min-h-screen w-full bg-[#eef3fb]">
        <div className="grid min-h-dvh w-full lg:grid-cols-[1.2fr_0.8fr] xl:grid-cols-[1.15fr_0.85fr]">
          <div className="relative hidden overflow-hidden lg:block">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80')",
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
                  Join the community
                </div>

                <h1 className="text-4xl font-black leading-tight xl:text-5xl">Start exploring Daet with us.</h1>
                <p className="mt-4 text-base text-sky-50/90 xl:text-lg">
                  Create an account to connect with travel stories, discover beach destinations, and stay involved with Daet tourism updates.
                </p>

                <div className="mt-8 space-y-4 xl:mt-10">
                  {[
                    'Create your personalized traveler profile',
                    'Follow tourism news and local experiences',
                    'Connect with the Daet community',
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

              <div className="text-sm text-sky-100/80 xl:text-base">Your next island story starts in Daet.</div>
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
              <h2 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">Create account</h2>
              <p className="mt-2 text-sm text-slate-600">Join the local tourism community in Daet.</p>
            </div>

            {success && (
              <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p>{success}</p>
                    <p className="mt-1 text-xs">You will not be able to sign in until you confirm your email address.</p>
                    <p className="mt-1 text-xs">Redirecting to login page...</p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            {!success && (
              <form onSubmit={handleRegister} noValidate className="space-y-4 sm:space-y-5">
                <div>
                  <label htmlFor="reg-full_name" className="mb-2 block text-sm font-semibold text-slate-700">Full name</label>
                  <input
                    id="reg-full_name"
                    type="text"
                    name="full_name"
                    required
                    autoComplete="name"
                    value={formData.full_name}
                    onChange={handleChange}
                    aria-invalid={Boolean(fieldErrors.full_name)}
                    aria-describedby={fieldErrors.full_name ? 'reg-full_name-error' : undefined}
                    className={`h-12 w-full rounded-xl border bg-white px-4 text-slate-900 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-100 ${fieldErrors.full_name ? 'border-red-400' : 'border-slate-200'}`}
                    placeholder="Enter your full name"
                  />
                  {fieldErrors.full_name && <p id="reg-full_name-error" aria-live="polite" className="mt-1 text-xs font-medium text-red-600">{fieldErrors.full_name}</p>}
                </div>

                <div>
                  <label htmlFor="reg-email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
                  <input
                    id="reg-email"
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={() => setFieldErrors((previous) => ({
                      ...previous,
                      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim()) ? '' : 'Enter a valid email address.',
                    }))}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined}
                    className={`h-12 w-full rounded-xl border bg-white px-4 text-slate-900 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-100 ${fieldErrors.email ? 'border-red-400' : 'border-slate-200'}`}
                    placeholder="you@example.com"
                  />
                  {fieldErrors.email && <p id="reg-email-error" aria-live="polite" className="mt-1 text-xs font-medium text-red-600">{fieldErrors.email}</p>}
                </div>

                <div>
                  <label htmlFor="reg-password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={formData.password}
                      onChange={handlePasswordChange}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby="reg-password-requirements"
                      className={`h-12 w-full rounded-xl border bg-white px-4 pr-11 text-slate-900 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-100 ${fieldErrors.password ? 'border-red-400' : 'border-slate-200'}`}
                      placeholder="Create a password"
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

                  <div id="reg-password-requirements" className="mt-2 space-y-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${passwordStrength.color} transition-all duration-300`}
                        style={{ width: passwordStrength.width }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-600">
                      <span>Password strength</span>
                      <span className="font-semibold text-slate-700">{passwordStrength.label || 'Not set'}</span>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {passwordStrength.checks.map((item) => (
                        <div key={item.label} className="flex items-center gap-2 text-[11px]">
                          {item.valid
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                          <span className={item.valid ? 'text-emerald-700' : 'text-slate-500'}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                    {fieldErrors.password && <p aria-live="polite" className="text-xs font-medium text-red-600">{fieldErrors.password}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-confirm_password" className="mb-2 block text-sm font-semibold text-slate-700">Confirm password</label>
                  <div className="relative">
                    <input
                      id="reg-confirm_password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirm_password"
                      required
                      autoComplete="new-password"
                      value={formData.confirm_password}
                      onChange={handleChange}
                      aria-invalid={Boolean(fieldErrors.confirm_password)}
                      aria-describedby={fieldErrors.confirm_password ? 'reg-confirm-password-error' : undefined}
                      className={`h-12 w-full rounded-xl border bg-white px-4 pr-11 text-slate-900 placeholder:text-slate-400 transition focus:border-[#2563EB] focus:outline-none focus:ring-4 focus:ring-blue-100 ${fieldErrors.confirm_password ? 'border-red-400' : 'border-slate-200'}`}
                      placeholder="Confirm your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-[#2563EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.confirm_password && <p id="reg-confirm-password-error" aria-live="polite" className="mt-1 text-xs font-medium text-red-600">{fieldErrors.confirm_password}</p>}
                </div>

                <div className={`rounded-xl border bg-white/80 p-3 ${fieldErrors.consent ? 'border-red-300' : 'border-slate-200'}`}>
                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={acceptsConsent}
                      onChange={(event) => {
                        setAcceptsConsent(event.target.checked)
                        setFieldErrors((previous) => ({ ...previous, consent: event.target.checked ? '' : previous.consent }))
                      }}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#2563EB] focus:ring-[#2563EB]"
                      aria-label="I agree to the Terms of Service, Privacy Policy, and Cookie Policy"
                      aria-invalid={Boolean(fieldErrors.consent)}
                      aria-describedby={fieldErrors.consent ? 'reg-consent-error' : undefined}
                    />
                    <span className="leading-6">
                      I agree to the{' '}
                      <Link href="/info/legal/privacy-policy" className="font-semibold text-[#2563EB] underline-offset-2 hover:underline">Privacy Policy</Link>,{' '}
                      <Link href="/info/legal/terms-and-conditions" className="font-semibold text-[#2563EB] underline-offset-2 hover:underline">Terms of Service</Link>, and{' '}
                      <Link href="/info/legal/cookie-policy" className="font-semibold text-[#2563EB] underline-offset-2 hover:underline">Cookie Policy</Link>.
                    </span>
                  </label>
                  {fieldErrors.consent && <p id="reg-consent-error" className="mt-2 text-xs font-medium text-red-600">{fieldErrors.consent}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition duration-200 hover:bg-blue-700 hover:shadow-lg active:translate-y-px active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Creating account...' : 'Create account'}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}

            <div className="mt-6 space-y-2 text-center text-sm text-slate-600">
              <div>
                Already have an account?{' '}
                <Link href="/info/login" className="font-semibold text-[#2563EB] transition hover:text-blue-800 hover:underline">
                  Sign in here
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