'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck, ChevronRight, Clock3, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AdminButton, AdminPanel, AdminShell } from '@/app/(subsystems)/info/components/admin'
import styles from './page.module.css'

async function fetchNotifications() {
  const response = await fetch('/info/api/notifications', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Unable to load staff notifications.')
  }
  return result
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Just now'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function NotificationRow({ notification, onOpen }) {
  const isUnread = !notification.is_read
  const actorName = notification.actor?.full_name

  return (
    <li className={styles.rowItem}>
      <button
        type="button"
        onClick={onOpen}
        className={`${styles.notificationRow} ${isUnread ? styles.unreadRow : ''}`}
      >
        <span className={`${styles.iconBubble} ${isUnread ? styles.unreadIcon : ''}`}>
          {isUnread
            ? <Bell className={styles.rowIcon} aria-hidden="true" />
            : <CheckCheck className={styles.rowIcon} aria-hidden="true" />}
        </span>
        <span className={styles.notificationContent}>
          <span className={styles.titleLine}>
            <span className={styles.notificationTitle} title={notification.title || 'Community notification'}>
              {notification.title || 'Community notification'}
            </span>
            <span className={styles.badgeSlot}>
              {isUnread ? <span className={styles.newBadge}>NEW</span> : null}
            </span>
          </span>
          <span className={styles.notificationMessage} title={notification.message}>
            {notification.message}
          </span>
          <span className={styles.notificationMeta}>
            <span className={styles.actorName}>{actorName ? `From ${actorName}` : ''}</span>
            <span className={styles.metaSeparator} aria-hidden="true">{actorName ? '·' : ''}</span>
            <span className={styles.timestamp}>
              <Clock3 className={styles.clockIcon} aria-hidden="true" />
              {formatDate(notification.created_at)}
            </span>
          </span>
        </span>
        <ChevronRight className={styles.chevron} aria-hidden="true" />
      </button>
    </li>
  )
}

export default function ModeratorNotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchNotifications()
      setNotifications(result.notifications || [])
    } catch (loadError) {
      console.error('Moderator notifications load failed:', loadError)
      setError(loadError.message || 'Unable to load staff notifications.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const load = () => {
      fetchNotifications()
        .then((result) => {
          if (active) {
            setNotifications(result.notifications || [])
            setError('')
          }
        })
        .catch((loadError) => {
          if (!active) return
          console.error('Moderator notifications load failed:', loadError)
          setError(loadError.message || 'Unable to load staff notifications.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }

    load()
    const intervalId = window.setInterval(load, 30_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  const markAllRead = async () => {
    setSaving(true)
    try {
      const response = await fetch('/info/api/notifications', {
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
      console.error('Marking moderator notifications read failed:', saveError)
      setError(saveError.message || 'Unable to mark notifications as read.')
    } finally {
      setSaving(false)
    }
  }

  const openNotification = async (notification) => {
    try {
      if (!notification.is_read) {
        const response = await fetch('/info/api/notifications', {
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
        : '/info/admin/moderation'
      router.push(target)
    } catch (openError) {
      console.error('Moderator notification action failed:', openError)
      setError(openError.message || 'Unable to open this notification.')
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length

  return (
    <AdminShell
      roleLabel="Moderator"
      eyebrow="Community Safety"
      title="Post notifications"
      description="New blogs, forum posts, replies, and comments awaiting moderator review."
      headerIcon="notifications"
      headerClassName={styles.pageHeader}
      actions={(
        <div className={styles.headerActions}>
          <AdminButton icon="refresh" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </AdminButton>
          <AdminButton icon="check" onClick={() => void markAllRead()} disabled={saving || unreadCount === 0}>
            {saving ? 'Saving…' : 'Mark all read'}
          </AdminButton>
        </div>
      )}
    >
      <div className={styles.content}>
        <AdminPanel
          title="Staff inbox"
          actions={(
            <span className={styles.unreadSummary}>
              <span className={styles.unreadDot} aria-hidden="true" />
              {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
            </span>
          )}
          padded={false}
          className={styles.inboxPanel}
          bodyClassName={styles.inboxBody}
        >
          {error ? (
            <div className={styles.errorNotice} role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => void refresh()}>Try again</button>
            </div>
          ) : null}
          {loading && notifications.length === 0 ? (
            <p className={styles.emptyState}>Loading notifications…</p>
          ) : notifications.length === 0 ? (
            <div className={styles.emptyState}>
              <Bell className={styles.emptyIcon} aria-hidden="true" />
              <p className={styles.emptyTitle}>No notifications yet</p>
              <p>New user submissions will appear here for review.</p>
            </div>
          ) : (
            <ul className={styles.notificationList}>
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
        <div className={styles.refreshNote}>
          <RefreshCw className={styles.refreshIcon} aria-hidden="true" />
          Notifications refresh every 30 seconds.
        </div>
      </div>
    </AdminShell>
  )
}
