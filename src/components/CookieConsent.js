'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'daet-cookie-consent'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const stored = window.localStorage.getItem(STORAGE_KEY)
    setVisible(!stored)
  }, [])

  const applyConsent = (choice) => {
    const normalized = choice === 'accepted' ? 'accepted' : 'essential-only'
    window.localStorage.setItem(STORAGE_KEY, normalized)
    window.localStorage.setItem('daet-analytics-consent', choice === 'accepted' ? 'granted' : 'denied')
    window.dispatchEvent(new CustomEvent('daet-cookie-consent', { detail: { consent: normalized } }))
    setVisible(false)
  }

  if (!isMounted || !visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-sky-300">Cookie notice</p>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            We use cookies to keep the app secure, remember preferences, and measure how visitors use our services. You can accept all cookies, allow essentials only, or learn more before deciding.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-sky-200">
            <Link href="/legal/cookie-policy" className="font-semibold underline underline-offset-4">Cookie policy</Link>
            <Link href="/legal/privacy-policy" className="font-semibold underline underline-offset-4">Privacy policy</Link>
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
