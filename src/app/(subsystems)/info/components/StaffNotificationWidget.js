'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Bell, X } from 'lucide-react'
import { getStoredSessionObject } from '@/lib/authCookies'
import { isStaffNotificationChange } from '@/lib/staffNotificationScope.mjs'
import { getNewUnreadStaffNotifications } from '@/lib/staffNotificationWidget.mjs'
import { supabase } from '@/lib/supabase'

const REFRESH_INTERVAL_MS = 30_000
const TOAST_DURATION_MS = 8_000
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
const NOTIFICATION_INBOX_PATH = '/info/admin/notifications/inbox'

function getSessionUserId(session) {
  return session?.user_id || session?.id || session?.userId || session?.sub || ''
}

export default function StaffNotificationWidget() {
  const [portalTarget, setPortalTarget] = useState(null)
  const [userId, setUserId] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [toastQueue, setToastQueue] = useState([])
  const [loadError, setLoadError] = useState(false)
  const seenIdsRef = useRef(null)
  const refreshRef = useRef(null)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setPortalTarget(document.body)
      setUserId(String(getSessionUserId(getStoredSessionObject())))
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!userId) return undefined

    let active = true
    let channel = null
    let reconnectTimer = null
    let pollTimer = null
    let reconnectAttempt = 0
    let requestSequence = 0
    let latestAppliedRequest = 0
    seenIdsRef.current = null

    const loadNotifications = async (incomingId = null) => {
      const requestId = ++requestSequence

      try {
        const response = await fetch('/info/api/notifications?scope=staff', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to load staff notifications.')
        }

        if (!active || requestId < latestAppliedRequest) return
        latestAppliedRequest = requestId

        const notifications = Array.isArray(result.notifications) ? result.notifications : []
        const previousIds = seenIdsRef.current
        const newUnreadNotifications = getNewUnreadStaffNotifications(
          notifications,
          previousIds,
          incomingId,
        )

        if (newUnreadNotifications.length) {
          setToastQueue((current) => {
            const queuedIds = new Set(current.map((notification) => notification.id))
            return [
              ...current,
              ...newUnreadNotifications.filter((notification) => !queuedIds.has(notification.id)),
            ]
          })
        }

        seenIdsRef.current = new Set(notifications.map((notification) => notification.id))
        const unreadCount = Number(result.unread_count) || 0
        setUnreadCount(unreadCount)
        window.dispatchEvent(new CustomEvent('daet-staff-notifications-updated', {
          detail: { unreadCount },
        }))
        setLoadError(false)
      } catch (error) {
        if (active && requestId >= latestAppliedRequest) {
          latestAppliedRequest = requestId
          setLoadError(true)
          console.error('Staff notification widget refresh failed:', error)
        }
      }
    }
    refreshRef.current = loadNotifications

    const scheduleReconnect = () => {
      if (!active || reconnectTimer || !navigator.onLine) return

      const delay = RECONNECT_DELAYS_MS[
        Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
      ]
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        const previousChannel = channel
        channel = null
        if (!previousChannel) {
          connect()
          return
        }
        void supabase.removeChannel(previousChannel)
          .catch((error) => console.error('Staff notification channel cleanup failed:', error))
          .then(connect)
      }, delay)
    }

    const connect = () => {
      if (!active || !navigator.onLine || !supabase?.channel) return

      channel = supabase
        .channel(`staff-notification-widget-${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'info_notifications',
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          if (payload.eventType === 'INSERT') {
            if (!isStaffNotificationChange(payload)) return
            void loadNotifications(payload.new?.id || null)
            return
          }

          if (payload.eventType === 'UPDATE' && !isStaffNotificationChange(payload)) return
          void loadNotifications()
        })
        .subscribe((status) => {
          if (!active) return
          if (status === 'SUBSCRIBED') {
            reconnectAttempt = 0
            window.clearTimeout(reconnectTimer)
            reconnectTimer = null
            void loadNotifications()
          } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
            scheduleReconnect()
          }
        })
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadNotifications()
    }

    const handleOnline = () => {
      void loadNotifications()
      reconnectAttempt = 0
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
      const previousChannel = channel
      channel = null
      if (previousChannel) {
        void supabase.removeChannel(previousChannel)
          .catch((error) => console.error('Staff notification channel cleanup failed:', error))
          .then(connect)
      } else {
        connect()
      }
    }

    const handleOffline = () => {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    void loadNotifications()
    connect()
    pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void loadNotifications()
      }
    }, REFRESH_INTERVAL_MS)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      active = false
      refreshRef.current = null
      window.clearInterval(pollTimer)
      window.clearTimeout(reconnectTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      if (channel) {
        void supabase.removeChannel(channel)
          .catch((error) => console.error('Staff notification channel cleanup failed:', error))
      }
    }
  }, [userId])

  const activeToast = toastQueue[0] || null
  const activeToastId = activeToast?.id || null

  useEffect(() => {
    if (!activeToastId) return undefined

    const timer = window.setTimeout(() => {
      setToastQueue((current) => (
        current[0]?.id === activeToastId ? current.slice(1) : current
      ))
    }, TOAST_DURATION_MS)

    return () => window.clearTimeout(timer)
  }, [activeToastId])

  if (!portalTarget) return null

  return createPortal(
    <div
      className="fixed right-4 z-[80] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      {loadError ? (
        <section
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-white p-3 text-sm text-red-800 shadow-xl dark:border-red-900 dark:bg-slate-900 dark:text-red-200"
          role="alert"
        >
          <span>Notifications could not be refreshed.</span>
          <button
            type="button"
            onClick={() => void refreshRef.current?.()}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </section>
      ) : null}
      {activeToast ? (
        <section
          className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200">
              <Bell className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {activeToast.title || 'New staff notification'}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                {activeToast.message || 'You have a new update in your staff inbox.'}
              </p>
              <Link
                href={NOTIFICATION_INBOX_PATH}
                onClick={() => setToastQueue([])}
                className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                View notification inbox
                {toastQueue.length > 1 ? ` · ${toastQueue.length} new` : ''}
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setToastQueue((current) => current.slice(1))}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Dismiss notification preview"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      <Link
        href={NOTIFICATION_INBOX_PATH}
        onClick={() => setToastQueue([])}
        aria-label={`Open staff notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        title="Open staff notifications"
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
      >
        <Bell className="h-6 w-6" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </Link>
    </div>,
    portalTarget,
  )
}
