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

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)))
}

export async function subscribeToPushNotifications({ userId } = {}) {
  const availability = getPushAvailability()
  if (!availability.supported) {
    return { success: false, ...availability }
  }

  const publicKey = (import.meta?.env?.VITE_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)?.trim()
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

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { success: false, reason: permission === 'denied' ? 'permission-denied' : 'permission-dismissed' }
  }

  const registration = await navigator.serviceWorker.register('/sw.js')
  const readyRegistration = await navigator.serviceWorker.ready
  const subscription = await readyRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  const subscriptionJson = subscription.toJSON()

  const { error } = await supabase
    .from('push_subscriptions')
    .insert({
      user_id: resolvedUserId,
      subscription: subscriptionJson,
    })

  if (error) throw error

  return {
    success: true,
    subscription: subscriptionJson,
    registration,
    ...availability,
  }
}
