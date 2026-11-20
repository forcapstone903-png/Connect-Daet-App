'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { loginUrlFor } from '@/lib/loginPrompt'
import VisitorBackButton from '@/app/(subsystems)/info/components/visitor/VisitorBackButton'
import {
  Bookmark,
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Heart,
  LoaderCircle,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Share2,
  Star,
  X,
} from 'lucide-react'
import { getListingTypeLabel } from '@/lib/listings.mjs'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import { getCache, getCacheKey, setCache } from '@/lib/cache'
import { getAuthorDisplayName } from '@/lib/userSocialDisplay'
import RatingsReviews from '@/app/(subsystems)/info/components/user/RatingsReviews'
import { trackUserActivity } from '@/lib/trackActivity'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

const DETAIL_CACHE_TTL_MS = 2 * 60 * 1000

function mediaUrl(value) {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    return String(value.url || value.image_url || value.src || '').trim()
  }
  return ''
}

function mediaItems(...values) {
  return [...new Set(values.flatMap((value) => {
    if (Array.isArray(value)) return value.map(mediaUrl).filter(Boolean)
    const url = mediaUrl(value)
    return url ? [url] : []
  }))]
}

function optionalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getAddress(spot) {
  return [spot.address, spot.location, spot.city, spot.province, spot.country]
    .map((part) => typeof part === 'string' ? part.trim() : '')
    .filter(Boolean)
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(', ')
}

function getInitials(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'D'
}

export default function TouristSpotDetailPage() {
  const params = useParams()
  const router = useRouter()
  const spotId = params?.id
  const menuRef = useRef(null)
  const refreshSpotRef = useRef(null)
  const [spot, setSpot] = useState(null)
  const [spotAuthor, setSpotAuthor] = useState(null)
  const [relatedSpots, setRelatedSpots] = useState([])
  const [userId, setUserId] = useState('')
  const [isSaved, setIsSaved] = useState(false)
  const [reaction, setReaction] = useState('')
  const [likeCount, setLikeCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [aboutExpanded, setAboutExpanded] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [singleLightbox, setSingleLightbox] = useState(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const realtime = useRealtimeRefresh({
    channelName: `tourist-spot-detail-${spotId || 'unknown'}`,
    tables: [{ table: 'info_tourist_spots', filter: `id=eq.${spotId}` }],
    enabled: Boolean(spotId),
  })
  const { setRefreshCallback } = realtime

  useEffect(() => {
    if (!userId) return undefined
    let active = true
    void fetch('/info/api/notifications?count_only=true', {
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(async (notificationResponse) => {
      if (notificationResponse.status === 401) return
      if (!notificationResponse.ok) return
      await notificationResponse.json()
    }).catch((error) => {
      console.error('Tourist spot notification count failed:', error)
    })
    return () => {
      active = false
    }
  }, [userId])

  const verifyViewerSession = async () => {
    const appSession = getStoredSessionObject()
    const appUserId = appSession?.logged_in ? appSession.user_id : ''
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    const authUserId = sessionData?.session?.user?.id || ''
    return appUserId && appUserId === authUserId && appUserId === userId ? appUserId : ''
  }

  const loadEngagement = useCallback(async (id, currentUserId) => {
    const reactions = await supabase.from('content_reactions')
      .select('user_id, reaction_type')
      .eq('content_type', 'tourist_spot')
      .eq('content_id', id)
    if (reactions.error) throw reactions.error
    const rows = reactions.data || []
    setLikeCount(rows.filter((item) => item.reaction_type !== 'dislike').length)
    setReaction(rows.find((item) => item.user_id === currentUserId)?.reaction_type || '')
  }, [])

  useEffect(() => {
    if (!spotId) return undefined
    let active = true
    const load = async (silent = false) => {
      let hasCachedDetails = false
      let hasDestinationData = false
      const cacheKey = getCacheKey('tourist-spot-detail', 'public', spotId)
      const cached = getCache(cacheKey, { allowStale: true })?.data
      if (!silent && cached && active) {
        hasCachedDetails = true
        hasDestinationData = true
        setSpot(cached.spot)
        setRelatedSpots(cached.relatedSpots || [])
        setLoading(false)
      }
      try {
        const sessionResult = await supabase.auth.getSession()
        const appSession = getStoredSessionObject()
        const appUserId = appSession?.logged_in ? appSession.user_id : ''
        const authUserId = sessionResult.data?.session?.user?.id || ''
        const currentUserId = appUserId && appUserId === authUserId ? appUserId : ''
        if (active) setUserId(currentUserId || '')

        const { data, error: spotError } = await supabase
          .from('info_tourist_spots')
          .select('*')
          .eq('id', spotId)
          .maybeSingle()
        if (spotError) throw spotError
        if (!data) {
          if (active) {
            setSpot(null)
            setRelatedSpots([])
            setError('Destination not found or unavailable.')
          }
          return true
        }
        if (!active) return
        hasDestinationData = true
        setSpot(data)

        const [authorResult, authorProfileResult, relatedResult] = await Promise.all([
          data.created_by
            ? supabase.from('info_users')
              .select('id, full_name, profile_image_url, user_type')
              .eq('id', data.created_by)
              .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          data.created_by
            ? supabase.from('profiles')
              .select('full_name, profile_image_url')
              .eq('user_id', data.created_by)
              .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          data.category
            ? supabase
              .from('info_tourist_spots')
              .select('id, name, location, featured_image, images, gallery_images, rating')
              .eq('status', 'active')
              .eq('listing_type', data.listing_type || 'attraction')
              .eq('category', data.category)
              .neq('id', spotId)
              .order('rating', { ascending: false })
              .limit(4)
            : Promise.resolve({ data: [], error: null }),
        ])
        if (authorResult.error) {
          console.error('Tourist spot author profile load failed:', authorResult.error)
        } else if (active) {
          if (authorProfileResult.error) {
            console.error('Tourist spot author display profile load failed:', authorProfileResult.error)
          }
          setSpotAuthor({
            ...authorResult.data,
            full_name: authorResult.data?.full_name?.trim() || authorProfileResult.data?.full_name?.trim(),
            profile_image_url: authorProfileResult.data?.profile_image_url || authorResult.data?.profile_image_url,
          })
        }
        if (relatedResult.error) throw relatedResult.error
        const related = relatedResult.data || []
        if (!active) return
        setRelatedSpots(related)
        setActionError('')
        setCache(cacheKey, { spot: data, relatedSpots: related }, DETAIL_CACHE_TTL_MS)
        if (currentUserId) {
          const favoriteResult = await supabase.from('user_favorites')
            .select('id')
            .eq('user_id', currentUserId)
            .eq('item_type', 'spot')
            .eq('item_id', spotId)
            .maybeSingle()
          if (favoriteResult.error) throw favoriteResult.error
          if (active) setIsSaved(Boolean(favoriteResult.data))
        }
        await loadEngagement(spotId, currentUserId)
        return true
      } catch (loadError) {
        console.error('Tourist spot details failed to load:', loadError)
        if (active && hasDestinationData) {
          setActionError(hasCachedDetails
            ? 'Could not refresh all destination details. Showing the most recently saved information.'
            : 'Some destination information could not be loaded. Please try again.')
        } else if (active) {
          setError(loadError.message || 'Destination details could not be loaded.')
        }
        return false
      } finally {
        if (active) setLoading(false)
      }
    }
    refreshSpotRef.current = () => load(true)
    setRefreshCallback(() => refreshSpotRef.current?.() ?? false)
    void load()
    return () => {
      active = false
      refreshSpotRef.current = null
    }
  }, [spotId, loadEngagement, setRefreshCallback])

  useEffect(() => {
    if (!moreOpen) return undefined
    const close = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moreOpen])

  useEffect(() => {
    if (!spotId) return undefined
    const refresh = () => { void loadEngagement(spotId, userId).catch((refreshError) => console.error('Tourist spot engagement refresh failed:', refreshError)) }
    const channel = supabase.channel(`tourist-spot-engagement-${spotId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reactions', filter: `content_type=eq.tourist_spot` }, (event) => {
        const row = event.new || event.old
        if (row?.content_id === spotId) refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [spotId, userId, loadEngagement])

  const images = useMemo(() => spot
    ? mediaItems(spot.featured_image, spot.gallery_images, spot.images)
    : [], [spot])
  const address = spot ? getAddress(spot) : ''
  // The column is entry_fee; entrance_fee is the older API alias.
  const entranceFee = spot ? optionalNumber(spot.entrance_fee ?? spot.entry_fee) : null
  const contactLinks = spot ? [
    spot.contact_number && { href: `tel:${String(spot.contact_number).replace(/[^\d+]/g, '')}`, label: spot.contact_number, icon: Phone },
    spot.email && { href: `mailto:${spot.email}`, label: spot.email, icon: Mail },
    spot.website && /^https?:\/\//i.test(spot.website) && { href: spot.website, label: 'Website', icon: Globe, external: true },
    spot.facebook_url && /^https?:\/\//i.test(spot.facebook_url) && { href: spot.facebook_url, label: 'Facebook page', icon: ExternalLink, external: true },
  ].filter(Boolean) : []
  const latitude = spot ? optionalNumber(spot.latitude) : null
  const longitude = spot ? optionalNumber(spot.longitude) : null
  const hasCoordinates = latitude !== null && longitude !== null
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  const mapDestination = hasCoordinates ? `${latitude},${longitude}` : address
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapDestination)}`
  const mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapDestination)}&output=embed`

  const toggleFavorite = async () => {
    if (!userId) {
      router.push(loginUrlFor('Create a free account or sign in to save places to your trip.'))
      return
    }
    setBusy(true)
    setActionError('')
    try {
      const verifiedUserId = await verifyViewerSession()
      if (!verifiedUserId) {
        setUserId('')
        setIsSaved(false)
        setReaction('')
        return
      }
      const result = isSaved
        ? await supabase.from('user_favorites').delete()
          .eq('user_id', verifiedUserId).eq('item_type', 'spot').eq('item_id', spotId)
        : await supabase.from('user_favorites').upsert({
          user_id: verifiedUserId, item_type: 'spot', item_id: spotId,
        }, { onConflict: 'user_id,item_type,item_id' })
      if (result.error) throw result.error
      setIsSaved(!isSaved)
      if (!isSaved) {
        void trackUserActivity({
          userId: verifiedUserId, activityType: 'save_content', entityType: 'tourist_spot', entityId: spotId,
          description: `Saved ${spot.name}`, metadata: { contentTitle: spot.name },
        })
      }
    } catch (saveError) {
      console.error('Tourist spot bookmark failed:', saveError)
      setActionError('Your bookmark could not be updated. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const toggleReaction = async (target) => {
    if (!userId) {
      router.push(loginUrlFor('Sign in to react to places.'))
      return
    }
    const next = reaction === target ? '' : target
    setBusy(true)
    setActionError('')
    try {
      const verifiedUserId = await verifyViewerSession()
      if (!verifiedUserId) {
        setUserId('')
        setIsSaved(false)
        setReaction('')
        return
      }
      const response = await fetch('/info/api/reactions', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ contentType: 'tourist_spot', contentId: spotId, reactionType: target }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Your reaction could not be saved.')
      setReaction(next)
      setLikeCount((count) => count + (next === 'dislike' ? 0 : 1) - (reaction && reaction !== 'dislike' ? 1 : 0))
    } catch (reactionError) {
      console.error('Tourist spot reaction failed:', reactionError)
      setActionError(reactionError.message || 'Your reaction could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const openShareComposer = () => {
    setShareMessage('')
    setShareOpen(true)
  }

  const shareToFacebook = () => {
    const url = window.location.href
    const quote = [shareMessage.trim(), spot.name, url].filter(Boolean).join('\n\n')
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(quote)}`,
      '_blank',
      'noopener,noreferrer,width=640,height=600',
    )
    setShareOpen(false)
    if (userId) void trackUserActivity({
      userId, activityType: 'share_content', entityType: 'tourist_spot', entityId: spotId,
      description: `Shared ${spot.name}`, metadata: { contentTitle: spot.name, platform: 'facebook' },
    })
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setMoreOpen(false)
      setActionError('')
    } catch (copyError) {
      console.error('Tourist spot link copy failed:', copyError)
      setActionError('The link could not be copied in this browser.')
    }
  }

  const scrollToRatings = () => document.getElementById('ratings-reviews')?.scrollIntoView({ behavior: 'smooth' })
  const openReviewPhoto = (url, alt) => setSingleLightbox({ url, alt })
  const moveLightbox = useCallback((direction) => {
    setLightboxIndex((index) => (index + direction + images.length) % images.length)
  }, [images.length])

  useEffect(() => {
    if (lightboxIndex === null && !singleLightbox) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setLightboxIndex(null)
        setSingleLightbox(null)
      }
      if (lightboxIndex !== null && event.key === 'ArrowLeft') moveLightbox(-1)
      if (lightboxIndex !== null && event.key === 'ArrowRight') moveLightbox(1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [lightboxIndex, moveLightbox, singleLightbox])

  if (loading) {
    return <main className="event-detail-page tourist-detail-page"><div className="tourist-detail-loading"><LoaderCircle className="animate-spin" />Loading destination…</div></main>
  }
  if (error || !spot) {
    return <main className="event-detail-page tourist-detail-page"><div className="tourist-detail-error"><p>{error || 'Destination not found.'}</p><VisitorBackButton fallbackHref="/info/visitor/tourist-spots" /></div></main>
  }

  const heroImage = images[0]
  const description = String(spot.description || spot.about || '').trim()
  const spotAuthorName = spotAuthor ? getAuthorDisplayName(spotAuthor, 'Daet Tourism Admin') : ''
  const showDescriptionToggle = description.length > 420

  return (
    <>
      <main className="event-detail-page tourist-detail-page min-h-screen !bg-[#F8FAFC] pb-28 text-slate-900 md:pb-10">
        <div className="tourist-detail-content">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="pb-3 pt-1">
            <div className="mb-3">
              <VisitorBackButton className="tourist-home-back" fallbackHref="/info/visitor/tourist-spots" />
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">{getListingTypeLabel(spot.listing_type)}</span>
              {spot.category && <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">{spot.category}</span>}
              {(spot.is_popular || spot.is_featured) && <span className="tourist-popular-badge">Popular destination</span>}
            </div>
            <h1 className="mt-2 break-words text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-3xl">{spot.name}</h1>
            {description && <p className="mt-2 max-w-3xl text-sm leading-5 text-slate-600 sm:text-base">{description.slice(0, 220)}{description.length > 220 ? '…' : ''}</p>}
            {(address || spotAuthor) && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {address && <p className="flex items-center gap-1.5 text-xs font-medium text-blue-700"><MapPin size={14} aria-hidden="true" />{address}</p>}
              {spotAuthor && <Link href={`/info/user/profile/${spotAuthor.id}`} className="inline-flex min-h-8 items-center gap-1.5 text-xs text-slate-500 transition hover:text-blue-700">
                {spotAuthor.profile_image_url
                  ? <img src={spotAuthor.profile_image_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                  : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700">{getInitials(spotAuthorName)}</span>}
                <span>Posted by <strong className="font-semibold text-slate-700">{spotAuthorName}</strong></span>
              </Link>}
            </div>}
          </div>

          {userId && (
            <nav className="mt-1 flex min-h-12 items-center justify-between gap-2 border-t border-slate-200 pt-3" aria-label="Destination interactions">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => toggleReaction('like')} disabled={busy} aria-pressed={reaction === 'like'} aria-label={reaction === 'like' ? 'Unlike destination' : 'Like destination'} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">
                  <Heart size={17} className={reaction === 'like' ? 'fill-rose-500 text-rose-500' : ''} /><span>{likeCount} Like</span>
                </button>
                <button type="button" onClick={scrollToComments} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"><MessageCircle size={17} /><span>{commentCount} Comments</span></button>
                <button type="button" onClick={scrollToRatings} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"><Star size={15} /><span>Ratings &amp; reviews</span></button>
                <button type="button" onClick={openShareComposer} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"><Share2 size={15} /><span>Share</span></button>
              </div>
              <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={toggleFavorite} disabled={busy} aria-pressed={isSaved} aria-label={isSaved ? 'Remove bookmark' : 'Bookmark destination'} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"><Bookmark size={16} className={isSaved ? 'fill-current' : ''} /></button>
              <div className="relative" ref={menuRef}>
                <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-label="More options" aria-expanded={moreOpen} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"><MoreHorizontal size={19} /></button>
                {moreOpen && <div className="tourist-more-menu"><button type="button" onClick={copyLink}><Copy size={15} />Copy destination link</button></div>}
              </div>
              </div>
            </nav>
          )}

          <section className="tourist-hero !mt-3 !min-h-0 aspect-[16/7] overflow-hidden rounded-xl" aria-label={`${spot.name} destination`}>
            {heroImage
              ? <button type="button" onClick={() => setLightboxIndex(0)} aria-label={`Open photo of ${spot.name}`} className="absolute inset-0 h-full w-full cursor-zoom-in">
                <img className="tourist-hero-image" src={heroImage} alt={spot.name} />
                <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/60 px-3 py-1.5 text-[10px] font-semibold text-white shadow">View full photo</span>
              </button>
              : <div className="tourist-hero-placeholder"><Camera size={30} /><span>No destination photo available</span></div>}
          </section>

          <section className="mt-3 grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Destination quick information">
            {[
              spot.category && { label: 'Category', value: spot.category },
              entranceFee !== null && { label: 'Entrance fee', value: entranceFee > 0 ? `₱${entranceFee.toLocaleString('en-PH')}` : 'Free' },
              spot.opening_hours && { label: spot.listing_type === 'accommodation' ? 'Hours / check-in' : 'Opening hours', value: spot.opening_hours },
            ].filter(Boolean).map(({ label, value }, index) => (
              <div key={label} className={`min-w-0 p-3 sm:px-5 sm:py-4 ${index > 0 ? 'border-l border-slate-200' : ''}`}>
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-500 sm:text-[10px]">{label}</p>
                <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-900 sm:text-sm">{value}</p>
              </div>
            ))}
          </section>
          </div>

          {actionError && <p className="tourist-action-error" role="alert">{actionError}</p>}

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
            <div className="min-w-0 space-y-5 lg:col-span-7">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-lg font-bold text-slate-900">About This Destination</h2>
                {description
                  ? <div className="mt-3">
                    <p className={`break-words text-sm leading-7 text-slate-600 [overflow-wrap:anywhere] ${showDescriptionToggle && !aboutExpanded ? 'line-clamp-6' : ''}`}>{description}</p>
                    {showDescriptionToggle && <button type="button" onClick={() => setAboutExpanded((expanded) => !expanded)} className="mt-2 min-h-11 rounded-full px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">{aboutExpanded ? 'See less' : 'See more'}</button>}
                  </div>
                  : <p className="mt-3 text-sm text-slate-500">Destination details have not been added yet.</p>}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(spot.visit_duration || spot.duration) && <div className="rounded-xl bg-slate-50 p-3"><strong className="block text-xs font-semibold text-slate-500">Recommended visit</strong><span className="mt-1 block text-sm text-slate-800">{spot.visit_duration || spot.duration}</span></div>}
                  {spot.best_visit_time && <div className="rounded-xl bg-slate-50 p-3"><strong className="block text-xs font-semibold text-slate-500">Best time to visit</strong><span className="mt-1 block text-sm text-slate-800">{spot.best_visit_time}</span></div>}
                  {spot.price_range && <div className="rounded-xl bg-slate-50 p-3"><strong className="block text-xs font-semibold text-slate-500">Price range</strong><span className="mt-1 block text-sm text-slate-800">{spot.price_range}</span></div>}
                  {spot.barangay && <div className="rounded-xl bg-slate-50 p-3"><strong className="block text-xs font-semibold text-slate-500">Barangay</strong><span className="mt-1 block text-sm text-slate-800">{spot.barangay}</span></div>}
                  {spot.weather_average && <div className="rounded-xl bg-slate-50 p-3"><strong className="block text-xs font-semibold text-slate-500">Weather</strong><span className="mt-1 block text-sm text-slate-800">{spot.weather_average}</span></div>}
                </div>
                {spot.highlights && <div className="mt-4"><h3 className="text-sm font-bold text-slate-900">Highlights</h3><p className="mt-1 break-words text-sm leading-6 text-slate-600">{Array.isArray(spot.highlights) ? spot.highlights.join(' · ') : spot.highlights}</p></div>}
                {spot.tags?.length > 0 && <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tags">
                  {spot.tags.map((tag) => <li key={tag} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">#{tag}</li>)}
                </ul>}
              </section>

              {images.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Photos</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{images.length} {images.length === 1 ? 'photo' : 'photos'}</span></div>
                <div className="tourist-gallery">
                  {images.slice(0, 5).map((image, index) => (
                    <button type="button" key={`${image}-${index}`} onClick={() => setLightboxIndex(index)} aria-label={`Open photo ${index + 1} of ${images.length}`} className={`rounded-xl ${index === 0 ? 'is-featured' : ''}`}>
                      <img src={image} alt={`${spot.name} photo ${index + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              </section>}

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" id="tourist-location">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-lg font-bold text-slate-900">Location</h2>{address && <p className="mt-2 flex items-center gap-2 break-words text-sm text-slate-600"><MapPin size={16} className="shrink-0" />{address}</p>}</div>
                </div>
                {mapDestination ? <div className="tourist-map-wrap mt-4 overflow-hidden rounded-2xl">
                  <iframe title={`Map showing ${spot.name}`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div> : <p className="mt-3 text-sm text-slate-500">Location information is not available yet.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {mapDestination && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapDestination)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Open in Maps <ExternalLink size={14} /></a>}
                  {mapDestination && <a href={directionsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Get directions <ExternalLink size={14} /></a>}
                  {mapDestination && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapDestination)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Open in Google Maps <ExternalLink size={14} /></a>}
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="text-base font-bold text-slate-900">Contact</h3>
                  {contactLinks.length > 0 ? (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {contactLinks.map(({ href, label, icon: ContactIcon, external }) => (
                        <li key={href}>
                          <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                            <ContactIcon size={16} aria-hidden="true" className="shrink-0 text-slate-500" />
                            <span className="min-w-0 break-all">{label}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-slate-500">Contact details have not been added yet.</p>}
                  {mapDestination && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 sm:w-auto">
                    <MapPin size={16} aria-hidden="true" />Get directions
                  </a>}
                </div>
              </section>

            </div>

            <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
              <RatingsReviews key={spot.id} attractionId={spot.id} userId={userId} onOpenPhoto={openReviewPhoto} reportConfig={{ itemTable: 'attraction_ratings' }} />
              {relatedSpots.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-base font-bold text-slate-900">You might also like</h2>
                <div className="event-detail-related-list">
                  {relatedSpots.map((related) => {
                    const relatedImage = mediaItems(related.featured_image, related.gallery_images, related.images)[0]
                    return <Link key={related.id} href={`/info/visitor/tourist-spots/${related.id}`} className="event-detail-related-item">
                      {relatedImage ? <img src={relatedImage} alt="" loading="lazy" /> : <span className="event-detail-related-placeholder"><MapPin size={18} /></span>}
                      <span className="event-detail-related-copy"><strong>{related.name}</strong><span>{related.location || related.address || 'Location not provided'}</span><span className="tourist-related-rating">{optionalNumber(related.rating) === null ? 'No ratings yet' : <><Heart size={12} className="fill-rose-500 text-rose-500" /> {Number(related.rating).toFixed(1)}</>}</span></span>
                    </Link>
                  })}
                </div>
              </section>}
            </aside>
          </div>
        </div>

        {shareOpen && <div className="event-share-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareOpen(false) }}>
          <section className="event-share-dialog" role="dialog" aria-modal="true" aria-labelledby="tourist-share-title">
            <div className="event-share-header"><h2 id="tourist-share-title">Share this destination</h2><button type="button" onClick={() => setShareOpen(false)} aria-label="Close share composer"><X size={19} /></button></div>
            <p className="tourist-share-destination"><MapPin size={15} />{spot.name}{address ? ` · ${address}` : ''}</p>
            <label htmlFor="tourist-share-message">Add a message</label>
            <textarea id="tourist-share-message" value={shareMessage} onChange={(event) => setShareMessage(event.target.value)} rows={4} maxLength={500} placeholder="Share what makes this destination special…" />
            <div className="event-share-actions"><button type="button" onClick={() => setShareOpen(false)}>Cancel</button><button type="button" onClick={shareToFacebook}><Share2 size={16} />Share on Facebook</button></div>
          </section>
        </div>}

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto grid max-w-lg grid-cols-[0.8fr_0.8fr_1.4fr] gap-2">
            <button type="button" onClick={() => toggleReaction('like')} disabled={busy} aria-pressed={reaction === 'like'} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-slate-200 px-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
              <Heart size={16} className={reaction === 'like' ? 'fill-rose-500 text-rose-500' : ''} />{likeCount} Like
            </button>
            <button type="button" onClick={openShareComposer} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-slate-200 px-2 text-xs font-semibold text-slate-700">
              <Share2 size={16} />Share
            </button>
            {mapDestination && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-blue-600 px-2 text-xs font-semibold text-white">
              <MapPin size={16} />Get directions
            </a>}
          </div>
        </div>

        {lightboxIndex !== null && images.length > 0 && <div className="tourist-lightbox" role="dialog" aria-modal="true" aria-label="Destination photo viewer" onClick={() => setLightboxIndex(null)}>
          <button type="button" className="tourist-lightbox-close" onClick={() => setLightboxIndex(null)} aria-label="Close photo viewer"><X /></button>
          {images.length > 1 && <button type="button" className="tourist-lightbox-prev" onClick={(event) => { event.stopPropagation(); moveLightbox(-1) }} aria-label="Previous photo"><ChevronLeft /></button>}
          <img src={images[lightboxIndex]} alt={`${spot.name} photo ${lightboxIndex + 1}`} onClick={(event) => event.stopPropagation()} />
          {images.length > 1 && <button type="button" className="tourist-lightbox-next" onClick={(event) => { event.stopPropagation(); moveLightbox(1) }} aria-label="Next photo"><ChevronRight /></button>}
          <span>{lightboxIndex + 1} / {images.length}</span>
        </div>}
        {singleLightbox && <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 p-3 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
          onClick={() => setSingleLightbox(null)}
        >
          <button type="button" onClick={() => setSingleLightbox(null)} aria-label="Close photo preview" className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          <img
            src={singleLightbox.url}
            alt={singleLightbox.alt || ''}
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>}
      </main>
    </>
  )
}
