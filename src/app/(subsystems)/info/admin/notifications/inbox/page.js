'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck, ChevronRight, Clock3 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AdminButton, AdminPanel, AdminShell } from '@/app/(subsystems)/info/components/admin'

async function fetchNotifications() {
  const response = await fetch('/info/api/notifications?scope=staff', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Unable to load notifications.')
  }
  return result
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

function NotificationRow({ notification, onOpen }) {
  const isUnread = !notification.is_read
  const title = notification.title || 'Staff notification'
  const actorName = notification.actor?.full_name

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open notification: ${title}`}
        className={`grid h-28 w-full grid-cols-[2.5rem_minmax(0,1fr)_1rem] items-center gap-3 rounded-xl border px-3 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-4 sm:px-4 ${
          isUnread
            ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <span className={`flex h-10 w-10 items-center justify-center rounded-full border ${
          isUnread ? 'border-blue-200 bg-blue-100 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-500'
        }`}>
          {isUnread
            ? <Bell className="h-4 w-4" aria-hidden="true" />
            : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span title={title} className="truncate text-sm font-semibold text-slate-800">{title}</span>
            {isUnread ? (
              <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">
                NEW
              </span>
            ) : null}
          </span>
          <span title={notification.message || ''} className="mt-1 block truncate text-sm text-slate-600">
            {notification.message || 'No additional details.'}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500">
            <span className="min-w-0 truncate">{actorName || 'System update'}</span>
            <span aria-hidden="true">·</span>
            <span className="flex shrink-0 items-center gap-1">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {formatDate(notification.created_at)}
            </span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </button>
    </li>
  )
}

export default function AdminNotificationInboxPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadNotifications = useCallback((isActive = () => true) => {
    fetchNotifications()
      .then((result) => {
        if (isActive()) {
          setNotifications(result.notifications || [])
          setError('')
        }
      })
      .catch((loadError) => {
        if (!isActive()) return
        console.error('Admin notifications load failed:', loadError)
        setError(loadError.message || 'Unable to load notifications.')
      })
      .finally(() => {
        if (isActive()) setLoading(false)
      })
  }, [])

  const refresh = () => {
    setLoading(true)
    setError('')
    loadNotifications()
  }

  useEffect(() => {
    let active = true
    const isActive = () => active
    loadNotifications(isActive)
    const intervalId = window.setInterval(() => loadNotifications(isActive), 30_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [loadNotifications])

  const markAllRead = async () => {
    setSaving(true)
    try {
      const response = await fetch('/info/api/notifications?scope=staff', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to mark notifications as read.')
      }
      setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })))
    } catch (saveError) {
      console.error('Marking admin notifications read failed:', saveError)
      setError(saveError.message || 'Unable to mark notifications as read.')
    } finally {
      setSaving(false)
    }
  }

  const openNotification = async (notification) => {
    try {
      if (!notification.is_read) {
        const response = await fetch('/info/api/notifications?scope=staff', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notification.id }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to mark this notification as read.')
        }
        setNotifications((current) => current.map((item) => (
          item.id === notification.id ? { ...item, is_read: true } : item
        )))
      }
      const target = typeof notification.link === 'string' && notification.link.startsWith('/info/')
        ? notification.link
        : '/info/admin/dashboard'
      router.push(target)
    } catch (openError) {
      console.error('Admin notification action failed:', openError)
      setError(openError.message || 'Unable to open this notification.')
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length

  return (
    <AdminShell
      roleLabel="Administrator"
      eyebrow="System updates"
      title="Notification inbox"
      description="System and workflow notices sent to your signed-in staff account."
      headerIcon="notifications"
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AdminButton icon="refresh" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </AdminButton>
          <AdminButton icon="check" onClick={() => void markAllRead()} disabled={saving || unreadCount === 0}>
            {saving ? 'Saving…' : 'Mark all read'}
          </AdminButton>
        </div>
      )}
    >
      <div className="grid w-full gap-4 pb-6">
        <AdminPanel
          title="Staff inbox"
          actions={(
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
              {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
            </span>
          )}
          padded={false}
        >
          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              <span>{error}</span>
              <button type="button" onClick={refresh} className="font-semibold underline">
                Try again
              </button>
            </div>
          ) : null}
          {loading && notifications.length === 0 ? (
            <p className="p-5 text-sm text-slate-500" role="status">Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <div className="grid justify-items-center gap-2 px-4 py-12 text-center text-sm text-slate-500">
              <Bell className="h-6 w-6" aria-hidden="true" />
              <p className="font-semibold text-slate-700">You’re all caught up</p>
              <p>System and workflow updates for your account will appear here.</p>
            </div>
          ) : (
            <ul className="grid gap-2 bg-slate-50 p-3 sm:p-4">
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpen={() => void openNotification(notification)}
                />
              ))}
            </ul>
          )}
        </AdminPanel>
        <p className="text-center text-xs text-slate-500">Notifications refresh every 30 seconds.</p>
      </div>
    </AdminShell>
  )
}
