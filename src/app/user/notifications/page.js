'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, BellRing, CheckCheck, Clock3, Filter, Search, ShieldAlert, Sparkles, Trash2, Volume2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSession } from '@/lib/authCookies'

function readStoredSession() {
  if (typeof window === 'undefined') return null

  try {
    const raw = getStoredSession()
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const PRIORITY_STYLES = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-sky-100 text-sky-700 border-sky-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

const TYPE_STYLES = {
  announcement: 'bg-violet-100 text-violet-700',
  event: 'bg-emerald-100 text-emerald-700',
  system: 'bg-slate-100 text-slate-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
  success: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
}

function formatDate(dateValue) {
  if (!dateValue) return 'Just now'

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return 'Just now'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function UserNotificationsPage() {
  const [session, setSession] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [priority, setPriority] = useState('all')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingHistory, setDeletingHistory] = useState(false)
  const [actionNotice, setActionNotice] = useState('')

  const userId = session?.user_id || session?.id || session?.userId || session?.sub || ''

  useEffect(() => {
    const storedSession = readStoredSession()
    setSession(storedSession)
    if (!storedSession) setLoading(false)
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    const loadNotifications = async () => {
      try {
        const response = await fetch('/api/notifications', { method: 'GET', credentials: 'same-origin' })
        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to load notifications')
        }

        setNotifications(result.notifications || [])
      } catch (error) {
        console.error('Notifications fetch failed:', error)
        setNotifications([])
      } finally {
        setLoading(false)
      }
    }

    loadNotifications()
  }, [userId])

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      const matchesText = !search.trim() || `${notification.title} ${notification.message}`.toLowerCase().includes(search.toLowerCase())
      const matchesType = filter === 'all' || notification.type === filter
      const matchesPriority = priority === 'all' || notification.priority === priority
      return matchesText && matchesType && matchesPriority
    })
  }, [notifications, search, filter, priority])

  const unreadCount = notifications.filter((item) => !item.is_read).length

  const markAsRead = async (id) => {
    if (!id) return

    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to mark notification as read')
      }

      setNotifications((previous) => previous.map((item) => item.id === id ? { ...item, is_read: true } : item))
    } catch (error) {
      console.error('Update read state failed:', error)
    }
  }

  const markAllAsRead = async () => {
    if (!userId) return

    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to mark notifications as read')
      }

      setNotifications((previous) => previous.map((item) => ({ ...item, is_read: true })))
    } catch (error) {
      console.error('Mark all notifications read failed:', error)
    }
  }

  const deleteNotificationHistory = async () => {
    if (!userId) return

    setDeletingHistory(true)
    setActionNotice('')
    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to delete notification history')
      }

      setNotifications([])
      setShowDeleteConfirm(false)
      setActionNotice('Notification history deleted.')
    } catch (error) {
      console.error('Delete notification history failed:', error)
      setActionNotice(error.message || 'Unable to delete notification history.')
    } finally {
      setDeletingHistory(false)
    }
  }

  const notifyUrgent = () => {
    if (typeof window === 'undefined' || !soundEnabled) return

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.type = 'triangle'
      oscillator.frequency.value = 880
      gainNode.gain.value = 0.08
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.15)
    } catch {
      // ignore browser audio restrictions
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_35%,_#f1f5f9_100%)] text-slate-900">
      <div className="mx-auto max-w-[1200px] px-3 pb-28 pt-3 sm:px-4 sm:pb-10 lg:px-6">
        <header className="mb-6 rounded-[24px] border border-slate-200 bg-white/90 px-3 py-3 shadow-sm backdrop-blur md:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Alerts</p>
                <h1 className="text-lg font-bold text-slate-900">Real-time notifications</h1>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={notifyUrgent} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                <Volume2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={markAllAsRead} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                Mark all read
              </button>
              <button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={!notifications.length || deletingHistory} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete history</span>
              </button>
            </div>
          </div>
        </header>

        {actionNotice && <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">{actionNotice}</div>}

        {showDeleteConfirm && (
          <div className="mb-6 rounded-[22px] border border-red-200 bg-red-50 p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <h2 className="text-sm font-bold text-red-900">Delete notification history?</h2>
              <p className="mt-1 text-sm text-red-700">This permanently removes all of your notifications and cannot be undone.</p>
            </div>
            <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
              <button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={deletingHistory} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={deleteNotificationHistory} disabled={deletingHistory} className="rounded-full bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{deletingHistory ? 'Deleting...' : 'Delete history'}</button>
            </div>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3">
          {[
            { label: 'Unread', value: unreadCount, icon: Bell },
            { label: 'Announcements', value: notifications.filter((n) => n.type === 'announcement').length, icon: Sparkles },
            { label: 'Events', value: notifications.filter((n) => n.type === 'event').length, icon: BellRing },
            { label: 'System', value: notifications.filter((n) => n.type === 'system').length, icon: ShieldAlert },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
                  <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notifications..."
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
                <Filter className="h-4 w-4" />
                <select value={filter} onChange={(event) => setFilter(event.target.value)} className="border-none bg-transparent text-sm text-slate-700 outline-none">
                  <option value="all">All types</option>
                  <option value="announcement">Announcements</option>
                  <option value="event">Events</option>
                  <option value="system">System</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
                <Clock3 className="h-4 w-4" />
                <select value={priority} onChange={(event) => setPriority(event.target.value)} className="border-none bg-transparent text-sm text-slate-700 outline-none">
                  <option value="all">All priority</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" checked={soundEnabled} onChange={() => setSoundEnabled((value) => !value)} className="h-4 w-4 accent-violet-600" />
                Sound alerts
              </label>
            </div>
          </div>

          {loading ? (
            <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Loading notifications...</div>
          ) : filteredNotifications.length ? (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <div key={notification.id} className={`rounded-[20px] border p-4 transition ${notification.is_read ? 'border-slate-200 bg-slate-50' : 'border-violet-200 bg-violet-50/60'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${TYPE_STYLES[notification.type] || 'bg-slate-100 text-slate-700'}`}>
                        <Bell className="h-4 w-4" />
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{notification.title}</h3>
                          {!notification.is_read && <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">New</span>}
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${PRIORITY_STYLES[notification.priority] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {notification.priority || 'normal'}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${TYPE_STYLES[notification.type] || 'bg-slate-100 text-slate-700'}`}>
                            {notification.type}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{notification.message}</p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                          <span>{formatDate(notification.created_at)}</span>
                          {notification.action_url ? <Link href={notification.action_url} className="font-medium text-violet-700">Open link</Link> : null}
                        </div>
                      </div>
                    </div>

                    <button type="button" onClick={() => markAsRead(notification.id)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                      <CheckCheck className="h-3.5 w-3.5" />
                      {notification.is_read ? 'Read' : 'Mark read'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              No notifications match the selected filters.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
