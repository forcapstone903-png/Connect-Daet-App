'use client'

import { useEffect, useState } from 'react'

const PROMPT_TIMEOUT_MS = 15000
const DISMISS_KEY = 'connect-daet-pwa-dismissed'

const hasUserHiddenPrompt = () => {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(DISMISS_KEY) === 'true'
}

const isStandaloneInstallMode = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

const hidePromptPermanently = () => {
  if (typeof window === 'undefined') return
  localStorage.setItem(DISMISS_KEY, 'true')
}

export default function PwaInstaller() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMounted(true)

      if (hasUserHiddenPrompt()) {
        return
      }

      if (isStandaloneInstallMode()) {
        setIsInstalled(true)
        hidePromptPermanently()
      }
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    if (!mounted) return

    if (hasUserHiddenPrompt()) return

    const handler = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
      setShowPrompt(true)
    }

    const appInstalled = () => {
      setIsInstalled(true)
      setShowPrompt(false)
      hidePromptPermanently()
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', appInstalled)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // no-op: service worker registration failure is non-blocking
      })
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', appInstalled)
    }
  }, [mounted])

  useEffect(() => {
    if (!showPrompt) return

    const timeoutId = window.setTimeout(() => {
      setShowPrompt(false)
    }, PROMPT_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [showPrompt])

  const handleDismiss = () => {
    setShowPrompt(false)
    hidePromptPermanently()
  }

  const installApp = async () => {
    if (!installPrompt) {
      setShowPrompt(false)
      hidePromptPermanently()
      return
    }

    try {
      installPrompt.prompt()
      const choice = await installPrompt.userChoice

      if (choice.outcome === 'accepted') {
        setIsInstalled(true)
      }
    } catch (error) {
      console.error('PWA install failed:', error)
    } finally {
      setShowPrompt(false)
      hidePromptPermanently()
    }
  }

  if (!mounted || isInstalled || !showPrompt) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Install app</p>
          <p className="text-sm font-semibold text-slate-800">Add CONNECT Daet to your home screen</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Dismiss install prompt"
            onClick={handleDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
          <button type="button" onClick={installApp} className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
