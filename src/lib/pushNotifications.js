'use client'

import { supabase } from '@/lib/supabase'

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
  if (!resolvedUserId && supabase) {
    const { data } = await supabase.auth.getUser()
    resolvedUserId = data?.user?.id || null
  }

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

  const subscriptionRow = {
    user_id: resolvedUserId,
    subscription: subscriptionJson,
    subscription_endpoint: subscriptionJson.endpoint,
    p256dh: subscriptionJson.keys?.p256dh || null,
    auth: subscriptionJson.keys?.auth || null,
  }

  let { error } = await supabase
    .from('push_subscriptions')
    .insert(subscriptionRow)

  // Support databases created from the JSONB-only migration while production
  // projects finish applying the normalized subscription columns.
  if (error?.code === 'PGRST204' || error?.code === '42703') {
    const fallbackResult = await supabase
      .from('push_subscriptions')
      .insert({
        user_id: resolvedUserId,
        subscription: subscriptionJson,
      })
    error = fallbackResult.error
  }

  if (error) {
    console.error('Push subscription database save failed:', error)
    throw new Error(error.message || 'The push subscription could not be saved.')
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
