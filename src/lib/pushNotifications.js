'use client'

const debugLog = (...args) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args)
  }
}

export const PUSH_SUBSCRIPTION_READY_EVENT = 'daet:push-subscription-ready'

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
  debugLog('[push] Converting VAPID public key')
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)))
}

const isStorageError = (error) => /storage error|quota|database/i.test(error?.message || '')

async function registerPushServiceWorker() {
  try {
    return await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
  } catch (error) {
    if (!isStorageError(error)) throw error

    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      registrations
        .filter((candidate) => candidate.scriptURL.endsWith('/sw.js'))
        .map((candidate) => candidate.unregister())
    )

    return navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
  }
}

export async function subscribeUserToPush({ userId } = {}) {
  debugLog('[push] Starting subscription flow')
  const availability = getPushAvailability()
  debugLog('[push] Browser availability:', availability)
  if (!availability.supported) {
    console.error('[push] Unsupported browser or iOS app not installed')
    return { success: false, ...availability }
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  debugLog('[push] VAPID public key present:', Boolean(publicKey))
  if (!publicKey) {
    return { success: false, reason: 'missing-public-key', message: 'Push notifications are not configured.' }
  }

  let resolvedUserId = userId
  if (!resolvedUserId) {
    return { success: false, reason: 'not-authenticated', message: 'Please sign in before enabling notifications.' }
  }

  debugLog('[push] Requesting notification permission')
  const permission = await Notification.requestPermission()
  debugLog('[push] Notification permission:', permission)
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
    debugLog('[push] Registering /sw.js')
    registration = await registerPushServiceWorker()
    debugLog('[push] Waiting for navigator.serviceWorker.ready')
    let readyRegistration = await navigator.serviceWorker.ready
    debugLog('[push] Service worker ready:', readyRegistration.scope)
    subscription = await readyRegistration.pushManager.getSubscription()
    if (!subscription) {
      try {
        subscription = await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      } catch (error) {
        if (!isStorageError(error)) throw error

        await registration.unregister()
        registration = await registerPushServiceWorker()
        readyRegistration = await navigator.serviceWorker.ready
        subscription = await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }
    }
    debugLog('[push] Push subscription created:', subscription.endpoint)
  } catch (error) {
    console.error('Push service worker subscription failed:', error)
    return {
      success: false,
      reason: isStorageError(error) ? 'service-worker-storage' : 'subscription-error',
      message: isStorageError(error)
        ? 'The browser could not access its notification storage. Clear this site\'s stored data, reload, and try again.'
        : error?.message || 'The browser could not create a push subscription.',
      registration,
      ...availability,
    }
  }

  const subscriptionJson = subscription.toJSON()
  debugLog('[push] Saving subscription to push_subscriptions')

  let response
  let timeout
  try {
    const controller = new AbortController()
    timeout = window.setTimeout(() => controller.abort(), 10000)
    response = await fetch('/info/api/push-subscriptions', {
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

  const contentType = response.headers.get('content-type') || ''
  const responseBody = await response.text()
  let result = {}
  if (responseBody) {
    try {
      result = JSON.parse(responseBody)
    } catch {
      result = {}
    }
  }

  if (!response.ok || !result.success) {
    const isAuthenticationError = response.status === 401 || response.status === 403
    const message = typeof result.message === 'string'
      ? result.message
      : isAuthenticationError
        ? 'Your sign-in session has expired. Sign in again before enabling notifications.'
        : response.status === 503
          ? 'The notification service is temporarily unavailable. Please try again later.'
          : `The notification service returned an unexpected response (HTTP ${response.status}).`

    if (isAuthenticationError) {
      console.info('[push] Subscription was not saved because the session is no longer valid.')
    } else {
      console.error('Push subscription save failed:', {
        status: response.status,
        statusText: response.statusText,
        contentType,
        message: typeof result.message === 'string' ? result.message : null,
        responseBodyPresent: Boolean(responseBody),
      })
    }

    return {
      success: false,
      reason: isAuthenticationError ? 'not-authenticated' : 'server-error',
      message,
      subscription: subscriptionJson,
      registration,
      ...availability,
    }
  }

  debugLog('[push] Subscription saved successfully')
  window.dispatchEvent(new Event(PUSH_SUBSCRIPTION_READY_EVENT))

  return {
    success: true,
    subscription: subscriptionJson,
    registration,
    ...availability,
  }
}

export const subscribeToPushNotifications = subscribeUserToPush

export async function unsubscribeFromPushNotifications() {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) {
    return { success: false, reason: 'no-subscription', message: 'This browser does not have an active push subscription.' }
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10000)
  let response
  try {
    response = await fetch('/info/api/push-subscriptions', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  } catch (error) {
    const isAbortError = error?.name === 'AbortError'
    return {
      success: false,
      reason: isAbortError ? 'request-aborted' : 'network-error',
      message: isAbortError
        ? 'The notification request timed out. Please try again.'
        : 'The notification service is temporarily unavailable. Please try again when you are online.',
    }
  } finally {
    window.clearTimeout(timeout)
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) {
    return {
      success: false,
      reason: response.status === 401 || response.status === 403 ? 'not-authenticated' : 'server-error',
      message: typeof result.message === 'string'
        ? result.message
        : `The notification service returned an unexpected response (HTTP ${response.status}).`,
    }
  }

  const unsubscribed = await subscription.unsubscribe()
  if (!unsubscribed) {
    console.warn('Push subscription was removed from the account but remains registered in this browser.')
  }

  return { success: true, browserUnsubscribed: unsubscribed }
}

// ---------------------------------------------------------------------------
// Guest alert opt-in (no account). The subscription is stored with no user and
// the chosen alert categories; see /info/api/alerts/guest-subscription.
// ---------------------------------------------------------------------------

export async function getCurrentPushSubscription() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    return (await registration?.pushManager.getSubscription()) || null
  } catch {
    return null
  }
}

async function postGuestSubscription(method, body) {
  try {
    const response = await fetch('/info/api/alerts/guest-subscription', {
      method,
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      return { success: false, message: result.message || `The alert service returned HTTP ${response.status}.` }
    }
    return result
  } catch {
    return { success: false, message: 'The alert service is unavailable. Please try again when you are online.' }
  }
}

export async function subscribeGuestToAlerts(categories = []) {
  const availability = getPushAvailability()
  if (!availability.supported) {
    return {
      success: false,
      ...availability,
      message: availability.reason === 'ios-install-required'
        ? 'On iPhone and iPad, add this site to your Home Screen first, then turn on alerts from there.'
        : 'This browser does not support push notifications.',
    }
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  if (!publicKey) return { success: false, message: 'Push notifications are not configured.' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      success: false,
      reason: permission,
      message: permission === 'denied'
        ? 'Notifications are blocked. Allow notifications for this site in your browser settings, then try again.'
        : 'Choose Allow when the browser asks, so alerts can reach this device.',
    }
  }

  let subscription
  try {
    await registerPushServiceWorker()
    const registration = await navigator.serviceWorker.ready
    subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
  } catch (error) {
    console.error('Guest push subscription failed:', error)
    return { success: false, message: 'The browser could not turn on notifications. Reload the page and try again.' }
  }

  return postGuestSubscription('POST', { subscription: subscription.toJSON(), categories })
}

export async function unsubscribeGuestFromAlerts() {
  const subscription = await getCurrentPushSubscription()
  if (!subscription) return { success: true, message: 'Alerts are already off for this device.' }
  const result = await postGuestSubscription('DELETE', { subscription: subscription.toJSON() })
  if (result.success) await subscription.unsubscribe().catch(() => false)
  return result
}
