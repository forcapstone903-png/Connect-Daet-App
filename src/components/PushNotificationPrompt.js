'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getPushAvailability, subscribeUserToPush } from '@/lib/pushNotifications'
import { getStoredSessionObject } from '@/lib/authCookies'

// Browser-wide, non-sensitive UI preference only (no account or subscription data).
// Honored offline for seven days; expired/missing values show the prompt again.
// Clear manually by removing this key in browser storage and reloading.
const DISMISSAL_STORAGE_KEY = 'daet-push-prompt-dismissed-at'
const DISMISSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000

const isRecentlyDismissed = () => {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISSAL_STORAGE_KEY))
    return Number.isFinite(dismissedAt) && dismissedAt > 0 && Date.now() - dismissedAt < DISMISSAL_TTL_MS
  } catch {
    return false
  }
}

export default function PushNotificationPrompt() {
  const [availability, setAvailability] = useState(null)
  const [userId, setUserId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setAvailability(getPushAvailability())
      const storedSession = getStoredSessionObject()
      const resolvedUserId = storedSession?.id || storedSession?.user_id || null
      setUserId(resolvedUserId)
      setDismissed(isRecentlyDismissed())

      // Permission can remain granted after an earlier database save failed.
      // Re-save the existing device subscription when the app starts.
      if (resolvedUserId && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        void subscribeUserToPush({ userId: resolvedUserId }).catch((error) => {
          console.error('Push subscription sync failed:', error)
        })
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type !== 'PUSH_SUBSCRIPTION_CHANGED' || !userId) return
      void subscribeUserToPush({ userId }).catch((error) => {
        console.error('Push resubscription failed:', error)
      })
    }

    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage)
  }, [userId])

  const dismissPrompt = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISSAL_STORAGE_KEY, String(Date.now()))
    } catch {
      // Storage can be unavailable (e.g. private mode); dismissal still applies to this visit.
    }
  }

  if (!availability || !userId || dismissed) return null

  if (availability.reason === 'ios-install-required') {
    return (
      <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-sky-200 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Enable mobile notifications</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              On iPhone or iPad, tap Share, choose Add to Home Screen, open CONNECT-Daet from the new icon, then tap Enable notifications.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissPrompt}
            aria-label="Dismiss notification prompt"
            className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  if (!availability.supported || Notification.permission === 'granted') return null

  if (Notification.permission === 'denied') {
    const checkPermissionAgain = async () => {
      const nextPermission = Notification.permission
      if (nextPermission === 'granted') {
        try {
          await subscribeUserToPush({ userId })
          setStatus('success')
          setMessage('Notifications enabled.')
        } catch (error) {
          setStatus('error')
          setMessage(error?.message || 'Unable to save the notification subscription.')
        }
        return
      }

      setMessage('Permission is still blocked. Allow notifications in the browser site settings first.')
    }

    return (
      <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-red-200 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Notifications are blocked</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Open this site&apos;s browser settings, set Notifications to Allow, then return here and check again.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissPrompt}
            aria-label="Dismiss notification prompt"
            className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            void checkPermissionAgain()
          }}
          className="mt-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
        >
          I allowed notifications
        </button>
      </div>
    )
  }

  const enableNotifications = async () => {
    setStatus('loading')
    setMessage('')

    try {
      const result = await subscribeUserToPush({ userId })
      if (!result.success) {
        setStatus('error')
        setMessage(result.message || `Notifications were not enabled (${result.reason || 'unknown error'}).`)
        return
      }
      setStatus('success')
      setMessage('Notifications enabled.')
    } catch (error) {
      console.error('Push subscription failed:', error)
      setStatus('error')
      setMessage(error?.message || 'Unable to enable notifications right now.')
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Stay updated</p>
          <p className="mt-1 text-xs text-slate-600">Enable notifications for messages, mentions, and community updates.</p>
          {message && <p className={`mt-2 text-xs font-semibold ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{message}</p>}
        </div>
        <button
          type="button"
          onClick={dismissPrompt}
          aria-label="Dismiss notification prompt"
          className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-sky-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        onClick={enableNotifications}
        disabled={status === 'loading'}
        className="mt-3 rounded-full bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-700 disabled:opacity-50"
      >
        {status === 'loading' ? 'Enabling...' : 'Enable notifications'}
      </button>
    </div>
  )
}
