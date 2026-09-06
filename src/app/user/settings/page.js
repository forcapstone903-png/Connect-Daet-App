'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bell, Check, Globe, Lock, Settings } from 'lucide-react'
import MobileNav from '@/app/components/user/MobileNav'

const STORAGE_KEY = 'daet_user_profile_preferences'
const defaultPreferences = {
  emailAlerts: true,
  activityDigest: true,
  newFollowers: true,
  forumMentions: true,
  announcementAlerts: false,
}

export default function UserSettingsPage() {
  const [preferences, setPreferences] = useState(() => {
    if (typeof window === 'undefined') return defaultPreferences
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      return { ...defaultPreferences, ...(stored.notificationPrefs || {}) }
    } catch {
      return defaultPreferences
    }
  })
  const [saved, setSaved] = useState(false)

  const savePreferences = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ notificationPrefs: preferences }))
    } catch {
      // Local preference storage is optional.
    }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
  }

  return (
    <main className="min-h-screen w-full overflow-x-clip bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] text-slate-900">
      <MobileNav />
      <div className="mx-auto w-full max-w-[900px] px-3 pb-24 pt-0 sm:px-5 sm:pt-3 lg:px-8 lg:pb-10">
        <header className="sticky top-0 z-30 mb-4 rounded-[22px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_12px_35px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:top-2 sm:p-4">
          <div className="flex items-center gap-3">
            <Link href="/user/profile" aria-label="Back to profile" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-sky-50 hover:text-sky-700"><ArrowLeft className="h-4 w-4" /></Link>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Account</p><h1 className="text-lg font-black text-slate-900">Settings</h1></div>
          </div>
        </header>

        <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Settings className="h-5 w-5" /></div><div><h2 className="font-black text-slate-900">Preferences</h2><p className="text-sm text-slate-500">Choose what you want to hear about.</p></div></div>
          <div className="space-y-2">
            {Object.entries(preferences).map(([key, value]) => (
              <label key={key} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                <input type="checkbox" checked={value} onChange={() => setPreferences((previous) => ({ ...previous, [key]: !previous[key] }))} className="h-4 w-4 accent-sky-600" />
              </label>
            ))}
          </div>
          <button type="button" onClick={savePreferences} className="mt-5 inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700"><Check className="h-4 w-4" />{saved ? 'Saved' : 'Save preferences'}</button>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm"><Bell className="h-4 w-4 text-sky-600" /><p className="mt-3 text-sm font-bold text-slate-900">Notifications</p><p className="mt-1 text-xs leading-5 text-slate-500">Control community and announcement alerts.</p></div>
          <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm"><Lock className="h-4 w-4 text-emerald-600" /><p className="mt-3 text-sm font-bold text-slate-900">Privacy</p><p className="mt-1 text-xs leading-5 text-slate-500">Manage visibility from your profile editor.</p><Link href="/user/profile#privacy" className="mt-2 inline-block text-xs font-bold text-sky-700">Open privacy</Link></div>
          <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm"><Globe className="h-4 w-4 text-amber-600" /><p className="mt-3 text-sm font-bold text-slate-900">Profile</p><p className="mt-1 text-xs leading-5 text-slate-500">Update your public identity and bio.</p><Link href="/user/profile/edit" className="mt-2 inline-block text-xs font-bold text-sky-700">Edit profile</Link></div>
        </section>
      </div>
    </main>
  )
}
