'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bookmark,
  Bell,
  CalendarDays,
  Clock3,
  Copy,
  ExternalLink,
  Globe2,
  Heart,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Share2,
  ShieldCheck,
  Smile,
  ThumbsDown,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { getCache, getCacheKey, invalidateCache, setCache } from '@/lib/cache'
import Comments from './Comments'
import UserTopHeader from './UserTopHeader'

const EVENT_DETAIL_CACHE_TTL_MS = 2 * 60 * 1000
const SHARE_EMOJIS = ['😀', '😂', '😍', '🥳', '👏', '❤️', '📍', '🎉']

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
  const [organizer, setOrganizer] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [relatedEvents, setRelatedEvents] = useState([])
  const [relatedError, setRelatedError] = useState('')
  const [userId, setUserId] = useState(initialUserId)
  const [isSaved, setIsSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reaction, setReaction] = useState('')
  const [likeCount, setLikeCount] = useState(0)
  const [commentCount, setCommentCount] = useState(0)
  const [repostCount, setRepostCount] = useState(0)
  const [reposted, setReposted] = useState(false)
  const [reactionLoading, setReactionLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareText, setShareText] = useState('')
  const [shareVisibility, setShareVisibility] = useState('public')
  const [shareError, setShareError] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const menuRef = useRef(null)
  const secondaryMenuRef = useRef(null)
  const [engagementBarVisible, setEngagementBarVisible] = useState(true)
  const previousScrollYRef = useRef(0)
  const programmaticScrollRef = useRef(false)
  const programmaticScrollTimerRef = useRef(null)

  useEffect(() => {
    previousScrollYRef.current = window.scrollY

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const scrollDelta = currentScrollY - previousScrollYRef.current
      previousScrollYRef.current = currentScrollY

      if (programmaticScrollRef.current) return
      if (currentScrollY <= 24) {
        setEngagementBarVisible(true)
      } else if (scrollDelta > 4) {
        setEngagementBarVisible(false)
      } else if (scrollDelta < -4) {
        setEngagementBarVisible(true)
      }
    }

    const finishProgrammaticScroll = () => {
      programmaticScrollRef.current = false
      if (programmaticScrollTimerRef.current) {
        window.clearTimeout(programmaticScrollTimerRef.current)
        programmaticScrollTimerRef.current = null
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('scrollend', finishProgrammaticScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('scrollend', finishProgrammaticScroll)
      if (programmaticScrollTimerRef.current) window.clearTimeout(programmaticScrollTimerRef.current)
    }
  }, [])

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
    if (!eventId) return undefined

    let active = true
    const cacheKey = getCacheKey('event', 'public', 'detail', eventId)
    const cached = getCache(cacheKey, { allowStale: true })?.data

    const loadEvent = async () => {
      await Promise.resolve()
      if (!active) return
      if (cached?.event) {
        setEvent(cached.event)
        setOrganizer(cached.organizer || null)
        setRelatedEvents(cached.relatedEvents || [])
        setLoading(false)
      }

      const { data, error: eventError } = await supabase
        .from('info_events')
        .select('id, title, description, location, venue, latitude, longitude, start_date, end_date, start_time, end_time, category, organizer, current_attendees, featured_image, images, videos, status, published_at, created_by, created_at')
        .eq('id', eventId)
        .in('status', ['published', 'cancelled', 'completed'])
        .maybeSingle()

      if (!active) return
      if (eventError) {
        console.error('Event detail load failed:', eventError)
        if (cached?.event) {
          setNotice('Showing the last available event details. Refresh to try again.')
          return
        }
        setError('We could not load this event. Please try again.')
        setLoading(false)
        return
      }
      if (!data) {
        invalidateCache(cacheKey)
        setError('This event is unavailable or has not been published.')
        setLoading(false)
        return
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
      const relatedItems = relatedResult.error && cached?.relatedEvents
        ? cached.relatedEvents
        : relatedResult.data || []
      const related = [...relatedItems].sort((a, b) => {
        const aCategory = a.category === data.category ? 0 : 1
        const bCategory = b.category === data.category ? 0 : 1
        return aCategory - bCategory
      }).slice(0, 3)
      const detail = { event: data, organizer: profileResult.data || null, relatedEvents: related }
      setEvent(detail.event)
      setOrganizer(detail.organizer)
      setRelatedEvents(detail.relatedEvents)
      setCache(cacheKey, detail, EVENT_DETAIL_CACHE_TTL_MS)
      setLoading(false)
    }

    void loadEvent().catch((loadError) => {
      if (!active) return
      console.error('Event detail fetch failed:', loadError)
      if (cached?.event) {
        setNotice('Showing the last available event details. Refresh to try again.')
      } else {
        setError('We could not load this event. Please try again.')
      }
      setLoading(false)
    })

    return () => { active = false }
  }, [eventId])

  useEffect(() => {
    if (!eventId) return undefined

    let active = true
    const loadEngagement = async () => {
      const [reactionResult, commentResult, repostResult, ownRepostResult] = await Promise.all([
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
        supabase
          .from('reposts')
          .select('id', { count: 'exact', head: true })
          .eq('original_content_type', 'event')
          .eq('original_content_id', eventId)
          .eq('status', 'active'),
        userId
          ? supabase
            .from('reposts')
            .select('id, status')
            .eq('user_id', userId)
            .eq('original_content_type', 'event')
            .eq('original_content_id', eventId)
            .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
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
      if (repostResult.error) console.error('Event repost count load failed:', repostResult.error)
      else setRepostCount(repostResult.count || 0)
      if (ownRepostResult.error) console.error('Event repost status load failed:', ownRepostResult.error)
      else setReposted(Boolean(ownRepostResult.data && ownRepostResult.data.status !== 'archived'))
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reposts', filter: `original_content_id=eq.${eventId}` }, refreshEngagement)
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [eventId, userId])

  useEffect(() => {
    if (!shareOpen) return undefined
    const closeOnEscape = (keyEvent) => {
      if (keyEvent.key === 'Escape') setShareOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [shareOpen])

  useEffect(() => {
    if (!menuOpen) return undefined
    const closeOnOutsideClick = (clickEvent) => {
      if (
        !menuRef.current?.contains(clickEvent.target)
        && !secondaryMenuRef.current?.contains(clickEvent.target)
      ) setMenuOpen(false)
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
  const organizerName = organizer?.full_name || event?.organizer || 'Event organizer'
  const eventStatus = event ? getEventStatus(event) : ''
  const eventRouteBase = backHref.startsWith('/info/user') ? '/info/user/events' : '/info/visitor/events'
  const profileHref = userId ? `/info/user/profile/${encodeURIComponent(userId)}` : '/info/login'
  const participantCount = event?.current_attendees == null || event.current_attendees === ''
    ? undefined
    : Number(event.current_attendees)

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

  const refreshEngagementCounts = async () => {
    const [reactionsResult, commentsResult, repostsResult] = await Promise.all([
      supabase.from('content_reactions').select('reaction_type').eq('content_type', 'event').eq('content_id', event.id),
      supabase.from('content_comments').select('id', { count: 'exact', head: true }).eq('content_type', 'event').eq('content_id', event.id).eq('status', 'active'),
      supabase.from('reposts').select('id', { count: 'exact', head: true }).eq('original_content_type', 'event').eq('original_content_id', event.id).eq('status', 'active'),
    ])
    if (reactionsResult.error) throw reactionsResult.error
    if (commentsResult.error) throw commentsResult.error
    if (repostsResult.error) throw repostsResult.error
    setLikeCount((reactionsResult.data || []).filter((item) => item.reaction_type !== 'dislike').length)
    setCommentCount(commentsResult.count || 0)
    setRepostCount(repostsResult.count || 0)
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

  const publishEventRepost = async () => {
    if (!userId) {
      router.push('/info/login')
      return
    }
    if (shareLoading || reposted) return

    setShareLoading(true)
    setShareError('')
    try {
      const response = await fetch('/info/api/reposts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          contentType: 'event',
          contentId: event.id,
          quoteText: shareText.trim() || null,
          visibility: shareVisibility,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to share this event.')

      setReposted(true)
      setShareOpen(false)
      setShareText('')
      setShowEmojiPicker(false)
      if (result.alreadyReposted) {
        setNotice('You have already shared this event.')
      } else {
        window.dispatchEvent(new CustomEvent('daet-repost-created', {
          detail: {
            action: 'created',
            repost: result.repost,
            reposter: result.reposter || currentUser,
            original: result.original || event,
            contentType: 'event',
            contentId: event.id,
            userId,
          },
        }))
        setNotice('Event shared to your community feed.')
        try {
          await refreshEngagementCounts()
        } catch (countError) {
          console.error('Event repost count refresh failed:', countError)
        }
      }
    } catch (repostError) {
      console.error('Event repost failed:', repostError)
      setShareError(repostError.message || 'Unable to share this event. Please try again.')
    } finally {
      setShareLoading(false)
    }
  }

  const focusComments = () => {
    setEngagementBarVisible(true)
    programmaticScrollRef.current = true
    if (programmaticScrollTimerRef.current) window.clearTimeout(programmaticScrollTimerRef.current)
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false
      programmaticScrollTimerRef.current = null
    }, 1200)
    document.getElementById('event-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const renderEventEngagementActions = (optionsMenuRef) => (
    <>
      <div className="event-detail-engagement-group">
        <button type="button" onClick={() => void toggleEventReaction('love')} disabled={reactionLoading} aria-label={`${reaction === 'love' ? 'Unlike' : 'Like'} event, ${likeCount} likes`} aria-pressed={reaction === 'love'} title="Like event">
          <Heart className={reaction === 'love' ? 'fill-current text-rose-400' : ''} aria-hidden="true" /><span>{likeCount}</span>
        </button>
        <button type="button" onClick={focusComments} aria-label={`View ${commentCount} comments`} title="Comments">
          <MessageCircle aria-hidden="true" /><span>{commentCount}</span>
        </button>
        <button type="button" onClick={() => userId ? setShareOpen(true) : router.push('/info/login')} aria-label={reposted ? `Event already shared, ${repostCount} shares` : `Share event to your feed, ${repostCount} shares`} title="Share to feed">
          <Repeat2 aria-hidden="true" /><span>{repostCount}</span>
        </button>
        <button type="button" onClick={() => void toggleBookmark()} disabled={saving} aria-label={isSaved ? 'Remove event from saved' : 'Save event'} aria-pressed={isSaved} title={isSaved ? 'Remove from saved events' : 'Save event'}>
          {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Bookmark className={isSaved ? 'fill-current text-sky-300' : ''} aria-hidden="true" />}
        </button>
      </div>
      <div className="event-detail-engagement-group event-detail-engagement-end">
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
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" role="menuitem" onClick={() => setMenuOpen(false)}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open location in Maps
                </a>
              )}
              {organizer?.id && (
                <Link href={`/info/user/profile/${organizer.id}`} role="menuitem" onClick={() => setMenuOpen(false)}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> View organizer profile
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
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
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to events
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="event-detail-page min-h-screen">
      <UserTopHeader detailMode spacer homeHref={backHref} />
      <header className="event-detail-header">
        <div className="event-detail-header-inner">
          <button type="button" onClick={goBack} className="event-detail-back" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="event-detail-back-label">Back</span>
          </button>
          <Link href={backHref} className="event-detail-brand">
            <img src="/logo.png" alt="" />
            <span>Connect-Daet.ai</span>
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
        <div className="event-detail-body">
          <header className="event-detail-intro">
            <div className="event-detail-kickers">
              <span>{event.category || 'Community event'}</span>
              <span className={`event-detail-status status-${eventStatus.toLowerCase()}`}>{eventStatus}</span>
            </div>
            <h1>{event.title}</h1>
            {event.description && <p className="event-detail-deck">{event.description.slice(0, 220)}{event.description.length > 220 ? '…' : ''}</p>}

            <div className="event-detail-organizer">
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
                  <span className="event-detail-avatar">
                    {organizer?.profile_image_url
                      ? <img src={organizer.profile_image_url} alt="" />
                      : getOrganizerInitials(organizerName)}
                  </span>
                  <span>{organizerName}</span>
                </span>
              )}
            </div>

            {notice && <p className="event-detail-notice" role="status">{notice}</p>}

            <div className="event-detail-facts">
            <div><CalendarDays className="h-4 w-4" aria-hidden="true" /><span>{formatDate(event.start_date)}{event.end_date && event.end_date !== event.start_date ? ` – ${formatDate(event.end_date, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</span></div>
            {(event.start_time || event.end_time) && (
              <div><Clock3 className="h-4 w-4" aria-hidden="true" /><span>{formatTime(event.start_time) || 'Time TBA'}{event.end_time ? ` – ${formatTime(event.end_time)}` : ''}</span></div>
            )}
            {location && <div><MapPin className="h-4 w-4" aria-hidden="true" /><span>{location}</span></div>}
            {(event.published_at || event.created_at) && (
              <div><CalendarDays className="h-4 w-4" aria-hidden="true" /><span>Published {formatDate(String(event.published_at || event.created_at).slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
            )}
            {participantCount !== undefined && <div><Users className="h-4 w-4" aria-hidden="true" /><span>{participantCount} {participantCount === 1 ? 'participant' : 'participants'}</span></div>}
            </div>
          </header>

          <section className={`event-detail-engagement${engagementBarVisible ? '' : ' is-scroll-hidden'}`} aria-label="Event interactions">
            {renderEventEngagementActions(menuRef)}
          </section>

          {image ? (
            <div className="event-detail-cover">
              <img src={image} alt={event.title} />
            </div>
          ) : (
            <div className="event-detail-cover event-detail-cover-empty" aria-hidden="true">
              <CalendarDays className="h-12 w-12" />
            </div>
          )}

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
              <p className="event-detail-location-label">{location || mapQuery}</p>
              <div className="event-detail-map">
                <iframe title={`Map showing ${location || event.title}`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
              <a className="event-detail-map-link" href={mapUrl} target="_blank" rel="noreferrer">
                Open in Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </section>
          )}
        </div>
      </article>

      <section id="event-comments" className="event-detail-comments" aria-label="Event comments">
        <Comments
          contentType="event"
          contentId={event.id}
          userId={userId}
          contentOwnerId={event.created_by}
          contentTitle={event.title}
          articleStyle
          eventStyle
        />
      </section>

      <section className="event-detail-engagement event-detail-engagement-secondary" aria-label="More event interactions">
        {renderEventEngagementActions(secondaryMenuRef)}
      </section>

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

      {shareOpen && (
        <div className="event-share-backdrop" role="presentation" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) setShareOpen(false) }}>
          <section className="event-share-dialog" role="dialog" aria-modal="true" aria-labelledby="event-share-title">
            <div className="event-share-heading">
              <h2 id="event-share-title">Share this event</h2>
              <button type="button" onClick={() => setShareOpen(false)} aria-label="Close share composer"><X aria-hidden="true" /></button>
            </div>
            <div className="event-share-identity">
              <span className="event-share-avatar">
                {currentUser?.profile_image_url ? <img src={currentUser.profile_image_url} alt="" /> : <UserRound aria-hidden="true" />}
              </span>
              <strong>{currentUser?.full_name || 'You'}</strong>
            </div>
            <textarea
              value={shareText}
              onChange={(changeEvent) => setShareText(changeEvent.target.value)}
              placeholder="Write something about this event..."
              rows={3}
              maxLength={2000}
              aria-label="Write something about this event"
            />
            <div className="event-share-toolbar">
              <button type="button" onClick={() => setShowEmojiPicker((shown) => !shown)} aria-expanded={showEmojiPicker} aria-label="Open emoji picker">
                <Smile aria-hidden="true" /> Add emoji
              </button>
              <span>Audience</span>
            </div>
            <div className="event-share-audiences" role="group" aria-label="Choose who can see this post">
              {[
                { value: 'public', label: 'Public', Icon: Globe2 },
                { value: 'followers', label: 'Followers', Icon: Users },
                { value: 'private', label: 'Only me', Icon: LockKeyhole },
              ].map(({ value, label, Icon }) => (
                <button key={value} type="button" onClick={() => setShareVisibility(value)} aria-pressed={shareVisibility === value}>
                  <Icon aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            {showEmojiPicker && (
              <div className="event-share-emojis" aria-label="Choose an emoji">
                {SHARE_EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => setShareText((text) => `${text}${emoji}`)} aria-label={`Add ${emoji}`}>{emoji}</button>
                ))}
              </div>
            )}
            <article className="event-share-preview">
              {image && <img src={image} alt="" />}
              <div>
                <span>{event.category || 'Community event'}</span>
                <strong>{event.title}</strong>
                {event.description && <p>{event.description}</p>}
                <small>Originally shared by {organizerName}</small>
              </div>
            </article>
            {reposted && <p className="event-share-error" role="status">You have already shared this event.</p>}
            {shareError && <p className="event-share-error" role="alert">{shareError}</p>}
            <div className="event-share-actions">
              <button type="button" onClick={() => setShareOpen(false)}>Cancel</button>
              <button type="button" onClick={() => void publishEventRepost()} disabled={shareLoading || reposted}>
                {shareLoading ? 'Sharing...' : reposted ? 'Already shared' : 'Share Post'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
