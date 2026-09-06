'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import AdminSidebar from '@/app/components/AdminSidebar'
import { Icon } from '@/app/components/Icon'
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession, clearAuthCookie } from '@/lib/authCookies'

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'profile' },
  { id: 'profile', label: 'Profile', icon: 'edit' },
  { id: 'password', label: 'Change Password', icon: 'lock' },
  { id: '2fa', label: '2FA Settings', icon: 'lock' },
  { id: 'sessions', label: 'Sessions', icon: 'analytics' },
]

// ─── Minimal RFC-6238 TOTP helpers (works entirely in the browser) ─────────
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(input) {
  const cleaned = String(input).replace(/=+$/g, '').toUpperCase().replace(/\s/g, '')
  const bytes = []
  let bits = 0
  let value = 0
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(bytes)
}

function generateRandomSecret() {
  const randomBytes = new Uint8Array(20)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes)
  } else {
    for (let i = 0; i < randomBytes.length; i++) randomBytes[i] = Math.floor(Math.random() * 256)
  }
  let secret = ''
  for (const byte of randomBytes) {
    secret += BASE32_ALPHABET[byte & 31]
  }
  return secret
}

async function calculateTOTP(secretBase32) {
  const key = await crypto.subtle.importKey(
    'raw', base32Decode(secretBase32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  )
  const counter = Math.floor(Date.now() / 1000 / 30)
  const counterBuffer = new ArrayBuffer(8)
  const view = new DataView(counterBuffer)
  view.setUint32(0, Math.floor(counter / 2 ** 32))
  view.setUint32(4, counter >>> 0)
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuffer))
  const offset = signature[signature.length - 1] & 0x0f
  const bin =
    ((signature[offset] & 0x7f) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3]
  return (bin % 1000000).toString().padStart(6, '0')
}

function twoFAStorageKey(userId) {
  return `daet_2fa_${userId || 'anon'}`
}

function loadTwoFactor(userId) {
  if (typeof window === 'undefined') return { enabled: false, secret: '' }
  try {
    const raw = localStorage.getItem(twoFAStorageKey(userId))
    return raw ? JSON.parse(raw) : { enabled: false, secret: '' }
  } catch {
    return { enabled: false, secret: '' }
  }
}

function saveTwoFactor(userId, settings) {
  if (typeof window === 'undefined') return
  localStorage.setItem(twoFAStorageKey(userId), JSON.stringify(settings))
}

const DEFAULT_PROFILE = {
  full_name: '', user_name: '', email: '', phone_number: '', bio: '',
  address: '', city: '', profile_image_url: '', points: 0, last_login: null,
}
export default function AdminAccountPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [toast, setToast] = useState(null)

  // Profile
  const [profile, setProfile] = useState(DEFAULT_PROFILE)
  const [savingProfile, setSavingProfile] = useState(false)

  // Password
  const [passwordForm, setPasswordForm] = useState({ current: '', newPassword: '', confirm: '' })
  const [changingPassword, setChangingPassword] = useState(false)

  // 2FA
  const [twoFactor, setTwoFactor] = useState({ enabled: false, secret: '' })
  const [pendingSecret, setPendingSecret] = useState('')
  const [twoFACode, setTwoFACode] = useState('')
  const [twoFAError, setTwoFAError] = useState('')

  // Sessions
  const [sessions, setSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  // Read the ?tab= query param (no SSR involvement, avoids Suspense requirement)
  useEffect(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab')
      if (tab && TABS.some((t) => t.id === tab)) setActiveTab(tab)
    } catch (err) {
      console.error('Failed to read tab param:', err)
    }
  }, [])

  useEffect(() => {
    const session = getStoredSession()
    if (!session) {
      window.location.href = '/login'
      return
    }

    let isActive = true
    try {
      const userData = JSON.parse(session)
      if (!hasAdminAccess(userData.role)) {
        window.location.href = '/admin/dashboard'
        return
      }
      if (!isActive) return
      setUser(userData)
      setProfile((prev) => ({
        ...DEFAULT_PROFILE,
        ...prev,
        full_name: userData.full_name || userData.user_name || '',
        email: userData.email || userData.user_email || '',
      }))
      setLoading(false)

      const fetchProfileAndSessions = async () => {
        try {
          const [{ data: dbProfile, error: profileError }, sessionRows] = await Promise.all([
            supabase.from('info_users').select('*').eq('id', userData.id).maybeSingle(),
            loadSessions(userData.id),
          ])
          if (!profileError && dbProfile) {
            if (isActive) setProfile((prev) => ({ ...DEFAULT_PROFILE, ...prev, ...dbProfile }))
          }
          if (isActive) setSessions(sessionRows)
        } catch (err) {
          console.error('Error loading account data:', err)
        }
      }
      fetchProfileAndSessions()
    } catch (error) {
      console.error('Error loading session:', error)
      window.location.href = '/login'
    }

    return () => { isActive = false }
  }, [])

  const loadSessions = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_activity_log')
        .select('id, activity_type, description, metadata, created_at')
        .eq('user_id', userId)
        .in('activity_type', ['login', 'logout', 'sign_in', 'sign_out', 'session', 'auth'])
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) {
        console.error('Session load error:', error)
        return []
      }
      return data || []
    } catch (err) {
      console.error('Session load exception:', err)
      return []
    }
  }

const handleSaveProfile = async () => {
    if (!user) return
    setSavingProfile(true)
    try {
      const updates = {
        full_name: profile.full_name || user.full_name,
        phone_number: profile.phone_number || null,
        bio: profile.bio || null,
        address: profile.address || null,
        city: profile.city || null,
      }
      const { error } = await supabase.from('info_users').update(updates).eq('id', user.id)
      if (error) throw error
      showToast('Profile updated successfully')
    } catch (err) {
      console.error('Profile update error:', err)
      showToast('Failed to update profile: ' + err.message, true)
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    if (!user) return
    if (!passwordForm.current || !passwordForm.newPassword) {
      showToast('Please fill in all fields', true)
      return
    }
    if (passwordForm.newPassword.length < 8) {
      showToast('New password must be at least 8 characters', true)
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirm) {
      showToast('New passwords do not match', true)
      return
    }

    setChangingPassword(true)
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordForm.current,
      })
      if (verifyError) {
        showToast('Current password is incorrect', true)
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: passwordForm.newPassword })
      if (updateError) throw updateError

      showToast('Password changed successfully')
      setPasswordForm({ current: '', newPassword: '', confirm: '' })
    } catch (err) {
      console.error('Password change error:', err)
      showToast('Failed to change password: ' + err.message, true)
    } finally {
      setChangingPassword(false)
    }
  }

  const handleEnable2FABegin = () => {
    const secret = generateRandomSecret()
    setPendingSecret(secret)
    setTwoFACode('')
    setTwoFAError('')
  }

  const handleVerify2FA = async () => {
    const secret = pendingSecret || twoFactor.secret
    if (!secret) return
    if (!/^\d{6}$/.test(twoFACode.trim())) {
      setTwoFAError('Enter the 6-digit code from your authenticator app')
      return
    }

    const code = twoFACode.trim()
    const expected = await calculateTOTP(secret)
    if (expected !== code) {
      setTwoFAError('Invalid code. Please try again.')
      return
    }

    if (pendingSecret) {
      const settings = { enabled: true, secret }
      setTwoFactor(settings)
      saveTwoFactor(user.id, settings)
      setPendingSecret('')
      showToast('Two-factor authentication enabled')
    } else {
      const settings = { enabled: false, secret: '' }
      setTwoFactor(settings)
      saveTwoFactor(user.id, settings)
      showToast('Two-factor authentication disabled')
    }
    setTwoFACode('')
    setTwoFAError('')
  }

  const handleDisable2FA = async () => {
    if (!twoFactor.secret) return
    const code = twoFACode.trim()
    if (!/^\d{6}$/.test(code)) {
      setTwoFAError('Enter the 6-digit code from your authenticator app')
      return
    }
    const expected = await calculateTOTP(twoFactor.secret)
    if (expected !== code) {
      setTwoFAError('Invalid code. Please try again.')
      return
    }
    const settings = { enabled: false, secret: '' }
    setTwoFactor(settings)
    saveTwoFactor(user.id, settings)
    setTwoFACode('')
    setTwoFAError('')
    showToast('Two-factor authentication disabled')
  }

  const handleSignOutOthers = () => {
    clearAuthCookie()
    showToast('Session reset. Please sign in again on other devices.', false)
  }

  useEffect(() => {
    if (user) {
      setTwoFactor(loadTwoFactor(user.id))
    }
  }, [user])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    )
  }

  const otpauthUri = pendingSecret
    ? `otpauth://totp/Daet%20Tourism:${encodeURIComponent(profile.email || user.email)}?secret=${pendingSecret}&issuer=Daet%20Tourism&algorithm=SHA1&digits=6&period=30`
    : ''

  const tabBar = (
    <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
            activeTab === tab.id
              ? 'bg-gradient-to-r from-sky-600 to-emerald-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Icon name={tab.icon} className="w-4 h-4" />
          {tab.label}
        </button>
      ))}
    </div>
  )

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100'
  const labelClass = 'mt-5 mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500'
  const cardClass = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'
return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Administrator" userRole={user?.role} />

      <main style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6 lg:p-8">
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-sky-700">My Account</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-900">Account Settings</h1>
          <p className="mt-2 text-sm text-slate-600">Manage your profile, security, and active sessions</p>
        </div>

        {tabBar}

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className={`${cardClass} flex flex-col gap-5 sm:flex-row sm:items-center`}>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-600 to-emerald-500 text-xl font-black text-white">
                {(profile.full_name || user.full_name || 'A').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-slate-900">{profile.full_name || user.full_name || 'Administrator'}</h2>
                <p className="text-sm text-slate-600">{profile.email || user.email}</p>
                <p className="mt-1 text-xs text-slate-400">Role: {String(user.role).replace(/_/g, ' ')}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setActiveTab('profile')} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">Edit profile</button>
                <button onClick={() => setActiveTab('password')} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Security</button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {[
                { label: 'Account role', value: String(user.role).replace(/_/g, ' '), icon: 'profile', color: 'text-slate-900' },
                { label: 'Status', value: profile.status || 'Active', icon: 'check', color: 'text-emerald-600' },
                { label: '2FA status', value: twoFactor.enabled ? 'Enabled' : 'Disabled', icon: 'lock', color: twoFactor.enabled ? 'text-emerald-600' : 'text-amber-600' },
                { label: 'Points', value: String(profile.points ?? 0), icon: 'star', color: 'text-blue-600' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className={`text-lg font-bold ${stat.color} flex items-center gap-2`}>
                    <Icon name={stat.icon} className="w-5 h-5" />{stat.value}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                { title: 'Change Password', desc: 'Update your account password', icon: 'lock', target: 'password' },
                { title: '2FA Settings', desc: 'Add an extra layer of security', icon: 'lock', target: '2fa' },
                { title: 'Profile', desc: 'Update your personal information', icon: 'profile', target: 'profile' },
                { title: 'Sessions', desc: 'View and manage active sessions', icon: 'analytics', target: 'sessions' },
              ].map((item) => (
                <button key={item.target} onClick={() => setActiveTab(item.target)} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:shadow-md">
                  <div className="rounded-xl bg-gradient-to-br from-sky-600 to-emerald-500 p-3 text-white">
                    <Icon name={item.icon} className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 group-hover:text-sky-600">{item.title}</h3>
                    <p className="text-sm text-slate-600">{item.desc}</p>
                  </div>
                  <Icon name="arrow" className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        )}
{/* ── Profile ──────────────────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="max-w-2xl space-y-6">
            <div className={cardClass}>
              <h3 className="text-lg font-bold text-slate-900">Profile Information</h3>
              <p className="mt-1 text-sm text-slate-500">These details are shown across your account.</p>

              <label className={labelClass}>Full name</label>
              <input className={inputClass} value={profile.full_name || ''} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))} placeholder="Your full name" />

              <label className={labelClass}>Email</label>
              <input className={`${inputClass} opacity-60`} value={profile.email || user.email || ''} disabled />

              <label className={labelClass}>Phone number</label>
              <input className={inputClass} value={profile.phone_number || ''} onChange={(e) => setProfile((p) => ({ ...p, phone_number: e.target.value }))} placeholder="+63 ..." />

              <label className={labelClass}>City</label>
              <input className={inputClass} value={profile.city || ''} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} placeholder="Daet" />

              <label className={labelClass}>Address</label>
              <input className={inputClass} value={profile.address || ''} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} placeholder="Street / Barangay" />

              <label className={labelClass}>Bio</label>
              <textarea rows={3} className={inputClass} value={profile.bio || ''} onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))} placeholder="Tell visitors about yourself" />

              <div className="mt-6 flex items-center gap-3">
                <button onClick={handleSaveProfile} disabled={savingProfile} className="rounded-full bg-gradient-to-r from-sky-600 to-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50">
                  {savingProfile ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Change Password ──────────────────────────────────────────────── */}
        {activeTab === 'password' && (
          <div className="max-w-xl space-y-6">
            <div className={cardClass}>
              <h3 className="text-lg font-bold text-slate-900">Change Password</h3>
              <p className="mt-1 text-sm text-slate-500">Your password must be at least 8 characters with a mix of letters, numbers, and symbols.</p>

              <label className={labelClass}>Current password</label>
              <input type="password" className={inputClass} value={passwordForm.current} onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))} placeholder="Enter current password" />

              <label className={labelClass}>New password</label>
              <input type="password" className={inputClass} value={passwordForm.newPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))} placeholder="Enter new password" />

              <label className={labelClass}>Confirm new password</label>
              <input type="password" className={inputClass} value={passwordForm.confirm} onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))} placeholder="Re-enter new password" />

              <div className="mt-6">
                <button onClick={handleChangePassword} disabled={changingPassword} className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                  {changingPassword ? 'Changing...' : 'Change password'}
                </button>
              </div>
            </div>
          </div>
        )}
{/* ── 2FA ──────────────────────────────────────────────────────────── */}
        {activeTab === '2fa' && (
          <div className="max-w-xl space-y-6">
            <div className={cardClass}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Two-factor authentication</h3>
                  <p className="mt-1 text-sm text-slate-500">Protect your account with a time-based code from an authenticator app (Google Authenticator, Authy, etc.).</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${twoFactor.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {twoFactor.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {!twoFactor.enabled && !pendingSecret && (
                <button onClick={handleEnable2FABegin} className="mt-6 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">
                  Enable 2FA
                </button>
              )}

              {!twoFactor.enabled && pendingSecret && (
                <div className="mt-6 space-y-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
                  <p className="text-sm font-semibold text-slate-700">Step 1 — Add this secret to your authenticator app</p>
                  <p className="text-xs text-slate-500">Open your authenticator app, choose "Manual entry", and paste the secret below (or type it in).</p>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs break-all text-slate-800">{pendingSecret}</div>
                  <p className="text-xs text-slate-500">Scan-compatible URI:</p>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] break-all text-slate-500">{otpauthUri}</div>

                  <p className="text-sm font-semibold text-slate-700">Step 2 — Verify the 6-digit code</p>
                  <div className="flex items-center gap-3">
                    <input value={twoFACode} onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} placeholder="000000" className={`${inputClass} w-44 font-mono text-center tracking-[0.3em]`} />
                    <button onClick={handleVerify2FA} className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Verify &amp; enable</button>
                  </div>
                  {twoFAError && <p className="text-xs font-medium text-red-600">{twoFAError}</p>}
                </div>
              )}

              {twoFactor.enabled && (
                <div className="mt-6 space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
                  <p className="text-sm text-emerald-800">2FA is enabled for this account. Enter the current code to disable it.</p>
                  <div className="flex items-center gap-3">
                    <input value={twoFACode} onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} placeholder="000000" className={`${inputClass} w-44 font-mono text-center tracking-[0.3em]`} />
                    <button onClick={handleDisable2FA} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Disable 2FA</button>
                  </div>
                  {twoFAError && <p className="text-xs font-medium text-red-600">{twoFAError}</p>}
                </div>
              )}
            </div>
          </div>
        )}
{/* ── Sessions ─────────────────────────────────────────────────────── */}
        {activeTab === 'sessions' && (
          <div className="max-w-2xl space-y-6">
            <div className={cardClass}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Active Sessions</h3>
                  <p className="text-sm text-slate-500">Recent sign-in activity for your account.</p>
                </div>
                <button onClick={handleSignOutOthers} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                  Sign out other devices
                </button>
              </div>

              <div className="space-y-3">
                {sessions.length === 0 && (
                  <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                    No session activity recorded yet. Sign-in events will appear here.
                  </div>
                )}
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div>
                      <p className="font-medium capitalize text-slate-900">{String(session.description || session.activity_type || 'Session').replace(/_/g, ' ')}</p>
                      <p className="text-xs text-slate-500">{session.metadata?.device || session.metadata?.user_agent || 'Unknown device'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-slate-500">{new Date(session.created_at).toLocaleString()}</p>
                      <p className="text-xs capitalize text-slate-400">{String(session.activity_type || '').replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className={`fixed bottom-5 right-5 z-[60] rounded-full border px-4 py-2 text-sm font-medium shadow-lg ${toast.isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {toast.message}
          </div>
        )}
      </main>
    </div>
  )
}