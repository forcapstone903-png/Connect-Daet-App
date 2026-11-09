'use client'

import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'daet-cookie-consent'

function getStoredConsent() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function syncConsentMarker() {
  const consent = getStoredConsent()
  if (consent === 'accepted' || consent === 'essential-only') {
    document.documentElement.dataset.cookieConsent = 'saved'
  } else {
    delete document.documentElement.dataset.cookieConsent
  }
}

function subscribeToConsent(callback) {
  const handleChange = () => {
    syncConsentMarker()
    callback()
  }
  window.addEventListener('daet-cookie-consent', handleChange)
  window.addEventListener('storage', handleChange)

  return () => {
    window.removeEventListener('daet-cookie-consent', handleChange)
    window.removeEventListener('storage', handleChange)
  }
}

export default function CookieConsent() {
  const [editing, setEditing] = useState(false)
  const [sessionConsent, setSessionConsent] = useState('')
  const [storageError, setStorageError] = useState('')
  const storedConsent = useSyncExternalStore(subscribeToConsent, getStoredConsent, () => '')
  const visible = editing || !(storedConsent || sessionConsent)

  useEffect(() => {
    const openSettings = () => {
      delete document.documentElement.dataset.cookieConsent
      setEditing(true)
    }
    window.addEventListener('daet-open-cookie-settings', openSettings)
    return () => window.removeEventListener('daet-open-cookie-settings', openSettings)
  }, [])

  const applyConsent = (choice) => {
    const normalized = choice === 'accepted' ? 'accepted' : 'essential-only'
    setSessionConsent(normalized)
    setStorageError('')

    try {
      window.localStorage.setItem('daet-analytics-consent', 'denied')
      window.localStorage.setItem(STORAGE_KEY, normalized)
      if (choice === 'accepted') {
        window.localStorage.setItem('daet-analytics-consent', 'granted')
      }
      document.documentElement.dataset.cookieConsent = 'saved'
    } catch (error) {
      console.error('Cookie consent could not be saved:', error)
      delete document.documentElement.dataset.cookieConsent
      setStorageError('Your choice applies for this session, but could not be saved on this device.')
    }

    setEditing(false)
    window.dispatchEvent(new CustomEvent('daet-cookie-consent', { detail: { consent: normalized } }))
  }

  if (!visible) {
    if (!storageError) return null

    return (
      <p role="status" className="fixed inset-x-3 bottom-3 z-[1000] mx-auto max-w-xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 shadow-xl">
        {storageError}
      </p>
    )
  }

  return (
    <div role="region" aria-label="Cookie consent" className="cookie-consent-notice pointer-events-auto fixed inset-x-0 bottom-0 z-[1000] max-h-[85vh] overflow-y-auto border-t border-slate-200 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-sky-300">Cookie notice</p>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            We use cookies to keep the app secure, remember preferences, and measure how visitors use our services. You can accept all cookies, allow essentials only, or learn more before deciding.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-sky-200">
            <Link href="/info/legal/cookie-policy" className="font-semibold underline underline-offset-4">Cookie policy</Link>
            <Link href="/info/legal/privacy-policy" className="font-semibold underline underline-offset-4">Privacy policy</Link>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => applyConsent('essential')}
            className="rounded-full border border-slate-500 bg-transparent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            aria-label="Accept only essential cookies"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => applyConsent('accepted')}
            className="rounded-full bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            aria-label="Accept all cookies and analytics"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  )
}
