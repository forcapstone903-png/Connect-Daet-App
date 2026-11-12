'use client'

// "Get alerts on this device". Guests choose categories and subscribe without
// an account; signed-in users manage alerts from Settings (their categories
// apply to every device they use).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellOff, BellRing, LoaderCircle } from 'lucide-react'
import { getStoredSessionObject } from '@/lib/authCookies'
import {
  getCurrentPushSubscription,
  getPushAvailability,
  subscribeGuestToAlerts,
  unsubscribeGuestFromAlerts,
} from '@/lib/pushNotifications'

// Per-device convenience only: remembers which boxes this guest ticked.
const GUEST_CATEGORIES_KEY = 'daet:guest-alert-categories'

function readSavedCategories() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GUEST_CATEGORIES_KEY) || 'null')
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export default function DeviceAlertsCard({ categories }) {
  const [state, setState] = useState({ status: 'checking', signedIn: false })
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    const check = async () => {
      const signedIn = Boolean(getStoredSessionObject()?.logged_in)
      const availability = getPushAvailability()
      const subscription = availability.supported ? await getCurrentPushSubscription() : null
      if (!active) return
      setState({
        signedIn,
        status: !availability.supported ? availability.reason : subscription && Notification.permission === 'granted' ? 'on' : 'off',
      })
      setSelected(readSavedCategories())
    }
    void check()
    return () => { active = false }
  }, [])

  const allSlugs = categories.map((category) => category.slug)
  const chosen = selected ?? allSlugs

  const toggle = (slug) => {
    const next = chosen.includes(slug) ? chosen.filter((item) => item !== slug) : [...chosen, slug]
    setSelected(next)
  }

  const turnOn = async () => {
    setBusy(true)
    setMessage('')
    const categoriesToSend = chosen.length === allSlugs.length ? [] : chosen
    const result = await subscribeGuestToAlerts(categoriesToSend)
    setBusy(false)
    setMessage(result.message || '')
    if (result.success) {
      setState((current) => ({ ...current, status: 'on' }))
      try { window.localStorage.setItem(GUEST_CATEGORIES_KEY, JSON.stringify(chosen)) } catch { /* optional */ }
    }
  }

  const turnOff = async () => {
    setBusy(true)
    const result = await unsubscribeGuestFromAlerts()
    setBusy(false)
    setMessage(result.message || '')
    if (result.success) setState((current) => ({ ...current, status: 'off' }))
  }

  if (state.status === 'checking') {
    return <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" aria-hidden="true" />
  }

  if (state.signedIn) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><BellRing className="h-4 w-4 text-blue-600" aria-hidden="true" />Alerts for your account</h2>
        <p className="mt-1 text-sm text-slate-600">Alerts arrive in your notification inbox. Choose categories and turn on push notifications in Settings → Notifications.</p>
        <Link href="/info/user/settings" className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">Open Settings</Link>
      </section>
    )
  }

  const unsupportedMessage = state.status === 'ios-install-required'
    ? 'On iPhone and iPad, tap Share → Add to Home Screen, open CONNECT-Daet from your Home Screen, then turn on alerts.'
    : ['unsupported', 'browser-only'].includes(state.status)
      ? 'This browser does not support push notifications. You can still check this page for current alerts.'
      : ''

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="device-alerts-heading">
      <h2 id="device-alerts-heading" className="flex items-center gap-2 text-sm font-bold text-slate-900">
        {state.status === 'on' ? <BellRing className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <BellOff className="h-4 w-4 text-slate-400" aria-hidden="true" />}
        Get alerts on this device
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        No account needed. Receive weather, sea, traffic and emergency alerts from the Daet tourism office while you visit.
      </p>

      {unsupportedMessage ? (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{unsupportedMessage}</p>
      ) : (
        <>
          <fieldset className="mt-3" disabled={busy || state.status === 'on'}>
            <legend className="text-xs font-semibold text-slate-500">Categories</legend>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {categories.map((category) => (
                <label key={category.slug} className="flex min-h-9 items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={chosen.includes(category.slug)} onChange={() => toggle(category.slug)} className="h-4 w-4 accent-blue-600" />
                  {category.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Emergency alerts sent to everyone always reach you.</p>
          </fieldset>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {state.status === 'on' ? (
              <button type="button" onClick={turnOff} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}Turn off alerts
              </button>
            ) : (
              <button type="button" onClick={turnOn} disabled={busy || !chosen.length} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}Turn on alerts
              </button>
            )}
            {state.status === 'on' ? <span className="text-xs font-semibold text-emerald-700">On for this device</span> : null}
          </div>
          {state.status === 'on' ? <p className="mt-2 text-xs text-slate-500">To change categories, turn alerts off and on again.</p> : null}
        </>
      )}
      {message ? <p role="status" className="mt-2 text-xs text-slate-600">{message}</p> : null}
      <p className="mt-3 text-xs text-slate-500">
        Staying longer? <Link href="/info/register" className="font-semibold text-blue-700 hover:underline">Create an account</Link> to keep an inbox of alerts.
      </p>
    </section>
  )
}
