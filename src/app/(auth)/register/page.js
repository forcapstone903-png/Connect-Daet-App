'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Eye, EyeOff, MapPin, ShieldCheck, Sparkles, XCircle } from 'lucide-react'
import logoImage from '../../assets/images/logo.png'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' })
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    mobile_number: '',
    password: '',
    confirm_password: '',
    user_type: 'tourist',
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
    setPasswordStrength(checkPasswordStrength(password))
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.')
      setLoading(false)
      return
    }

    const missingRequirements = passwordStrength.checks.filter((item) => !item.valid).map((item) => item.label)
    if (missingRequirements.length > 0) {
      setError(`Your password needs: ${missingRequirements.join(', ')}.`)
      setLoading(false)
      return
    }

    if (!formData.mobile_number || formData.mobile_number.replace(/\s+/g, '').length < 7) {
      setError('Please provide a valid mobile number.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email,
          mobile_number: formData.mobile_number,
          password: formData.password,
          user_type: formData.user_type,
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
        mobile_number: '',
        password: '',
        confirm_password: '',
        user_type: 'tourist',
      })

      setTimeout(() => {
        router.push('/login?message=Please check your email to confirm your account before logging in.')
      }, 5000)
    } catch (error) {
      setError(error.message || 'An error occurred during registration')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes authFadeSlide {
          0% {
            opacity: 0;
            transform: translateY(14px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

      <div className="min-h-screen w-full bg-slate-100">
        <div className="grid min-h-screen w-full lg:grid-cols-[1.2fr_0.8fr] xl:grid-cols-[1.15fr_0.85fr]">
          <div className="relative hidden overflow-hidden lg:block">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80')",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-sky-900/75 to-emerald-900/70" />

            <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14 text-white">
              <div className="flex items-center gap-3">
                <img src={logoImage.src || logoImage} alt="Daet logo" className="h-14 w-14 rounded-2xl border border-white/20 bg-white/10 p-1" />
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
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200">
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

        <div className="flex min-h-screen items-center justify-center px-3 py-6 sm:px-5 lg:px-8 xl:px-12">
          <div
            className="w-full max-w-[540px] animate-[authFadeSlide_0.55s_ease-out] rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_25px_80px_rgba(15,23,42,0.12)] sm:p-8 xl:p-10"
            style={{ animationFillMode: 'forwards' }}
          >
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 ring-4 ring-sky-100">
                <img src={logoImage.src || logoImage} alt="Daet logo" className="h-12 w-12 object-contain" />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-700">Daet Connect</p>
              <h2 className="mt-3 text-3xl font-black text-slate-900">Create account</h2>
              <p className="mt-2 text-sm text-slate-600">Join the local tourism community in Daet.</p>
            </div>

            {success && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
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
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {!success && (
              <form onSubmit={handleRegister} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Full name</label>
                  <input
                    type="text"
                    name="full_name"
                    required
                    value={formData.full_name}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Mobile number</label>
                  <input
                    type="tel"
                    name="mobile_number"
                    required
                    value={formData.mobile_number}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    placeholder="09XXXXXXXXX"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      required
                      minLength={6}
                      value={formData.password}
                      onChange={handlePasswordChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      placeholder="Create a password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {formData.password.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${passwordStrength.color} transition-all duration-300`}
                          style={{ width: passwordStrength.width }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Password strength</span>
                        <span className="font-semibold text-slate-700">{passwordStrength.label || 'Start typing'}</span>
                      </div>

                      {(() => {
                        const remainingChecks = passwordStrength.checks.filter((item) => !item.valid)

                        return remainingChecks.length > 0 ? (
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {remainingChecks.map((item) => (
                              <div key={item.label} className="flex items-center gap-2 text-[11px] text-slate-600">
                                <XCircle className="h-3.5 w-3.5 text-slate-300" />
                                <span className="text-slate-500">{item.label}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-[11px] text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            <span>All password requirements are met.</span>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Confirm password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirm_password"
                      required
                      value={formData.confirm_password}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      placeholder="Confirm your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-slate-700"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {formData.confirm_password && formData.password !== formData.confirm_password && (
                    <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">I am a...</label>
                  <select
                    name="user_type"
                    value={formData.user_type}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="tourist">Tourist</option>
                    <option value="artisan">Artisan</option>
                    <option value="operator">Tour Operator</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Creating account...' : 'Create account'}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}

            <div className="mt-6 space-y-2 text-center text-sm text-slate-600">
              <div>
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-sky-700 transition hover:text-sky-800">
                  Sign in here
                </Link>
              </div>
              <div>
                <Link href="/welcome" className="font-semibold text-slate-700 transition hover:text-slate-900">
                  ← Back to welcome page
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