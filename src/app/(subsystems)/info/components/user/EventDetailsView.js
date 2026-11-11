'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Bell,
  Bookmark,
  CalendarDays,
  Copy,
  ExternalLink,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Share2,
  ShieldCheck,
  ThumbsDown,
  UserRound,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { getAuthorDisplayName } from '@/lib/userSocialDisplay'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import Comments from './Comments'
import UserTopHeader from './UserTopHeader'
import RealtimeStatus from './RealtimeStatus'
import ShareRepost from './ShareRepost'

function mediaUrl(value) {
  if (Array.isArray(value)) return value.find((item) => typeof item === 'string' && item.trim()) || ''
  return typeof value === 'string' ? value.trim() : ''
}

function formatDate(value, options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) {
  if (!value) return 'Date to be announced'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? 'Date to be announced' : date.toLocaleDateString('en-US', options)
}

function formatTime(value) {
  if (!value) return ''
  const match = String(value).match(/^(\d{1,2}):(\d{2})/)
  if (!match) return String(value)
  const date = new Date()
  date.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatEventDateRange(startValue, endValue) {
  if (!startValue) return 'Date to be announced'
  const start = new Date(`${startValue}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 'Date to be announced'

  const startLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (!endValue || endValue === startValue) return startLabel

  const end = new Date(`${endValue}T00:00:00`)
  if (Number.isNaN(end.getTime())) return startLabel
  const endLabel = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()
    ? String(end.getDate())
    : end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(start.getFullYear() !== end.getFullYear() ? { year: 'numeric' } : {}),
    })
  return `${startLabel} – ${endLabel}`
}

function getEventDateTime(dateValue, timeValue, isEnd = false) {
  if (!dateValue) return null
  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null

  const match = String(timeValue || '').match(/^(\d{1,2}):(\d{2})/)
  if (match) date.setHours(Number(match[1]), Number(match[2]), isEnd ? 59 : 0, isEnd ? 999 : 0)
  else if (isEnd) date.setHours(23, 59, 59, 999)
  return date
}

function getEventStatus(event) {
  if (event.status === 'cancelled') return 'Cancelled'
  if (event.status === 'completed') return 'Completed'

  const start = getEventDateTime(event.start_date, event.start_time)
  const end = getEventDateTime(event.end_date || event.start_date, event.end_time, true)
  const now = new Date()
  if (end && end < now) return 'Completed'
  if (start && start > now) return 'Upcoming'
  if (start && end && start <= now && end >= now) return 'Ongoing'
  return 'Upcoming'
}

function contentItems(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== '')
  if (typeof value === 'string') return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  if (value && typeof value === 'object') return Object.values(value).filter((item) => item !== null && item !== undefined && item !== '')
  return []
}

function DetailList({ title, value }) {
  const items = contentItems(value)
  if (!items.length) return null

  return (
    <section className="event-detail-section">
      <h2>{title}</h2>
      <ul className="event-detail-list">
        {items.map((item, index) => {
          if (typeof item === 'object') {
            const label = item.time || item.title || item.name
            const description = item.description || item.details || item.activity
            return (
              <li key={`${title}-${index}`}>
                {label && <strong>{label}</strong>}
                {description && <span>{description}</span>}
                {!label && !description && <span>{JSON.stringify(item)}</span>}
              </li>
            )
          }
          return <li key={`${title}-${index}`}>{String(item)}</li>
        })}
      </ul>
    </section>
  )
}

function EventSections({ event }) {
  const sectionFields = [
    { title: 'Objectives', value: event.objectives || event.event_objectives },
    { title: 'Highlights', value: event.highlights || event.event_highlights },
    { title: 'Activities', value: event.activities || event.event_activities },
    { title: 'Program & schedule', value: event.program || event.schedule || event.agenda || event.event_schedule },
    { title: 'Requirements & reminders', value: event.requirements || event.reminders || event.event_requirements },
  ]

  return sectionFields.map(({ title, value }) => <DetailList key={title} title={title} value={value} />)
}

function getOrganizerInitials(name) {
  return (name || 'O').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'O'
}

export default function EventDetailsView({ eventId, userId: initialUserId = '', backHref = '/info/visitor/events' }) {
  const router = useRouter()
  const [event, setEvent] = useState(null)
  const [eventRegistrationState, setEventRegistrationState] = useState({ eventId: null, registration: null })
  const eventRegistration = eventRegistrationState.eventId === eventId ? eventRegistrationState.registration : null
  const [registrationLoading, setRegistrationLoading] = useState(false)
  const [organizer, setOrganizer] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [relatedEvents, setRelatedEvents] = useState([])
  const [relatedError, setRelatedError] = useState('')
  const [userId, setUserId] = useState(initialUserId)
  const [isSaved, setIsSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isFollowingOrganizer, setIsFollowingOrganizer] = useState(false)
  const [organizerFollowPending, setOrganizerFollowPending] = useState(false)
  const [organizerFollowLoading, setOrganizerFollowLoading] = useState(false)
  const [reaction, setReaction] = useState('')
  const [likeCount, setLikeCount] = useState(0)
  const [commentCount, setCommentCount] = useState(0)
  const [reactionLoading, setReactionLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false)
  const [commentsSheetVisible, setCommentsSheetVisible] = useState(false)
  const [commentsSheetHeight, setCommentsSheetHeight] = useState(75)
  const [commentsSheetDragging, setCommentsSheetDragging] = useState(false)
  const menuRef = useRef(null)
  const commentsDialogRef = useRef(null)
  const commentsCloseButtonRef = useRef(null)
  const commentsTriggerRef = useRef(null)
  const commentsHistoryRef = useRef(false)
  const commentsCloseTimerRef = useRef(null)
  const commentsDragRef = useRef(null)
  const closeCommentsSheetRef = useRef(null)
  const refreshEventRef = useRef(null)
  const realtime = useRealtimeRefresh({
    channelName: `event-detail-${eventId || 'unknown'}`,
    tables: [{ table: 'info_events', filter: `id=eq.${eventId}` }],
    enabled: Boolean(eventId),
  })
  const { setRefreshCallback } = realtime

  const openCommentsSheet = () => {
    if (commentsCloseTimerRef.current) window.clearTimeout(commentsCloseTimerRef.current)
    setCommentsSheetHeight(75)
    setCommentsSheetOpen(true)
    window.requestAnimationFrame(() => setCommentsSheetVisible(true))
  }

  const closeCommentsSheet = useCallback(() => {
    if (!commentsSheetOpen || commentsCloseTimerRef.current) return
    setCommentsSheetVisible(false)
    if (commentsHistoryRef.current) {
      commentsHistoryRef.current = false
      window.history.back()
    }
    commentsCloseTimerRef.current = window.setTimeout(() => {
      commentsCloseTimerRef.current = null
      setCommentsSheetOpen(false)
      setCommentsSheetHeight(75)
      commentsTriggerRef.current?.focus()
    }, 300)
  }, [commentsSheetOpen])

  useEffect(() => {
    closeCommentsSheetRef.current = closeCommentsSheet
  }, [closeCommentsSheet])

  const handleCommentsHeaderPointerDown = (event) => {
    if (event.target.closest('button, select')) return
    commentsDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: commentsSheetHeight,
      deltaY: 0,
    }
    setCommentsSheetDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleCommentsHeaderPointerMove = (event) => {
    const drag = commentsDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaY = event.clientY - drag.startY
    drag.deltaY = deltaY
    setCommentsSheetHeight(Math.max(35, Math.min(92, drag.startHeight - (deltaY / window.innerHeight) * 100)))
  }

  const handleCommentsHeaderPointerUp = (event) => {
    const drag = commentsDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    commentsDragRef.current = null
    setCommentsSheetDragging(false)
    if (drag.deltaY > 100) closeCommentsSheet()
    else setCommentsSheetHeight(drag.deltaY < -20 ? 92 : 75)
  }

  useEffect(() => {
    if (!commentsSheetOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    document.body.style.paddingRight = `${Math.max(0, window.innerWidth - document.documentElement.clientWidth)}px`
    document.body.classList.add('event-comments-sheet-open')

    const sheet = commentsDialogRef.current
    const visualViewport = window.visualViewport
    const updateViewport = () => {
      if (!sheet || !visualViewport) return
      const visibleBottom = visualViewport.height + visualViewport.offsetTop
      sheet.style.setProperty('--event-comments-viewport-height', `${visualViewport.height}px`)
      sheet.style.setProperty('--event-comments-bottom-gap', `${Math.max(0, window.innerHeight - visibleBottom)}px`)
    }
    updateViewport()
    visualViewport?.addEventListener('resize', updateViewport)
    visualViewport?.addEventListener('scroll', updateViewport)

    const handlePopState = () => {
      if (!commentsHistoryRef.current) return
      commentsHistoryRef.current = false
      setCommentsSheetVisible(false)
      if (commentsCloseTimerRef.current) window.clearTimeout(commentsCloseTimerRef.current)
      commentsCloseTimerRef.current = window.setTimeout(() => {
        commentsCloseTimerRef.current = null
        setCommentsSheetOpen(false)
        setCommentsSheetHeight(75)
        commentsTriggerRef.current?.focus()
      }, 300)
    }

    if (!commentsHistoryRef.current) {
      window.history.pushState({ ...(window.history.state || {}), eventCommentsSheet: true }, '')
      commentsHistoryRef.current = true
    }
    window.addEventListener('popstate', handlePopState)
    const focusFrame = window.requestAnimationFrame(() => commentsCloseButtonRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      visualViewport?.removeEventListener('resize', updateViewport)
      visualViewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('popstate', handlePopState)
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
      document.body.classList.remove('event-comments-sheet-open')
      if (commentsCloseTimerRef.current) {
        window.clearTimeout(commentsCloseTimerRef.current)
        commentsCloseTimerRef.current = null
      }
    }
  }, [commentsSheetOpen])

  useEffect(() => {
    const dialog = commentsDialogRef.current
    if (!commentsSheetOpen || !dialog) return undefined

    const handleDialogKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeCommentsSheetRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [...dialog.querySelectorAll(
        'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [contenteditable="true"], [href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.offsetParent !== null)
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', handleDialogKeyDown)
    return () => dialog.removeEventListener('keydown', handleDialogKeyDown)
  }, [commentsSheetOpen])

  useEffect(() => {
    if (initialUserId) return undefined

    let active = true
    const readIdentity = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const cookieSession = getAuthCookieFromDocument()
        const activeSession = session || (cookieSession?.logged_in ? { user: { id: cookieSession.user_id } } : null)
        if (active && activeSession?.user?.id) setUserId(activeSession.user.id)
      } catch (sessionError) {
        console.error('Event detail session lookup failed:', sessionError)
      }
    }

    void readIdentity()
    return () => { active = false }
  }, [initialUserId])

  useEffect(() => {
    if (!userId || !eventId) {
      return undefined
    }

    let active = true
    Promise.all([
      supabase
        .from('user_favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('item_type', 'event')
        .eq('item_id', eventId)
        .maybeSingle(),
      supabase
        .from('info_users')
        .select('id, full_name, profile_image_url')
        .eq('id', userId)
        .maybeSingle(),
    ]).then(([favoriteResult, userResult]) => {
      if (!active) return
      if (favoriteResult.error) {
        console.error('Event bookmark lookup failed:', favoriteResult.error)
        setNotice('Could not check the saved status for this event.')
      } else {
        setIsSaved(Boolean(favoriteResult.data))
      }
      if (userResult.error) {
        console.error('Event viewer profile load failed:', userResult.error)
        setNotice('Could not load your profile details.')
      } else {
        setCurrentUser(userResult.data)
      }
    }).catch((profileLoadError) => {
      if (!active) return
      console.error('Event viewer information load failed:', profileLoadError)
      setNotice('Could not load your saved status or profile details.')
    })

    return () => { active = false }
  }, [eventId, userId])

  useEffect(() => {
    if (!userId || !eventId) {
      return undefined
    }

    let active = true
    fetch(`/info/api/user/events/${encodeURIComponent(eventId)}/registration`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load registration status.')
        if (active) setEventRegistrationState({ eventId, registration: result.registration })
      })
      .catch((registrationError) => {
        if (!active) return
        console.error('Event registration lookup failed:', registrationError)
        setNotice(registrationError.message || 'Could not load your registration status.')
      })

    return () => { active = false }
  }, [eventId, userId])

  const toggleEventRegistration = async () => {
    if (!userId) {
      router.push('/info/login')
      return
    }
    if (registrationLoading || !event) return

    setRegistrationLoading(true)
    setNotice('')
    try {
      const response = await fetch(`/info/api/user/events/${encodeURIComponent(event.id)}/registration`, {
        method: eventRegistration?.status === 'confirmed' ? 'DELETE' : 'POST',
        credentials: 'same-origin',
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update your registration.')
      const joining = result.registration?.status === 'confirmed'
      setEventRegistrationState({ eventId: event.id, registration: result.registration })
      setEvent((current) => current && ({
        ...current,
        current_attendees: Math.max(0, Number(current.current_attendees || 0) + (joining ? 1 : -1)),
      }))
      setNotice(joining ? 'You are registered for this event.' : 'Your registration was cancelled.')
    } catch (registrationError) {
      console.error('Event registration update failed:', registrationError)
      setNotice(registrationError.message || 'Could not update your registration.')
    } finally {
      setRegistrationLoading(false)
    }
  }

  useEffect(() => {
    if (!eventId) return undefined

    let active = true

    const loadEvent = async (silent = false) => {
      await Promise.resolve()
      if (!active) return
      setEvent(null)
      setOrganizer(null)
      setRelatedEvents([])
      setError('')
      setNotice('')
      if (!silent) setLoading(true)

      const { data, error: eventError } = await supabase
        .from('info_events')
        .select('id, title, description, location, venue, latitude, longitude, start_date, end_date, start_time, end_time, category, organizer, current_attendees, featured_image, images, videos, status, published_at, created_by, created_at')
        .eq('id', eventId)
        .in('status', ['published', 'cancelled', 'completed'])
        .eq('approval_status', 'approved')
        .maybeSingle()

      if (!active) return
      if (eventError) {
        console.error('Event detail load failed:', eventError)
        setEvent(null)
        setOrganizer(null)
        setRelatedEvents([])
        setError('We could not load this event. Please try again.')
        if (!silent) setLoading(false)
        return false
      }
      if (!data) {
        setError('This event is unavailable or has not been published.')
        setEvent(null)
        setOrganizer(null)
        setRelatedEvents([])
        if (!silent) setLoading(false)
        return true
      }

      const [profileResult, relatedResult] = await Promise.all([
        data.created_by
          ? supabase
            .from('info_users')
            .select('id, full_name, profile_image_url, user_type')
            .eq('id', data.created_by)
            .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('info_events')
          .select('id, title, description, location, venue, start_date, start_time, category, featured_image, images')
          .eq('status', 'published')
          .eq('approval_status', 'approved')
          .neq('id', data.id)
          .order('start_date', { ascending: true })
          .limit(12),
      ])
      if (!active) return
      if (profileResult.error) console.error('Event organizer profile load failed:', profileResult.error)
      if (relatedResult.error) {
        console.error('Related event load failed:', relatedResult.error)
        setRelatedError('Related events could not be loaded.')
      }
      const relatedItems = relatedResult.data || []
      const related = [...relatedItems].sort((a, b) => {
        const aCategory = a.category === data.category ? 0 : 1
        const bCategory = b.category === data.category ? 0 : 1
        return aCategory - bCategory
      }).slice(0, 3)
      const detail = { event: data, organizer: profileResult.data || null, relatedEvents: related }
      setEvent(detail.event)
      setOrganizer(detail.organizer)
      setRelatedEvents(detail.relatedEvents)
      setError('')
      setNotice('')
      setLoading(false)
      return true
    }

    const refreshEvent = (silent = false) => loadEvent(silent).catch((loadError) => {
      if (!active) return
      console.error('Event detail fetch failed:', loadError)
      setEvent(null)
      setOrganizer(null)
      setRelatedEvents([])
      setError('We could not load this event. Please try again.')
      if (!silent) setLoading(false)
      return false
    })
    refreshEventRef.current = () => refreshEvent(true)
    setRefreshCallback(() => refreshEventRef.current?.() ?? false)
    void refreshEvent()

    return () => {
      active = false
      refreshEventRef.current = null
    }
  }, [eventId, setRefreshCallback])

  useEffect(() => {
    if (!userId || !organizer?.id || userId === organizer.id) return undefined

    let active = true
    const loadFollowStatus = async () => {
      const { data, error: followError } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', userId)
        .eq('following_id', organizer.id)
        .maybeSingle()
      if (!active) return
      if (followError) {
        console.error('Event organizer follow status lookup failed:', followError)
        setNotice('Could not check whether you follow this organizer.')
        return
      }
      setIsFollowingOrganizer(Boolean(data))
      setOrganizerFollowPending(false)
    }

    void loadFollowStatus().catch((followError) => {
      if (!active) return
      console.error('Event organizer follow status lookup failed:', followError)
      setNotice('Could not check whether you follow this organizer.')
    })
    return () => { active = false }
  }, [organizer?.id, userId])

  useEffect(() => {
    if (!eventId) return undefined

    let active = true
    const loadEngagement = async () => {
      const [reactionResult, commentResult] = await Promise.all([
        supabase
          .from('content_reactions')
          .select('user_id, reaction_type')
          .eq('content_type', 'event')
          .eq('content_id', eventId),
        supabase
          .from('content_comments')
          .select('id', { count: 'exact', head: true })
          .eq('content_type', 'event')
          .eq('content_id', eventId)
          .eq('status', 'active'),
      ])
      if (!active) return

      if (reactionResult.error) console.error('Event reactions load failed:', reactionResult.error)
      else {
        const rows = reactionResult.data || []
        setLikeCount(rows.filter((item) => item.reaction_type !== 'dislike').length)
        setReaction(rows.find((item) => item.user_id === userId)?.reaction_type || '')
      }
      if (commentResult.error) console.error('Event comment count load failed:', commentResult.error)
      else setCommentCount(commentResult.count || 0)
    }

    const refreshEngagement = () => {
      void loadEngagement().catch((engagementError) => {
        if (!active) return
        console.error('Event engagement load failed:', engagementError)
        setNotice('Event engagement details could not be refreshed.')
      })
    }

    refreshEngagement()
    if (!supabase?.channel) return () => { active = false }

    const channel = supabase.channel(`event-engagement-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reactions', filter: `content_id=eq.${eventId}` }, refreshEngagement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_comments', filter: `content_id=eq.${eventId}` }, refreshEngagement)
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [eventId, userId])

  useEffect(() => {
    if (!menuOpen) return undefined
    const closeOnOutsideClick = (clickEvent) => {
      if (!menuRef.current?.contains(clickEvent.target)) setMenuOpen(false)
    }
    const closeOnEscape = (keyEvent) => {
      if (keyEvent.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const image = useMemo(() => mediaUrl(event?.featured_image) || mediaUrl(event?.images), [event])
  const location = [event?.venue, event?.location].filter(Boolean).join(', ')
  const mapQuery = event?.latitude != null && event?.longitude != null
    ? `${event.latitude},${event.longitude}`
    : location
  const mapUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : ''
  const mapEmbedUrl = mapQuery ? `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : ''
  const organizerName = getAuthorDisplayName(
    { ...organizer, full_name: organizer?.full_name || event?.organizer },
    'Event organizer',
  )
  const eventStatus = event ? getEventStatus(event) : ''
  const eventRouteBase = backHref.startsWith('/info/user') ? '/info/user/events' : '/info/visitor/events'
  const profileHref = userId ? `/info/user/profile/${encodeURIComponent(userId)}` : '/info/login'
  const parsedParticipantCount = event?.current_attendees == null || event.current_attendees === ''
    ? undefined
    : Number(event.current_attendees)
  const participantCount = Number.isFinite(parsedParticipantCount) && parsedParticipantCount >= 0
    ? parsedParticipantCount
    : undefined

  const goBack = () => {
    if (window.history.length > 1) router.back()
    else router.push(backHref)
  }

  const shareEvent = async () => {
    const shareData = { title: event.title, text: event.description || event.title, url: window.location.href }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url)
        setNotice('Event link copied.')
      } else {
        setNotice('Sharing is unavailable in this browser.')
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') {
        console.error('Event share failed:', shareError)
        setNotice('Could not share this event.')
      }
    }
  }

  const copyEventLink = async () => {
    setMenuOpen(false)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
      await navigator.clipboard.writeText(window.location.href)
      setNotice('Event link copied.')
    } catch (copyError) {
      console.error('Copy event link failed:', copyError)
      setNotice('Could not copy the event link.')
    }
  }

  const toggleBookmark = async () => {
    if (!userId) {
      router.push('/info/login')
      return
    }
    if (saving) return

    setSaving(true)
    setNotice('')
    try {
      const query = isSaved
        ? supabase.from('user_favorites').delete().eq('user_id', userId).eq('item_type', 'event').eq('item_id', event.id)
        : supabase.from('user_favorites').upsert(
          { user_id: userId, item_type: 'event', item_id: event.id },
          { onConflict: 'user_id,item_type,item_id' },
        )
      const { error: saveError } = await query
      if (saveError) throw saveError
      setIsSaved((saved) => !saved)
      setNotice(isSaved ? 'Removed from saved events.' : 'Event saved.')
    } catch (saveError) {
      console.error('Event bookmark update failed:', saveError)
      setNotice('Could not update your saved events. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const toggleOrganizerFollow = async () => {
    if (!organizer?.id || organizerFollowLoading) return
    if (!userId) {
      router.push('/info/login')
      return
    }

    setOrganizerFollowLoading(true)
    setNotice('')
    try {
      const response = await fetch(`/info/api/users/${encodeURIComponent(organizer.id)}/follow`, {
        method: isFollowingOrganizer || organizerFollowPending ? 'DELETE' : 'POST',
        credentials: 'same-origin',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update organizer follow status.')
      setIsFollowingOrganizer(Boolean(result.is_following))
      setOrganizerFollowPending(Boolean(result.follow_request_pending))
    } catch (followError) {
      console.error('Event organizer follow update failed:', followError)
      setNotice(followError instanceof Error ? followError.message : 'Unable to update organizer follow status.')
    } finally {
      setOrganizerFollowLoading(false)
    }
  }

  const refreshEngagementCounts = async () => {
    const [reactionsResult, commentsResult, repostsResult] = await Promise.all([
      supabase.from('content_reactions').select('reaction_type').eq('content_type', 'event').eq('content_id', event.id),
      supabase.from('content_comments').select('id', { count: 'exact', head: true }).eq('content_type', 'event').eq('content_id', event.id).eq('status', 'active'),
    ])
    if (reactionsResult.error) throw reactionsResult.error
    if (commentsResult.error) throw commentsResult.error
    setLikeCount((reactionsResult.data || []).filter((item) => item.reaction_type !== 'dislike').length)
    setCommentCount(commentsResult.count || 0)
  }

  const toggleEventReaction = async (targetReaction) => {
    if (!userId) {
      router.push('/info/login')
      return
    }
    if (reactionLoading) return

    const removing = reaction === targetReaction
    setReactionLoading(true)
    setNotice('')
    try {
      const response = await fetch('/info/api/reactions', {
        method: removing ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ contentType: 'event', contentId: event.id, reactionType: targetReaction }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not update your reaction.')
      setReaction(removing ? '' : targetReaction)
      try {
        await refreshEngagementCounts()
      } catch (countError) {
        console.error('Event engagement count refresh failed:', countError)
        setNotice('Your reaction was saved, but counts could not be refreshed.')
      }
    } catch (reactionError) {
      console.error('Event reaction update failed:', reactionError)
      setNotice(reactionError.message || 'Could not update your reaction. Please try again.')
    } finally {
      setReactionLoading(false)
    }
  }

  const renderEventEngagementActions = (optionsMenuRef, compact = false) => (
    <>
      <div className="event-detail-engagement-group">
        <button type="button" onClick={() => void toggleEventReaction('love')} disabled={reactionLoading} aria-label={`${reaction === 'love' ? 'Unlike' : 'Like'} event, ${likeCount} likes`} aria-pressed={reaction === 'love'} title="Like event">
          <Heart className={reaction === 'love' ? 'fill-current text-rose-400' : ''} aria-hidden="true" /><span>{likeCount}</span>
        </button>
        <button type="button" onClick={openCommentsSheet} aria-label={`View ${commentCount} comments`} title="Comments">
          <MessageCircle aria-hidden="true" /><span>{commentCount}</span>
        </button>
        <ShareRepost
          contentType="event"
          contentId={event.id}
          userId={userId}
          originalPost={{ ...event, featured_image: image, author: { full_name: organizerName } }}
          buttonClassName="event-detail-repost-button"
        />
        <button
          type="button"
          onClick={() => void toggleBookmark()}
          disabled={saving}
          aria-label={isSaved ? 'Remove event from saved items' : 'Save event'}
          aria-pressed={isSaved}
          title={isSaved ? 'Remove from saved items' : 'Save event'}
        >
          <Bookmark className={isSaved ? 'fill-current text-blue-600' : ''} aria-hidden="true" />
        </button>
      </div>
      {!compact && <div className="event-detail-engagement-group event-detail-engagement-end">
        <button type="button" onClick={() => void toggleEventReaction('dislike')} disabled={reactionLoading} aria-label={reaction === 'dislike' ? 'Remove dislike' : 'Dislike event'} aria-pressed={reaction === 'dislike'} title="Dislike event">
          <ThumbsDown className={reaction === 'dislike' ? 'fill-current text-sky-300' : ''} aria-hidden="true" />
        </button>
        <div className="relative" ref={optionsMenuRef}>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="More event options" aria-expanded={menuOpen} title="More options">
            <MoreHorizontal aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="event-detail-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void shareEvent() }}>
                <Share2 className="h-4 w-4" aria-hidden="true" /> Share event link
              </button>
              <button type="button" role="menuitem" onClick={() => void copyEventLink()}>
                <Copy className="h-4 w-4" aria-hidden="true" /> Copy event link
              </button>
              {organizer?.id && (
                <Link href={`/info/user/profile/${organizer.id}`} role="menuitem" onClick={() => setMenuOpen(false)}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> View organizer profile
                </Link>
              )}
            </div>
          )}
        </div>
      </div>}
    </>
  )

  if (loading) {
    return (
      <main className="event-detail-page min-h-screen">
        <div className="event-detail-loading" role="status" aria-live="polite">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Loading event details…</span>
        </div>
      </main>
    )
  }

  if (error || !event) {
    return (
      <main className="event-detail-page min-h-screen">
        <div className="event-detail-error">
          <p role="alert">{error || 'This event is unavailable.'}</p>
          <button type="button" onClick={goBack} className="event-detail-back">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back to events
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="event-detail-page min-h-screen">
      <UserTopHeader detailMode spacer homeHref={backHref} />
      <div className="mx-auto max-w-[1080px] px-4 pt-2">
        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} />
      </div>
      <header className="event-detail-header">
        <div className="event-detail-header-inner">
          <button type="button" onClick={goBack} className="event-detail-back" aria-label="Go back">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="event-detail-back-label">Back</span>
          </button>
          <Link href={backHref} className="event-detail-brand">
            <img src="/logo.png" alt="" />
            <span>Connect Daet</span>
          </Link>
          <div className="event-detail-header-actions">
            <Link href={userId ? '/info/user/notifications' : '/info/login'} className="event-detail-icon-button" aria-label="Notifications" title="Notifications">
              <Bell className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href={profileHref} className="event-detail-header-avatar" aria-label={userId ? 'Open your profile' : 'Sign in'}>
              {currentUser?.profile_image_url
                ? <img src={currentUser.profile_image_url} alt="" />
                : <UserRound className="h-4 w-4" aria-hidden="true" />}
            </Link>
          </div>
        </div>
      </header>

      <article className="event-detail-content">
        {image ? (
          <div className="event-detail-cover">
            <img src={image} alt={event.title} />
          </div>
        ) : (
          <div className="event-detail-cover event-detail-cover-empty" aria-hidden="true">
            <CalendarDays className="h-12 w-12" />
          </div>
        )}

        <div className="event-detail-body">
          <div className="event-detail-overview">
            <header className="event-detail-intro">
              <div className="event-detail-kickers">
                <span>{event.category || 'Community event'}</span>
                <span className={`event-detail-status status-${eventStatus.toLowerCase()}`}>{eventStatus}</span>
              </div>
              <h1>{event.title}</h1>

              <div className="event-detail-organizer">
                <div className="event-detail-organizer-details">
                  {organizer?.id ? (
                    <Link href={`/info/user/profile/${organizer.id}`} className="event-detail-organizer-link">
                      <span className="event-detail-avatar">
                        {organizer.profile_image_url
                          ? <img src={organizer.profile_image_url} alt="" />
                          : getOrganizerInitials(organizerName)}
                      </span>
                      <span>{organizerName}</span>
                      {organizer.user_type === 'admin' && <ShieldCheck className="h-4 w-4 text-sky-400" aria-label="Verified organizer" title="Verified organizer" />}
                    </Link>
                  ) : (
                    <span className="event-detail-organizer-link">
                      <span className="event-detail-avatar">{getOrganizerInitials(organizerName)}</span>
                      <span>{organizerName}</span>
                    </span>
                  )}
                  {(event.published_at || event.created_at) && (
                    <span className="event-detail-published">
                      Published {formatDate(String(event.published_at || event.created_at).slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>
                {organizer?.id && userId !== organizer.id && (
                  <button
                    type="button"
                    className="event-detail-follow-button"
                    onClick={() => void toggleOrganizerFollow()}
                    disabled={organizerFollowLoading}
                    aria-pressed={isFollowingOrganizer}
                  >
                    {organizerFollowLoading ? 'Please wait…' : organizerFollowPending ? 'Requested' : isFollowingOrganizer ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>

              {notice && <p className="event-detail-notice" role="status">{notice}</p>}

              <div className="event-detail-facts">
                <div><CalendarDays className="h-4 w-4" aria-hidden="true" /><span>{formatEventDateRange(event.start_date, event.end_date)}{(event.start_time || event.end_time) ? ` · ${formatTime(event.start_time) || 'Time TBA'}${event.end_time ? ` – ${formatTime(event.end_time)}` : ''}` : ''}</span></div>
                {location && <div><MapPin className="h-4 w-4" aria-hidden="true" /><span>{location}</span></div>}
                {participantCount !== undefined && <div><Users className="h-4 w-4" aria-hidden="true" /><span>{participantCount} going</span></div>}
              </div>

              {event.status === 'published' && (
                <button
                  type="button"
                  onClick={() => void toggleEventRegistration()}
                  disabled={registrationLoading}
                  className="mt-4 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {registrationLoading
                    ? 'Please wait…'
                    : eventRegistration?.status === 'confirmed'
                      ? 'Cancel registration'
                      : 'Register for event'}
                </button>
              )}

              {!commentsSheetOpen && (
                <section className="event-detail-engagement event-detail-engagement-secondary" aria-label="Event interactions">
                  {renderEventEngagementActions(menuRef, true)}
                </section>
              )}
            </header>
          </div>

          {!commentsSheetOpen && (
            <section className="event-detail-engagement" aria-label="Event interactions">
              {renderEventEngagementActions(menuRef)}
            </section>
          )}

          <div className="event-detail-sections">
            {event.description && (
              <section className="event-detail-section">
                <h2>About this event</h2>
                <p>{event.description}</p>
              </section>
            )}

            <EventSections event={event} />

            {mapQuery && (
              <section className="event-detail-section">
                <h2>Location</h2>
                <div className="event-detail-map">
                  <iframe title={`Map showing ${location || event.title}`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
                <a className="event-detail-map-link" href={mapUrl} target="_blank" rel="noreferrer">
                  Open in Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </section>
            )}
          </div>
        </div>
      </article>

      <section className="event-detail-comments-entry" aria-label="Event comments">
        <button
          ref={commentsTriggerRef}
          type="button"
          className="event-detail-comments-link"
          onClick={openCommentsSheet}
        >
          View all {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
        </button>
      </section>

      {commentsSheetOpen && (
        <div
          className={`event-comments-backdrop${commentsSheetVisible ? ' is-visible' : ''}`}
          onClick={(clickEvent) => {
            if (clickEvent.target === clickEvent.currentTarget) closeCommentsSheet()
          }}
        >
          <div
            ref={commentsDialogRef}
            className={`event-comments-sheet${commentsSheetVisible ? ' is-visible' : ''}${commentsSheetDragging ? ' is-dragging' : ''}`}
            style={{ '--event-comments-sheet-height': `${commentsSheetHeight}dvh` }}
            role="dialog"
            aria-modal="true"
            aria-label="Event comments"
            tabIndex={-1}
          >
            <Comments
              contentType="event"
              contentId={event.id}
              userId={userId}
              contentOwnerId={event.created_by}
              contentTitle={event.title}
              sheetMode
              eventStyle
              onClose={closeCommentsSheet}
              onCommentCountChange={setCommentCount}
              onHeaderPointerDown={handleCommentsHeaderPointerDown}
              onHeaderPointerMove={handleCommentsHeaderPointerMove}
              onHeaderPointerUp={handleCommentsHeaderPointerUp}
              closeButtonRef={commentsCloseButtonRef}
            />
          </div>
        </div>
      )}

      {(relatedEvents.length > 0 || relatedError) && (
        <section className="event-detail-related" aria-labelledby="related-events-title">
          <h2 id="related-events-title">Related events</h2>
          {relatedError && <p role="alert">{relatedError}</p>}
          <div className="event-detail-related-list">
            {relatedEvents.map((related) => {
              const relatedImage = mediaUrl(related.featured_image) || mediaUrl(related.images)
              return (
                <Link key={related.id} href={`${eventRouteBase}/${related.id}`} className="event-detail-related-item">
                  {relatedImage ? <img src={relatedImage} alt="" /> : <span className="event-detail-related-placeholder"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span>}
                  <span className="event-detail-related-copy">
                    <span className="event-detail-related-category">{related.category || 'Community event'}</span>
                    <strong>{related.title}</strong>
                    <span>{formatDate(related.start_date, { month: 'short', day: 'numeric', year: 'numeric' })}{related.start_time ? ` · ${formatTime(related.start_time)}` : ''}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

    </main>
  )
}
