'use client'

import { useEffect, useState } from 'react'
import { getPushAvailability, subscribeToPushNotifications } from '@/lib/pushNotifications'

export default function EnableNotificationsButton({ userId }) {
  const [availability, setAvailability] = useState(null)
  const [permission, setPermission] = useState('default')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAvailability(getPushAvailability())
      if (typeof Notification !== 'undefined') setPermission(Notification.permission)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  const enableNotifications = async () => {
    setStatus('loading')
    setMessage('')

    try {
      const result = await subscribeToPushNotifications({ userId })
      if (!result.success) {
        setStatus('error')
        setMessage(result.message || (result.reason === 'permission-denied'
          ? 'Notifications are blocked in your browser settings.'
          : 'Notifications could not be enabled.'))
        return
      }

      setPermission('granted')
      setStatus('success')
      setMessage('Notifications enabled.')
    } catch (error) {
      console.error('Push subscription failed:', error)
      setStatus('error')
      setMessage('Unable to enable notifications right now.')
    }
  }

  if (!availability) return null

  if (availability.reason === 'ios-install-required') {
    return (
      <p className="text-sm text-slate-600">
        Tap the Share button and select Add to Home Screen, then open the app from your home screen to enable notifications.
      </p>
    )
  }

  if (!availability.supported) {
    return <p className="text-sm text-slate-600">Push notifications are not supported in this browser.</p>
  }

  if (permission === 'granted' || status === 'success') {
    return <button type="button" disabled className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Notifications Enabled</button>
  }

  return (
    <div>
      <button
        type="button"
        onClick={enableNotifications}
        disabled={status === 'loading'}
        className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'loading' ? 'Enabling...' : 'Enable Notifications'}
      </button>
      {message && <p className={`mt-2 text-sm ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{message}</p>}
    </div>
  )
}
