'use client'

import { useEffect, useState } from 'react'
import { getPushAvailability, subscribeToPushNotifications, unsubscribeFromPushNotifications } from '@/lib/pushNotifications'

export default function EnableNotificationsButton({ userId }) {
  const [availability, setAvailability] = useState(null)
  const [permission, setPermission] = useState('default')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    let active = true
    const loadStatus = async () => {
      const currentAvailability = getPushAvailability()
      if (!active) return
      setAvailability(currentAvailability)
      if (typeof Notification !== 'undefined') setPermission(Notification.permission)
      if (!currentAvailability.supported) return

      try {
        const registration = await navigator.serviceWorker.getRegistration()
        const subscription = await registration?.pushManager.getSubscription()
        if (active) setIsSubscribed(Boolean(subscription))
      } catch (error) {
        console.error('Could not check the current push subscription:', error)
        if (active) {
          setStatus('error')
          setMessage('Could not check this browser’s notification status. Try reloading the page.')
        }
      }
    }

    loadStatus()
    return () => {
      active = false
    }
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

      setIsSubscribed(true)
      setPermission('granted')
      setStatus('success')
      setMessage('Notifications enabled.')
    } catch (error) {
      console.error('Push subscription failed:', error)
      setStatus('error')
      setMessage('Unable to enable notifications right now.')
    }
  }

  const disableNotifications = async () => {
    setStatus('loading')
    setMessage('')

    try {
      const result = await unsubscribeFromPushNotifications()
      if (!result.success) {
        setStatus('error')
        setMessage(result.message || 'Notifications could not be disabled.')
        return
      }

      setIsSubscribed(false)
      setStatus('success')
      setMessage(result.browserUnsubscribed === false
        ? 'Push delivery was disabled for your account, but this browser still has a subscription. Reload and try again if you want to remove it completely.'
        : 'Notifications disabled on this browser.')
    } catch (error) {
      console.error('Push subscription removal failed:', error)
      setStatus('error')
      setMessage('Unable to disable notifications right now.')
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

  return (
    <div>
      {isSubscribed ? (
        <button
          type="button"
          onClick={disableNotifications}
          disabled={status === 'loading'}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'loading' ? 'Disabling...' : 'Disable Notifications'}
        </button>
      ) : (
        <button
          type="button"
          onClick={enableNotifications}
          disabled={status === 'loading' || permission === 'denied'}
          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'loading' ? 'Enabling...' : 'Enable Notifications'}
        </button>
      )}
      {permission === 'denied' && !isSubscribed && (
        <p className="mt-2 text-sm text-slate-600">Notifications are blocked in your browser settings. Allow them for this site before enabling.</p>
      )}
      {message && <p role="status" className={`mt-2 text-sm ${status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{message}</p>}
    </div>
  )
}
