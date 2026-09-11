'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, CheckCheck, MessageCircle, ShieldAlert, Sparkles, Trash2, Volume2 } from 'lucide-react'
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

function getInitials(name = '') {
  return String(name).split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

function getNotificationActorId(notification) {
  if (notification?.actor_id) return notification.actor_id

  const link = String(notification?.link || notification?.action_url || notification?.href || '')
  const profileMatch = link.match(/\/user\/profile\/([^/?#]+)/)
  if (profileMatch?.[1]) return profileMatch[1]

  const messageMatch = link.match(/\/user\/messaging\/([^/?#]+)/)
  return messageMatch?.[1] || null
}

export default function UserNotificationsPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingHistory, setDeletingHistory] = useState(false)
  const [actionNotice, setActionNotice] = useState('')

  const userId = session?.user_id || session?.id || session?.userId || session?.sub || ''

  useEffect(() => {
    const storedSession = readStoredSession()
    queueMicrotask(() => {
      setSession(storedSession)
      if (!storedSession) setLoading(false)
    })
  }, [])

  const syncUnreadBadge = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('daet-notifications-updated'))
  }

  useEffect(() => {
    if (!session) {
      return undefined
    }

    const userIdForRealtime = userId || session?.user_id || session?.id || session?.userId || session?.sub || ''

    const loadNotifications = async () => {
      setLoadError('')
      let lastError = null

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 10000)

        try {
          const response = await fetch('/api/notifications', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
          })
          const result = await response.json().catch(() => ({}))

          if (!response.ok || !result.success) {
            throw new Error(result.message || `Unable to load notifications (${response.status})`)
          }

          if (session) setNotifications(result.notifications || [])
          setLoading(false)
          window.clearTimeout(timeout)
          return
        } catch (error) {
          lastError = error
        } finally {
          window.clearTimeout(timeout)
        }
      }

      if (lastError) setLoadError('We could not load your notifications right now. Please try again.')
      setLoading(false)
    }

    loadNotifications()

    let realtimeChannel = null
    let active = true
    let reconnectTimeout = null
    let reconnectAttempt = 0
    if (supabase?.channel && userIdForRealtime) {
      realtimeChannel = supabase.channel(`notifications-realtime-${userIdForRealtime}`)
      realtimeChannel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'info_notifications',
          filter: `user_id=eq.${userIdForRealtime}`,
        },
        (payload) => {
          const incoming = payload?.new || null
          if (!incoming || !incoming.id) return

          const actorId = getNotificationActorId(incoming)
          const addNotification = (actor) => setNotifications((previous) => {
            if (previous.some((item) => item.id === incoming.id)) return previous
            return [{ ...incoming, actor_id: actor?.id || incoming.actor_id || null, actor: actor || null }, ...previous]
          })

          if (actorId && supabase) {
            void supabase
              .from('info_users')
              .select('id, full_name, profile_image_url')
              .eq('id', actorId)
              .maybeSingle()
              .then(({ data: actor }) => addNotification(actor))
          } else {
            addNotification(null)
          }
          syncUnreadBadge()
        },
      )
      realtimeChannel.on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'info_notifications',
        filter: `user_id=eq.${userIdForRealtime}`,
      }, (payload) => {
        const updated = payload?.new
        if (!updated?.id) return
        setNotifications((previous) => previous.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
        syncUnreadBadge()
      })
      realtimeChannel.on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'info_notifications',
        filter: `user_id=eq.${userIdForRealtime}`,
      }, (payload) => {
        const deletedId = payload?.old?.id
        if (!deletedId) return
        setNotifications((previous) => previous.filter((item) => item.id !== deletedId))
        syncUnreadBadge()
      })
      realtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          reconnectAttempt = 0
          return
        }
        if (!['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) return
        if (reconnectTimeout) window.clearTimeout(reconnectTimeout)
        const delay = Math.min(5000, 1000 * (2 ** reconnectAttempt))
        reconnectAttempt += 1
        reconnectTimeout = window.setTimeout(() => {
          if (active) realtimeChannel?.subscribe()
        }, delay)
      })
    }

    return () => {
      if (realtimeChannel) {
        active = false
        if (reconnectTimeout) window.clearTimeout(reconnectTimeout)
        try {
          supabase.removeChannel(realtimeChannel)
        } catch {
          // ignore realtime channel teardown failures
        }
      }
    }
  }, [session, userId, retryKey])

  const unreadCount = notifications.filter((item) => !item.is_read).length

  const groupedNotifications = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const groups = { Today: [], Earlier: [] }
    notifications.forEach((notification) => {
      const createdAt = new Date(notification.created_at || 0)
      if (!Number.isNaN(createdAt.getTime()) && createdAt >= today) groups.Today.push(notification)
      else groups.Earlier.push(notification)
    })
    return Object.entries(groups).filter(([, items]) => items.length)
  }, [notifications])

  const getNotificationIcon = (notification) => {
    if (notification.type === 'event') return BellRing
    if (notification.type === 'announcement') return Sparkles
    if (notification.type === 'activity') return MessageCircle
    if (notification.type === 'warning' || notification.type === 'error') return ShieldAlert
    return Bell
  }

  const getNotificationHref = (notification) => {
    const metadata = notification.metadata && typeof notification.metadata === 'object' ? notification.metadata : {}
    const routeCandidate = notification.link || notification.action_url || notification.href || metadata.link || metadata.href || metadata.action_url || null
    const postId = notification.post_id || metadata.post_id || metadata.entityId || null
    const notificationType = String(notification.type || metadata.type || '').toLowerCase()

    if (notificationType === 'message' && routeCandidate && userId) {
      const messagePath = String(routeCandidate).split('?')[0].replace(/\/+$/, '')
      if (messagePath === `/user/messaging/${userId}`) return '/user/messaging'
    }

    if (routeCandidate?.startsWith('/user/announcements/')) {
      return routeCandidate
    }

    if (routeCandidate?.startsWith('/user/posts/')) {
      return postId ? `/user/posts/${postId}` : routeCandidate
    }

    if (routeCandidate?.startsWith('/admin/')) {
      return routeCandidate
    }

    if (!routeCandidate && postId) {
      if (notificationType === 'announcement') {
        return `/user/announcements/${postId}`
      }

      return `/user/posts/${postId}`
    }

    return routeCandidate || null
  }

  const parseProfileActorId = (notification) => {
    try {
      const link = notification?.link || notification?.action_url || notification?.href || ''
      const cleaned = String(link).split('?')[0]
      const match = cleaned.match(/\/user\/profile\/([^/?#]+)/)
      return match?.[1] || notification?.actor_id || null
    } catch {
      return null
    }
  }

  const getActorProfileHref = (notification) => {
    const actorId = getNotificationActorId(notification)
    return actorId ? `/user/profile/${encodeURIComponent(actorId)}` : null
  }

  const getFollowActionCompletedFromNotification = (notification) => {
    const link = notification?.link || notification?.action_url || notification?.href || ''
    const query = String(link).includes('?') ? String(link).split('?')[1] : ''
    const params = new URLSearchParams(query)
    return params.get('action_completed') === 'true'
  }

  const appendFollowActionCompletion = (notification, actionType) => {
    const baseLink = notification?.link || notification?.action_url || notification?.href || ''
    const hasQuery = String(baseLink).includes('?')
    const suffix = hasQuery ? `&action_completed=true&action_type=${encodeURIComponent(actionType)}` : `?action_completed=true&action_type=${encodeURIComponent(actionType)}`
    return `${baseLink}${suffix}`
  }

  const sendFollowSideAction = async (notification, actionType) => {
    const actorId = parseProfileActorId(notification)
    if (!actorId) {
      setActionNotice('That follow-back notification is missing the related profile link.')
      return
    }

    if (getFollowActionCompletedFromNotification(notification)) {
      router.push(`/user/messaging/${actorId}`)
      return
    }

    const messageBody = actionType === 'wave' ? '👋 Wave from the app' : 'Hi there! 👋'

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: actorId, body: messageBody, messageType: 'text' }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to send the follow-back message.')
      }

      const nextLink = appendFollowActionCompletion(notification, actionType)
      const patchResponse = await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notification.id, link: nextLink, is_read: false }),
      })

      const patchResult = await patchResponse.json().catch(() => ({}))
      if (!patchResponse.ok || !patchResult.success) {
        throw new Error(patchResult.message || 'Unable to persist the follow-back action state.')
      }

      setNotifications((previous) => previous.map((item) => item.id === notification.id ? {
        ...item,
        link: nextLink,
      } : item))

      setActionNotice(actionType === 'wave' ? 'Wave sent.' : 'Hi sent.')
      syncUnreadBadge()
    } catch (error) {
      console.error('Send follow action failed:', error)
      setActionNotice(error.message || 'Unable to send the follow-back action.')
    }
  }

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
      syncUnreadBadge()
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
      syncUnreadBadge()
    } catch (error) {
      console.error('Mark all notifications read failed:', error)
    }
  }

  const deleteNotification = async (id) => {
    if (!id) return

    try {
      const response = await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to delete notification')
      }

      setNotifications((previous) => previous.filter((item) => item.id !== id))
      syncUnreadBadge()
    } catch (error) {
      console.error('Delete notification failed:', error)
      setActionNotice(error.message || 'Unable to delete notification.')
    }
  }

  const openNotification = async (notification) => {
    const href = getNotificationHref(notification)
    if (!notification.is_read) await markAsRead(notification.id)
    if (href) router.push(href)
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ecfeff_0%,#f8fafc_35%,#f1f5f9_100%)] text-slate-900">
      <div className="mx-auto max-w-300 px-3 pb-28 pt-3 sm:px-4 sm:pb-10 lg:px-6">
        <section className="mb-4 rounded-[28px] border border-white/70 bg-white/80 px-3 py-4 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur md:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#dff7ee] text-emerald-700">
                  <BellRing className="h-4 w-4" />
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Alerts</p>
              </div>
              <h1 className="text-lg font-black tracking-tight text-slate-900 sm:text-2xl">Real-time notifications</h1>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={notifyUrgent} aria-label="Toggle notification sound" title="Notification sound" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                <Volume2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={markAllAsRead} disabled={!unreadCount} className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 disabled:opacity-40">
                <CheckCheck className="mr-1 h-3.5 w-3.5" />Read all
              </button>
              <button type="button" onClick={() => setShowDeleteConfirm(true)} aria-label="Clear notification history" title="Clear notification history" disabled={!notifications.length || deletingHistory} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-bold text-sky-700">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              {unreadCount} unread
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700">
              <Sparkles className="h-3.5 w-3.5" />
              live feed
            </span>
          </div>
        </section>

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

        <div className="space-y-6">
          {loading ? (
            <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Loading notifications...</div>
          ) : loadError ? (
            <div role="alert" className="rounded-[18px] border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-semibold text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={() => setRetryKey((value) => value + 1)}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                <Bell className="h-4 w-4" />
                Try again
              </button>
            </div>
          ) : notifications.length ? (
            <div className="space-y-6">
              {groupedNotifications.map(([groupLabel, groupItems]) => (
                <section key={groupLabel} className="rounded-3xl border border-white/70 bg-white/70 p-3 shadow-sm backdrop-blur sm:p-4">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">{groupLabel}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{groupItems.length}</span>
                  </div>
                  <div className="space-y-2">
                  {groupItems.map((notification) => {
                    const NotificationIcon = getNotificationIcon(notification)
                    const actor = notification.actor || null
                    const actorName = actor?.full_name || (String(notification.message || '').split(/\s+(?:started following you|followed you back|commented|reacted|liked|sent you)/i)[0] || '').trim() || 'Community member'
                    const actorProfileHref = getActorProfileHref(notification)
                    const isFollowType = String(notification.type || '').toLowerCase() === 'follow'
                    const messageText = String(notification.message || '')
                    const isFollowBack = isFollowType && messageText.toLowerCase().includes('followed you back')
                    const isStartedFollowing = isFollowType && messageText.toLowerCase().includes('started following you')
                    const followActionCompleted = getFollowActionCompletedFromNotification(notification)
                    const followActionMode = followActionCompleted ? 'message' : 'say-hi'
                    return <div key={notification.id} onClick={() => openNotification(notification)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); openNotification(notification) } }} role="button" tabIndex={0} className={`relative block w-full text-left rounded-[18px] border p-4 transition active:scale-[0.99] ${notification.is_read ? 'border-slate-200 bg-white' : 'border-emerald-200 bg-[#eefdf7]'}`}>
                      <div className="flex items-start gap-3">
                        {actorProfileHref ? <Link href={actorProfileHref} onClick={(event) => event.stopPropagation()} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-black text-slate-600" aria-label={`Open ${actorName}'s profile`}>{actor?.profile_image_url ? <img src={actor.profile_image_url} alt={actorName} className="h-full w-full object-cover" /> : getInitials(actorName)}</Link> : <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TYPE_STYLES[notification.type] || 'bg-slate-100 text-slate-700'}`}><NotificationIcon className="h-4 w-4" /></div>}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            {actorProfileHref ? <Link href={actorProfileHref} onClick={(event) => event.stopPropagation()} className="block min-w-0 text-sm font-black text-slate-900 hover:text-sky-700">{actorName}</Link> : <span className="min-w-0 text-sm font-black text-slate-900">{actorName}</span>}
                            <button type="button" onClick={(event) => { event.stopPropagation(); void deleteNotification(notification.id) }} aria-label="Delete notification" title="Delete notification" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {isFollowType && isFollowBack ? (
                            <div className="min-w-0">
                              <div className="mt-2 flex items-center justify-between gap-3">
                                <p className="text-sm leading-6 text-slate-600">Followed you back</p>
                                <div className="flex shrink-0 items-center gap-2">
                                  {followActionMode === 'message' ? (
                                    <button type="button" onClick={(event) => { event.stopPropagation(); const actorId = parseProfileActorId(notification); if (actorId) router.push(`/user/messaging/${actorId}`) }} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">Message</button>
                                  ) : (
                                    <button type="button" onClick={(event) => { event.stopPropagation(); void sendFollowSideAction(notification, 'hi') }} className="rounded-full bg-sky-700 px-3 py-1 text-xs font-bold text-white hover:bg-sky-800">Say Hi</button>
                                  )}
                                  <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); markAsRead(notification.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); markAsRead(notification.id) } }} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    {notification.is_read ? 'Read' : 'Mark read'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : isFollowType && isStartedFollowing ? (
                            <div className="min-w-0">
                              <div className="mt-2 flex items-start justify-between gap-3">
                                <p className="text-sm leading-6 text-slate-600">Started following you</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-bold text-slate-900">{notification.title}</h3>
                                {!notification.is_read && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="Unread" />}
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${PRIORITY_STYLES[notification.priority] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>{notification.priority || 'normal'}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${TYPE_STYLES[notification.type] || 'bg-slate-100 text-slate-700'}`}>{notification.type}</span>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{notification.message}</p>
                              <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                                <span>{formatDate(notification.created_at)}</span>
                                {getNotificationHref(notification) ? <span className="font-medium text-violet-700">Open related content</span> : null}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              No notifications yet.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
