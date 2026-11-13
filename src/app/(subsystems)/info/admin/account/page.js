'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar'
import { AdminPageHeader } from '@/app/(subsystems)/info/components/admin'
import { Icon } from '@/app/(subsystems)/info/components/Icon'
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession, clearAuthCookie, updateStoredSession } from '@/lib/authCookies'
import AdminProfilePhoto from './AdminProfilePhoto'
import { notifyToast } from '@/lib/toast.mjs'

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'profile' },
  { id: 'profile', label: 'Profile', icon: 'edit' },
  { id: 'password', label: 'Change Password', icon: 'lock' },
  { id: 'sessions', label: 'Sessions', icon: 'analytics' },
]

const DEFAULT_PROFILE = {
  full_name: '', user_name: '', email: '', phone_number: '', bio: '',
  address: '', city: '', profile_image_url: '', points: 0, last_login: null,
}
export default function AdminAccountPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'overview'
    try {
      const tab = new URLSearchParams(window.location.search).get('tab')
      return TABS.some((entry) => entry.id === tab) ? tab : 'overview'
    } catch (err) {
      console.error('Failed to read tab param:', err)
      return 'overview'
    }
  })
  const [toast, setToast] = useState(null)

  // Profile
  const [profile, setProfile] = useState(DEFAULT_PROFILE)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false)

  // Password
  const [passwordForm, setPasswordForm] = useState({ current: '', newPassword: '', confirm: '' })
  const [changingPassword, setChangingPassword] = useState(false)

  // Sessions
  const [sessions, setSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  const showToast = useCallback((message, isError = false) => {
    setToast(null)
    notifyToast(message, isError ? 'error' : undefined)
  }, [])

  useEffect(() => {
    const session = getStoredSession()
    if (!session) {
      window.location.href = '/info/login'
      return
    }

    let isActive = true
    // Session/profile fetches live inside the effect; only their async results
    // call setState, and the cleanup flag stops late writes after unmount.
    const loadSessions = async (userId) => {
      try {
        const response = await fetch('/info/api/activity/track?scope=sessions', { credentials: 'same-origin', cache: 'no-store' })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load sessions')
        return result.activities || []
      } catch (err) {
        console.error('Session load exception:', err)
        return []
      }
    }

    try {
      const userData = JSON.parse(session)
      if (!userData.id && userData.user_id) userData.id = userData.user_id
      if (!hasAdminAccess(userData.role)) {
        window.location.href = '/info/admin/dashboard'
        return
      }

      const fetchProfileAndSessions = async () => {
        // Session data paints the page immediately; the network result refines it.
        if (isActive) {
          setUser(userData)
          setProfile((prev) => ({
            ...DEFAULT_PROFILE,
            ...prev,
            full_name: userData.full_name || userData.user_name || '',
            email: userData.email || userData.user_email || '',
            profile_image_url: userData.profile_image_url || '',
          }))
          setLoading(false)
        }
        try {
          // Public columns from the table; private ones (email, phone,
          // address, last sign-in) from the signed-session profile API.
          const [profileResult, privateResult, sessionRows] = await Promise.all([
            supabase.from('info_users')
              .select('id, full_name, user_type, status, profile_image_url, bio, city, country, points, created_at, updated_at')
              .eq('id', userData.id)
              .maybeSingle(),
            fetch('/info/api/profile', { credentials: 'same-origin', cache: 'no-store' })
              .then((response) => (response.ok ? response.json() : null))
              .catch(() => null),
            loadSessions(userData.id),
          ])
          if (!isActive) return
          const privateProfile = privateResult?.profile
          if (!profileResult.error && profileResult.data) {
            setProfile((prev) => ({
              ...DEFAULT_PROFILE,
              ...prev,
              ...profileResult.data,
              ...(privateProfile ? {
                email: privateProfile.email,
                phone_number: privateProfile.phoneNumber,
                address: privateProfile.address,
                last_login: privateProfile.lastLoginAt,
              } : {}),
            }))
          }
          setSessions(sessionRows)
        } catch (err) {
          console.error('Error loading account data:', err)
        }
      }
      fetchProfileAndSessions()
    } catch (error) {
      console.error('Error loading session:', error)
      window.location.href = '/info/login'
    }

    return () => { isActive = false }
  }, [])

  const handleSaveProfile = async () => {
    if (!user) return
    setSavingProfile(true)
    try {
      const updates = {
        full_name: String(profile.full_name || '').trim() || user.full_name || '',
        phone_number: String(profile.phone_number || '').trim() || null,
        bio: String(profile.bio || '').trim() || null,
        address: String(profile.address || '').trim() || null,
        city: String(profile.city || '').trim() || null,
        profile_image_url: profile.profile_image_url || null,
        updated_at: new Date().toISOString(),
      }
      const adminUserId = user.user_id || user.id
      const { error: userError } = await supabase.from('info_users').update(updates).eq('id', adminUserId)
      if (userError) throw userError

      const profileUpdates = {
        user_id: adminUserId,
        full_name: updates.full_name,
        bio: updates.bio,
        city: updates.city,
        address: updates.address,
        profile_image_url: updates.profile_image_url,
        updated_at: updates.updated_at,
      }
      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', adminUserId)
        .maybeSingle()
      if (profileLookupError) throw profileLookupError

      const profileWrite = existingProfile
        ? await supabase.from('profiles').update(profileUpdates).eq('user_id', adminUserId)
        : await supabase.from('profiles').insert(profileUpdates)
      if (profileWrite.error) throw profileWrite.error

      const updatedUser = {
        ...user,
        full_name: updates.full_name,
        profile_image_url: updates.profile_image_url,
      }
      updateStoredSession(updatedUser)
      setUser(updatedUser)
      setProfile((current) => ({ ...current, ...updates }))
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
      const response = await fetch('/info/api/user/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.newPassword,
          signOutOthers: false,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to change your password.')
      }

      showToast('Password changed successfully')
      setPasswordForm({ current: '', newPassword: '', confirm: '' })
    } catch (err) {
      console.error('Password change error:', err)
      showToast('Failed to change password: ' + err.message, true)
    } finally {
      setChangingPassword(false)
    }
  }

  const handleSignOutOthers = () => {
    clearAuthCookie()
    showToast('Session reset. Please sign in again on other devices.', false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50" aria-busy="true" aria-label="Loading account settings">
        <AdminSidebar user={user} roleLabel="Administrator" userRole={user?.role} />
        <main
          style={{
            marginLeft: 'var(--admin-sidebar-width)',
            width: 'calc(100% - var(--admin-sidebar-width))',
          }}
          className="admin-page min-w-0"
        >
          <div className="animate-pulse space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="mt-3 h-7 w-48 max-w-full rounded bg-slate-200" />
              <div className="mt-2 h-4 w-72 max-w-full rounded bg-slate-100" />
            </div>

            <div className="flex gap-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              {[20, 16, 24, 20, 14].map((width, index) => (
                <div key={index} className="h-10 shrink-0 rounded-xl bg-slate-100" style={{ width: `${width * 0.25}rem` }} />
              ))}
            </div>

            <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row">
              <div className="h-16 w-16 shrink-0 rounded-full bg-slate-200" />
              <div className="w-full space-y-2">
                <div className="h-6 w-52 max-w-full rounded bg-slate-200" />
                <div className="h-4 w-64 max-w-full rounded bg-slate-100" />
                <div className="h-3 w-28 rounded bg-slate-100" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-32 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="h-6 w-28 rounded bg-slate-200" />
                  <div className="mt-4 h-4 w-24 rounded bg-slate-100" />
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="h-6 w-40 max-w-full rounded bg-slate-200" />
                  <div className="mt-3 h-4 w-52 max-w-full rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

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

      <main
        style={{
          marginLeft: 'var(--admin-sidebar-width)',
          width: 'calc(100% - var(--admin-sidebar-width))',
        }}
        className="admin-page min-w-0"
      >
        <AdminPageHeader
          eyebrow="My account"
          title="Account settings"
          description="Manage your profile, security, and active sessions."
          icon="profile"
        />

        {tabBar}

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="min-w-0 space-y-6">
            <div className={`${cardClass} flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center`}>
              <AdminProfilePhoto
                userId={user.user_id || user.id}
                value={profile.profile_image_url}
                name={profile.full_name || user.full_name || 'Administrator'}
                onChange={(profile_image_url) => setProfile((current) => ({ ...current, profile_image_url }))}
                onError={(message) => showToast(message, true)}
                onUploadStateChange={setUploadingProfilePhoto}
                disabled={savingProfile}
                compact
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-slate-900">{profile.full_name || user.full_name || 'Administrator'}</h2>
                <p className="break-all text-sm text-slate-600">{profile.email || user.email}</p>
                <p className="mt-1 text-xs text-slate-400">Role: {String(user.role).replace(/_/g, ' ')}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setActiveTab('profile')} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">Edit profile</button>
                <button onClick={() => setActiveTab('password')} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Security</button>
                <button onClick={handleSaveProfile} disabled={savingProfile || uploadingProfilePhoto} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {savingProfile ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: 'Account role', value: String(user.role).replace(/_/g, ' '), icon: 'profile', color: 'text-slate-900' },
                { label: 'Status', value: profile.status || 'Active', icon: 'check', color: 'text-emerald-600' },
                { label: 'Points', value: String(profile.points ?? 0), icon: 'star', color: 'text-blue-600' },
              ].map((stat) => (
                <div key={stat.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className={`text-lg font-bold ${stat.color} flex items-center gap-2`}>
                    <Icon name={stat.icon} className="w-5 h-5" />{stat.value}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { title: 'Change Password', desc: 'Update your account password', icon: 'lock', target: 'password' },
                { title: 'Profile', desc: 'Update your personal information', icon: 'profile', target: 'profile' },
                { title: 'Sessions', desc: 'View and manage active sessions', icon: 'analytics', target: 'sessions' },
              ].map((item) => (
                <button key={item.target} onClick={() => setActiveTab(item.target)} className="group flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:shadow-md">
                  <div className="rounded-xl bg-gradient-to-br from-sky-600 to-emerald-500 p-3 text-white">
                    <Icon name={item.icon} className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
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
          <div className="w-full space-y-6">
            <div className={cardClass}>
              <div className="mb-6 border-b border-slate-100 pb-5">
                <h3 className="text-lg font-bold text-slate-900">Profile Information</h3>
                <p className="mt-1 text-sm text-slate-500">These details are shown across your account.</p>
              </div>

              <div className="mb-7 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <AdminProfilePhoto
                  userId={user.user_id || user.id}
                  value={profile.profile_image_url}
                  name={profile.full_name || user.full_name || 'Administrator'}
                  onChange={(profile_image_url) => setProfile((current) => ({ ...current, profile_image_url }))}
                  onError={(message) => showToast(message, true)}
                  onUploadStateChange={setUploadingProfilePhoto}
                  disabled={savingProfile}
                />
              </div>

              <div className="grid gap-x-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Full name</label>
                  <input className={inputClass} value={profile.full_name || ''} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))} placeholder="Your full name" />
                </div>

                <div>
                  <label className={labelClass}>Email</label>
                  <input className={`${inputClass} opacity-60`} value={profile.email || user.email || ''} disabled />
                </div>

                <div>
                  <label className={labelClass}>Phone number</label>
                  <input className={inputClass} value={profile.phone_number || ''} onChange={(e) => setProfile((p) => ({ ...p, phone_number: e.target.value }))} placeholder="+63 ..." />
                </div>

                <div>
                  <label className={labelClass}>City</label>
                  <input className={inputClass} value={profile.city || ''} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} placeholder="Daet" />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>Address</label>
                  <input className={inputClass} value={profile.address || ''} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} placeholder="Street / Barangay" />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>Bio</label>
                  <textarea rows={4} className={inputClass} value={profile.bio || ''} onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))} placeholder="Tell visitors about yourself" />
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button onClick={handleSaveProfile} disabled={savingProfile || uploadingProfilePhoto} className="rounded-full bg-gradient-to-r from-sky-600 to-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50">
                  {savingProfile ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Change Password ──────────────────────────────────────────────── */}
        {activeTab === 'password' && (
          <div className="w-full space-y-6">
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
{/* ── Sessions ─────────────────────────────────────────────────────── */}
        {activeTab === 'sessions' && (
          <div className="w-full space-y-6">
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
          <div role={toast.isError ? 'alert' : 'status'} aria-live={toast.isError ? 'assertive' : 'polite'} className={`admin-toast ${toast.isError ? 'admin-toast-error' : 'admin-toast-success'}`}>
            {toast.message}
          </div>
        )}
      </main>
    </div>
  )
}