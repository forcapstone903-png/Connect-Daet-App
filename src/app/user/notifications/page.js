'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Angry, Bell, BellRing, CheckCheck, Frown, Heart, Laugh, MessageCircle, Repeat2, Search, ShieldAlert, Sparkles, ThumbsUp, Trash2, UserRoundPlus, Volume2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSession } from '@/lib/authCookies'
import Comments from '@/app/components/user/Comments'

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

function formatRelativeTime(dateValue) {
  if (!dateValue) return 'Just now'

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return 'Just now'

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))

  if (diffSeconds < 60) return `${diffSeconds}s`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`

  return `${Math.floor(diffSeconds / 86400)}d`
}

function getInitials(name = '') {
  return String(name).split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

function getNotificationMessageText(notification, actorName) {
  const rawMessage = String(notification?.message || notification?.title || '')
  const actorPrefix = String(actorName || '').trim()

  let normalizedMessage = rawMessage

  if (actorPrefix) {
    normalizedMessage = normalizedMessage.replace(new RegExp(`^${actorPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '')
  }

  normalizedMessage = normalizedMessage.replace(/\s*\((?:like|love|laugh|wow|sad|angry)\)\.?\s*$/i, '').trim()

  const commentMatch = normalizedMessage.match(/^(commented on your (?:post|comment)|replied to your comment)\s*:\s*(.+)$/i)
  if (commentMatch?.[1] && commentMatch[2]) {
    const trailing = commentMatch[2].trim()
    const quotedTrailing = trailing.startsWith('"') ? trailing : `"${trailing.replace(/"+$/, '')}"`
    return `${commentMatch[1].trim()}: ${quotedTrailing}`
  }

  return normalizedMessage || rawMessage
}

function getNotificationReactionType(notification) {
  const directReactionType = String(notification?.reaction_type || notification?.metadata?.reaction_type || '')
  if (directReactionType) return directReactionType.toLowerCase()

  const rawMessage = String(notification?.message || notification?.title || '')
  const match = rawMessage.match(/\(([^)]+)\)\.?\s*$/)
  if (match?.[1]) return match[1].trim().toLowerCase()

  return ''
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
  const [activeCommentsSheet, setActiveCommentsSheet] = useState(null)
  const [commentsSheetVisible, setCommentsSheetVisible] = useState(false)
  const sheetTouchStartY = useRef(null)

  const userId = session?.user_id || session?.id || session?.userId || session?.sub || ''

  const openCommentsSheet = (sheetData) => {
    setActiveCommentsSheet(sheetData)
    setCommentsSheetVisible(false)
    window.dispatchEvent(new CustomEvent('daet-comments-sheet-state', { detail: { open: true } }))
    window.requestAnimationFrame(() => setCommentsSheetVisible(true))
  }

  const closeCommentsSheet = () => {
    setCommentsSheetVisible(false)
    window.setTimeout(() => {
      setActiveCommentsSheet(null)
      window.dispatchEvent(new CustomEvent('daet-comments-sheet-state', { detail: { open: false } }))
    }, 280)
  }

  useEffect(() => {
    if (!activeCommentsSheet) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [activeCommentsSheet])

  useEffect(() => {
    const handleOpenComments = (event) => {
      if (!event.detail?.contentId) return
      openCommentsSheet(event.detail)
    }

    window.addEventListener('daet-open-notification-comments', handleOpenComments)
    return () => window.removeEventListener('daet-open-notification-comments', handleOpenComments)
  }, [])

  useEffect(() => {
    const storedSession = readStoredSession()
    queueMicrotask(() => {
      setSession(storedSession)
      if (!storedSession) setLoading(false)
    })
  }, [])

  const syncUnreadBadge = (nextNotifications = notifications) => {
    if (typeof window === 'undefined') return

    const unreadCount = (nextNotifications || []).filter((item) => !item.is_read).length
    queueMicrotask(() => {
      window.dispatchEvent(
        new CustomEvent('daet-notifications-updated', {
          detail: { unreadCount },
        }),
      )
    })
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
            if (previous.some((item) => item.id === incoming.id)) {
              syncUnreadBadge(previous)
              return previous
            }

            const next = [{ ...incoming, actor_id: actor?.id || incoming.actor_id || null, actor: actor || null }, ...previous]
            syncUnreadBadge(next)
            return next
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
        setNotifications((previous) => {
          const next = previous.map((item) => item.id === updated.id ? { ...item, ...updated } : item)
          syncUnreadBadge(next)
          return next
        })
      })
      realtimeChannel.on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'info_notifications',
        filter: `user_id=eq.${userIdForRealtime}`,
      }, (payload) => {
        const deletedId = payload?.old?.id
        if (!deletedId) return
        setNotifications((previous) => {
          const next = previous.filter((item) => item.id !== deletedId)
          syncUnreadBadge(next)
          return next
        })
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
    const groups = { New: [], Earlier: [] }

    notifications.forEach((notification) => {
      if (notification.is_read) groups.Earlier.push(notification)
      else groups.New.push(notification)
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

  const getNotificationActionIcon = (notification) => {
    const normalizedType = String(notification?.type || '').toLowerCase()
    const reactionType = getNotificationReactionType(notification)

    if (normalizedType === 'reaction' || reactionType) {
      switch (reactionType) {
        case 'love':
          return { emoji: '❤️', className: 'text-rose-500' }
        case 'laugh':
          return { emoji: '😂', className: 'text-amber-500' }
        case 'wow':
          return { emoji: '😮', className: 'text-violet-500' }
        case 'sad':
          return { emoji: '😢', className: 'text-sky-500' }
        case 'angry':
          return { emoji: '😡', className: 'text-red-500' }
        case 'like':
        default:
          return { emoji: '👍', className: 'text-sky-500' }
      }
    }

    if (normalizedType === 'comment' || normalizedType === 'reply') {
      return { emoji: '💬', className: 'text-sky-600' }
    }

    if (normalizedType === 'follow') {
      return { emoji: '👤', className: 'text-indigo-500' }
    }

    if (normalizedType === 'repost' || normalizedType === 'share') {
      return { emoji: '🔁', className: 'text-emerald-500' }
    }

    return { emoji: '🔔', className: 'text-slate-500' }
  }

  const getNotificationHref = (notification) => {
    const metadata = notification.metadata && typeof notification.metadata === 'object' ? notification.metadata : {}
    const routeCandidate = notification.link || notification.action_url || notification.href || metadata.link || metadata.href || metadata.action_url || null
    const postId = notification.post_id || metadata.post_id || metadata.entityId || null
    const notificationType = String(notification.type || metadata.type || '').toLowerCase()
    const commentId = notification.comment_id || notification.reply_id || metadata.comment_id || metadata.reply_id
      || String(routeCandidate || '').match(/#comment-([^/?#]+)/)?.[1] || null
    const commentRelated = Boolean(commentId)
      || ['comment', 'reply', 'mention'].includes(notificationType)
      || /\b(?:comment|repl(?:ied|y)|reacted to your comment)\b/i.test(String(notification.message || notification.title || ''))

    if (commentRelated && (routeCandidate || postId)) {
      const routeMatch = String(routeCandidate).match(/\/user\/(blogs|events|forums|posts|announcements)\/([^/?#]+)/)
      const relatedPostId = postId || routeMatch?.[2]
      if (relatedPostId) {
        const routeType = routeMatch?.[1]
        const rawContentType = metadata.content_type || metadata.contentType || ''
        const contentType = rawContentType === 'post' ? 'user_post'
          : rawContentType === 'forum' ? 'forum_thread'
            : rawContentType || (
          routeType === 'blogs' ? 'blog'
            : routeType === 'events' ? 'event'
              : routeType === 'forums' ? 'forum_thread'
                : routeType === 'announcements' ? 'announcement'
                  : 'user_post'
            )
        const params = new URLSearchParams({
          openComments: '1',
          contentType,
          contentId: String(relatedPostId),
        })
        if (commentId) params.set('commentId', String(commentId))
        return `/user/notifications?${params.toString()}`
      }
    }

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

  const NotificationAvatar = ({ notification, actor, actorName, actorProfileHref }) => {
    const { emoji, className } = getNotificationActionIcon(notification)
    const normalizedType = String(notification?.type || '').toLowerCase()
    const isCommentType = normalizedType === 'comment' || normalizedType === 'reply'
    const avatarContent = actor?.profile_image_url ? (
      <img src={actor.profile_image_url} alt={actorName} className="h-full w-full object-cover" />
    ) : (
      <span className="text-xs font-black text-slate-600">{getInitials(actorName)}</span>
    )

    const avatarElement = actorProfileHref ? (
      <Link href={actorProfileHref} onClick={(event) => event.stopPropagation()} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-black text-slate-600" aria-label={`Open ${actorName}'s profile`}>
        {avatarContent}
      </Link>
    ) : (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-black text-slate-600">
        {avatarContent}
      </div>
    )

    return (
      <div className="relative shrink-0">
        {avatarElement}
        {isCommentType ? (
          <span className="absolute -bottom-2 -right-1 flex h-7 w-7 items-center justify-center rounded-[14px] bg-sky-500 shadow-sm" aria-label="Notification action">
            <MessageCircle className="h-4 w-4 text-white" fill="white" />
          </span>
        ) : (
          <span className={`absolute -bottom-2 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-[1.25rem] leading-none shadow-none ${className}`} aria-label="Notification action">
            {emoji}
          </span>
        )}
      </div>
    )
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

      setNotifications((previous) => {
        const next = previous.map((item) => item.id === id ? { ...item, is_read: true } : item)
        syncUnreadBadge(next)
        return next
      })
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

      setNotifications((previous) => {
        const next = previous.map((item) => ({ ...item, is_read: true }))
        syncUnreadBadge(next)
        return next
      })
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

      setNotifications((previous) => {
        const next = previous.filter((item) => item.id !== id)
        syncUnreadBadge(next)
        return next
      })
    } catch (error) {
      console.error('Delete notification failed:', error)
      setActionNotice(error.message || 'Unable to delete notification.')
    }
  }

  const openNotification = async (notification) => {
    const href = getNotificationHref(notification)
    if (!notification.is_read) await markAsRead(notification.id)
    if (href?.startsWith('/user/notifications?openComments=')) {
      const params = new URLSearchParams(href.split('?')[1])
      const sheetData = {
        contentType: params.get('contentType') || '',
        contentId: params.get('contentId') || '',
        commentId: params.get('commentId') || null,
        userId,
        contentOwnerId: null,
        contentTitle: notification.message || 'Discussion',
      }
      window.history.replaceState(null, '', href)
      window.dispatchEvent(new CustomEvent('daet-open-notification-comments', { detail: sheetData }))
      return
    }
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
      syncUnreadBadge([])
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
        <header className="mb-4 border-b border-slate-200 bg-white pb-3">
          <div className="flex items-center justify-between gap-3 px-1 py-2">
            <h1 className="text-[28px] font-black tracking-[-0.06em] text-slate-900">Notifications</h1>
            <button type="button" aria-label="Search notifications" title="Search notifications" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
              <Search className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
              <BellRing className="h-3.5 w-3.5" />
              Alerts
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={markAllAsRead} disabled={!unreadCount} className="text-xs font-semibold text-sky-700 disabled:opacity-40">
                Mark all read
              </button>
              <button type="button" onClick={() => setShowDeleteConfirm(true)} aria-label="Clear notification history" title="Clear notification history" disabled={!notifications.length || deletingHistory} className="text-xs font-semibold text-red-600 disabled:opacity-40">
                Clear all
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
                    const actorName = actor?.full_name || actor?.name || (String(notification.message || '').split(/\s+(?:started following you|followed you back|commented|reacted|liked|sent you)/i)[0] || '').trim() || 'Community member'
                    const actorProfileHref = getActorProfileHref(notification)
                    const isFollowType = String(notification.type || '').toLowerCase() === 'follow'
                    const messageText = getNotificationMessageText(notification, actorName)
                    const isFollowBack = isFollowType && messageText.toLowerCase().includes('followed you back')
                    const isStartedFollowing = isFollowType && messageText.toLowerCase().includes('started following you')
                    const followActionCompleted = getFollowActionCompletedFromNotification(notification)
                    const followActionMode = followActionCompleted ? 'message' : 'say-hi'
                    const relativeTime = formatRelativeTime(notification.created_at)

                    return (
                      <div key={notification.id} onClick={() => openNotification(notification)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); openNotification(notification) } }} role="button" tabIndex={0} className={`block w-full rounded-[20px] border p-3 text-left transition ${notification.is_read ? 'border-slate-200 bg-white' : 'border-sky-200 bg-sky-50/50 shadow-sm'}`}>
                        <div className="flex items-start gap-3">
                          <NotificationAvatar notification={notification} actor={actor} actorName={actorName} actorProfileHref={actorProfileHref} />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm leading-5 text-slate-700">
                                  {actorProfileHref ? (
                                    <Link href={actorProfileHref} onClick={(event) => event.stopPropagation()} className="font-black text-slate-900 hover:text-sky-700">{actorName}</Link>
                                  ) : (
                                    <span className="font-black text-slate-900">{actorName}</span>
                                  )}
                                  <span className="ml-1 text-slate-600">{messageText}</span>
                                </p>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                {!notification.is_read && <span className="h-2.5 w-2.5 rounded-full bg-sky-500" aria-label="Unread" />}
                                <button type="button" onClick={(event) => { event.stopPropagation(); void deleteNotification(notification.id) }} aria-label="Delete notification" title="Delete notification" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-red-600">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {isFollowType && isFollowBack ? (
                              <div className="mt-2 flex items-center justify-between gap-3">
                                <div className="text-xs text-slate-500">{relativeTime}</div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {followActionMode === 'message' ? (
                                    <button type="button" onClick={(event) => { event.stopPropagation(); const actorId = parseProfileActorId(notification); if (actorId) router.push(`/user/messaging/${actorId}`) }} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700">Message</button>
                                  ) : (
                                    <button type="button" onClick={(event) => { event.stopPropagation(); void sendFollowSideAction(notification, 'hi') }} className="rounded-full bg-sky-700 px-3 py-1 text-[11px] font-bold text-white hover:bg-sky-800">Say Hi</button>
                                  )}
                                  <button type="button" onClick={(event) => { event.stopPropagation(); void markAsRead(notification.id) }} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                                    {notification.is_read ? 'Read' : 'Mark read'}
                                  </button>
                                </div>
                              </div>
                            ) : isFollowType && isStartedFollowing ? (
                              <div className="mt-2 flex items-center justify-between gap-3">
                                <span className="text-xs text-slate-500">{relativeTime}</span>
                              </div>
                            ) : (
                              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                                <span>{relativeTime}</span>
                                {notification.is_read ? <span className="font-semibold text-slate-500">Seen</span> : <span className="font-semibold text-sky-700">New</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
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

      {activeCommentsSheet && (
        <div
          className={`fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] transition-opacity duration-300 ${commentsSheetVisible ? 'opacity-100' : 'opacity-0'}`}
          onClick={closeCommentsSheet}
        >
          <div
            className={`absolute inset-x-0 bottom-0 mx-auto flex h-[82vh] max-h-[900px] w-full max-w-[760px] flex-col rounded-t-[28px] border border-slate-200 bg-white shadow-[0_-20px_55px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-out ${commentsSheetVisible ? 'translate-y-0' : 'translate-y-full'}`}
            onClick={(event) => event.stopPropagation()}
            onTouchStart={(event) => { sheetTouchStartY.current = event.touches[0]?.clientY || null }}
            onTouchEnd={(event) => {
              const startY = sheetTouchStartY.current
              const endY = event.changedTouches[0]?.clientY
              sheetTouchStartY.current = null
              if (startY !== null && typeof endY === 'number' && endY - startY > 80) closeCommentsSheet()
            }}
          >
            <div className="shrink-0 border-b border-slate-200 px-4 pb-3 pt-2 sm:px-5">
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-300" />
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" onClick={closeCommentsSheet} aria-label="Close comments" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">
                    <X className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Comments</p>
                    <p className="truncate text-sm font-bold text-slate-900">{activeCommentsSheet.contentTitle || 'Discussion'}</p>
                  </div>
                </div>
                <button type="button" onClick={closeCommentsSheet} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">Close</button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-2 sm:px-4 sm:pb-4">
              <Comments
                contentType={activeCommentsSheet.contentType}
                contentId={activeCommentsSheet.contentId}
                userId={activeCommentsSheet.userId}
                contentOwnerId={activeCommentsSheet.contentOwnerId}
                contentTitle={activeCommentsSheet.contentTitle}
                sheetMode
                focusCommentId={activeCommentsSheet.commentId}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
