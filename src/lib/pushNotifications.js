'use client'

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false

  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false

  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

export function getPushAvailability() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, isIOS: false, isStandalone: false, reason: 'browser-only' }
  }

  const isIOS = isIOSDevice()
  const isStandalone = isStandalonePwa()

  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
    return { supported: false, isIOS, isStandalone, reason: 'unsupported' }
  }

  if (isIOS && !isStandalone) {
    return { supported: false, isIOS, isStandalone, reason: 'ios-install-required' }
  }

  return { supported: true, isIOS, isStandalone, reason: null }
}

export function urlBase64ToUint8Array(value) {
  console.log('[push] Converting VAPID public key')
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)))
}

export async function subscribeUserToPush({ userId } = {}) {
  console.log('[push] Starting subscription flow')
  const availability = getPushAvailability()
  console.log('[push] Browser availability:', availability)
  if (!availability.supported) {
    console.error('[push] Unsupported browser or iOS app not installed')
    return { success: false, ...availability }
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  console.log('[push] VAPID public key present:', Boolean(publicKey))
  if (!publicKey) {
    return { success: false, reason: 'missing-public-key', message: 'Push notifications are not configured.' }
  }

  let resolvedUserId = userId
  if (!resolvedUserId) {
    return { success: false, reason: 'not-authenticated', message: 'Please sign in before enabling notifications.' }
  }

  console.log('[push] Requesting notification permission')
  const permission = await Notification.requestPermission()
  console.log('[push] Notification permission:', permission)
  if (permission !== 'granted') {
    return {
      success: false,
      reason: permission === 'denied' ? 'permission-denied' : 'permission-dismissed',
      message: permission === 'denied'
        ? 'Notifications are blocked. Allow notifications for this site in your browser settings, then try again.'
        : 'The permission prompt was dismissed. Click Enable notifications again and choose Allow.',
    }
  }

  let registration
  let subscription
  try {
    console.log('[push] Registering /sw.js')
    registration = await navigator.serviceWorker.register('/sw.js')
    console.log('[push] Waiting for navigator.serviceWorker.ready')
    const readyRegistration = await navigator.serviceWorker.ready
    console.log('[push] Service worker ready:', readyRegistration.scope)
    subscription = await readyRegistration.pushManager.getSubscription()
      || await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    console.log('[push] Push subscription created:', subscription.endpoint)
  } catch (error) {
    console.error('Push service worker subscription failed:', error)
    throw new Error(error?.message || 'The browser could not create a push subscription.')
  }

  const subscriptionJson = subscription.toJSON()
  console.log('[push] Saving subscription to push_subscriptions')

  let response
  let timeout
  try {
    const controller = new AbortController()
    timeout = window.setTimeout(() => controller.abort(), 10000)
    response = await fetch('/api/push-subscriptions', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscriptionJson }),
    })
  } catch (error) {
    if (timeout) window.clearTimeout(timeout)

    const isAbortError = error?.name === 'AbortError'
    if (isAbortError) {
      console.info('[push] Subscription request was interrupted; retrying is safe.')
      return {
        success: false,
        reason: 'request-aborted',
        message: 'The notification request was interrupted. Please try again.',
        subscription: subscriptionJson,
        registration,
        ...availability,
      }
    }

    console.warn('[push] Subscription could not reach the server:', error?.message || error)
    return {
      success: false,
      reason: 'network-error',
      message: 'The notification service is temporarily unavailable. Please try again when you are online.',
      subscription: subscriptionJson,
      registration,
      ...availability,
    }
  }
  if (timeout) window.clearTimeout(timeout)

  const result = await response.json().catch(() => ({}))

  if (!response.ok || !result.success) {
    console.error('Push subscription database save failed:', result)
    return {
      success: false,
      reason: 'server-error',
      message: result.message || 'The push subscription could not be saved.',
      subscription: subscriptionJson,
      registration,
      ...availability,
    }
  }

  console.log('[push] Subscription saved successfully')

  return {
    success: true,
    subscription: subscriptionJson,
    registration,
    ...availability,
  }
}

export const subscribeToPushNotifications = subscribeUserToPush
