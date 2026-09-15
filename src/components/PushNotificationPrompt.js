'use client'

import { useEffect, useState } from 'react'
import { getPushAvailability, subscribeUserToPush } from '@/lib/pushNotifications'
import { getStoredSessionObject } from '@/lib/authCookies'

export default function PushNotificationPrompt() {
  const [availability, setAvailability] = useState(null)
  const [userId, setUserId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setAvailability(getPushAvailability())
      setUserId(getStoredSessionObject()?.id || getStoredSessionObject()?.user_id || null)
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

  if (!availability || !userId) return null

  if (availability.reason === 'ios-install-required') {
    return (
      <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-sky-200 bg-white p-4 shadow-xl">
        <p className="text-sm font-bold text-slate-900">Enable mobile notifications</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          On iPhone or iPad, tap Share, choose Add to Home Screen, open CONNECT-Daet from the new icon, then tap Enable notifications.
        </p>
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
        <p className="text-sm font-bold text-slate-900">Notifications are blocked</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Open this site&apos;s browser settings, set Notifications to Allow, then return here and check again.
        </p>
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
        <div>
          <p className="text-sm font-bold text-slate-900">Stay updated</p>
          <p className="mt-1 text-xs text-slate-600">Enable notifications for messages, mentions, and community updates.</p>
          {message && <p className={`mt-2 text-xs font-semibold ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{message}</p>}
        </div>
        <button
          type="button"
          onClick={enableNotifications}
          disabled={status === 'loading'}
          className="shrink-0 rounded-full bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-700 disabled:opacity-50"
        >
          {status === 'loading' ? 'Enabling...' : 'Enable notifications'}
        </button>
      </div>
    </div>
  )
}
