'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { inferToastType, notifyToast, TOAST_EVENT, TOAST_TYPES } from '@/lib/toast.mjs'

const ALERT_EVENT = 'daet-alert-toast'
const TOAST_DURATION = { success: 4000, error: 6000, warning: 5000, info: 4000 }
const TOAST_STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  error: 'border-red-200 bg-red-50 text-red-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  info: 'border-sky-200 bg-sky-50 text-sky-950',
}
const TOAST_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

export default function AlertToast() {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  const visibleIds = useRef([])
  const dismissingIds = useRef(new Set())
  const nextId = useRef(0)

  const dismissToast = useCallback((id) => {
    if (dismissingIds.current.has(id)) return
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    dismissingIds.current.add(id)
    setToasts((current) => current.map((toast) => (
      toast.id === id ? { ...toast, exiting: true } : toast
    )))
    timers.current.set(id, window.setTimeout(() => {
      timers.current.delete(id)
      visibleIds.current = visibleIds.current.filter((visibleId) => visibleId !== id)
      dismissingIds.current.delete(id)
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 180))
  }, [])

  useEffect(() => {
    const nativeAlert = window.alert
    const activeTimers = timers.current
    const activeDismissingIds = dismissingIds.current

    const showToast = (event) => {
      const nextMessage = String(event.detail?.message ?? '').trim()
      if (!nextMessage) return

      const type = TOAST_TYPES.includes(event.detail?.type)
        ? event.detail.type
        : inferToastType(nextMessage)
      const id = ++nextId.current
      const toast = { id, message: nextMessage, type }
      const retainedIds = [...visibleIds.current, id].slice(-4)
      const removedIds = visibleIds.current.filter((visibleId) => !retainedIds.includes(visibleId))
      removedIds.forEach((removedId) => {
        const timer = timers.current.get(removedId)
        if (timer) window.clearTimeout(timer)
        timers.current.delete(removedId)
        dismissingIds.current.delete(removedId)
      })
      visibleIds.current = retainedIds
      setToasts((current) => [...current.filter((item) => retainedIds.includes(item.id)), toast])

      const requestedDuration = Number(event.detail?.duration)
      const duration = Number.isFinite(requestedDuration) && requestedDuration > 0
        ? requestedDuration
        : TOAST_DURATION[type]
      if (duration > 0) {
        timers.current.set(id, window.setTimeout(() => dismissToast(id), duration))
      }
    }

    const showLegacyAlert = (value) => {
      notifyToast(String(value ?? ''), inferToastType(value))
    }

    window.alert = showLegacyAlert
    window.addEventListener(TOAST_EVENT, showToast)
    window.addEventListener(ALERT_EVENT, showToast)

    return () => {
      if (window.alert === showLegacyAlert) window.alert = nativeAlert
      window.removeEventListener(TOAST_EVENT, showToast)
      window.removeEventListener(ALERT_EVENT, showToast)
      activeTimers.forEach((timer) => window.clearTimeout(timer))
      activeTimers.clear()
      visibleIds.current = []
      activeDismissingIds.clear()
    }
  }, [dismissToast])

  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[2147483647] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[min(26rem,calc(100vw-2rem))]">
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.type]
        return (
          <div
            key={toast.id}
            className={`${toast.exiting ? 'daet-toast-exit' : 'daet-toast-enter'} pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl ${TOAST_STYLES[toast.type]}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 whitespace-pre-line break-words">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-0.5 opacity-70 transition hover:bg-black/5 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
