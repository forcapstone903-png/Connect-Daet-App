'use client'

// Public visitors can browse alerts; signed-in users manage notifications in Settings.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellRing } from 'lucide-react'
import { getStoredSessionObject } from '@/lib/authCookies'

export default function DeviceAlertsCard() {
  const [signedIn, setSignedIn] = useState(null)

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active) setSignedIn(Boolean(getStoredSessionObject()?.logged_in))
    })
    return () => { active = false }
  }, [])

  if (signedIn === null) {
    return <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" aria-hidden="true" />
  }

  if (!signedIn) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><BellRing className="h-4 w-4 text-blue-600" aria-hidden="true" />Alerts for your account</h2>
        <p className="mt-1 text-sm text-slate-600">Sign in or create an account to manage alert notifications. You can continue browsing current and past alerts without an account.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/info/login" className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">Sign in</Link>
          <Link href="/info/register" className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Create account</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><BellRing className="h-4 w-4 text-blue-600" aria-hidden="true" />Alerts for your account</h2>
      <p className="mt-1 text-sm text-slate-600">Alerts arrive in your notification inbox. Choose categories and turn on push notifications in Settings → Notifications.</p>
      <Link href="/info/user/settings" className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">Open Settings</Link>
    </section>
  )
}
