'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bookmark,
  Bell,
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Share2,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { getCache, getCacheKey, setCache } from '@/lib/cache'
import Comments from '@/app/(subsystems)/info/components/user/Comments'
import RatingsReviews from '@/app/(subsystems)/info/components/user/RatingsReviews'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import { trackUserActivity } from '@/lib/trackActivity'

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
  const [spot, setSpot] = useState(null)
  const [spotAuthor, setSpotAuthor] = useState(null)
  const [relatedSpots, setRelatedSpots] = useState([])
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isSaved, setIsSaved] = useState(false)
  const [reaction, setReaction] = useState('')
  const [likeCount, setLikeCount] = useState(0)
  const [commentCount, setCommentCount] = useState(0)
  const [ratingSummary, setRatingSummary] = useState({ average_rating: null, total_count: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [aboutExpanded, setAboutExpanded] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)

  const loadEngagement = useCallback(async (id, currentUserId) => {
    const [reactions, comments] = await Promise.all([
      supabase.from('content_reactions')
        .select('user_id, reaction_type')
        .eq('content_type', 'tourist_spot')
        .eq('content_id', id),
      supabase.from('content_comments')
        .select('id', { count: 'exact', head: true })
        .eq('content_type', 'tourist_spot')
        .eq('content_id', id)
        .eq('status', 'active'),
    ])
    if (reactions.error) throw reactions.error
    if (comments.error) throw comments.error
    const rows = reactions.data || []
    setLikeCount(rows.filter((item) => item.reaction_type !== 'dislike').length)
    setReaction(rows.find((item) => item.user_id === currentUserId)?.reaction_type || '')
    setCommentCount(comments.count || 0)
  }, [])

  useEffect(() => {
    if (!spotId) return undefined
    let active = true
    const load = async () => {
      let hasCachedDetails = false
      let hasDestinationData = false
      const cacheKey = getCacheKey('tourist-spot-detail', 'public', spotId)
      const cached = getCache(cacheKey, { allowStale: true })?.data
      if (cached && active) {
        hasCachedDetails = true
        hasDestinationData = true
        setSpot(cached.spot)
        setRelatedSpots(cached.relatedSpots || [])
        setLoading(false)
      }
      try {
        const [sessionResult, cookie] = await Promise.all([
          supabase.auth.getSession(),
          Promise.resolve(getAuthCookieFromDocument()),
        ])
        const currentUserId = sessionResult.data?.session?.user?.id
          || (cookie?.logged_in ? cookie.user_id : '')
        if (active) setUserId(currentUserId || '')
        if (currentUserId) {
          try {
            const profileResult = await supabase.from('profiles')
              .select('full_name, profile_image_url')
              .eq('user_id', currentUserId)
              .maybeSingle()
            if (profileResult.error) throw profileResult.error
            if (active) setProfile(profileResult.data)
          } catch (profileError) {
            console.error('Tourist spot header profile could not be loaded:', profileError)
          }
          try {
            const notificationResponse = await fetch('/info/api/notifications', { credentials: 'same-origin', cache: 'no-store' })
            if (!notificationResponse.ok) throw new Error('Notification request failed.')
            const notificationData = await notificationResponse.json()
            if (active) setUnreadCount(Number(notificationData?.unread_count || 0))
          } catch (notificationError) {
            console.error('Tourist spot notification count could not be loaded:', notificationError)
          }
        }

        const { data, error: spotError } = await supabase
          .from('info_tourist_spots')
          .select('*')
          .eq('id', spotId)
          .maybeSingle()
        if (spotError) throw spotError
        if (!data) throw new Error('Destination not found or unavailable.')
        if (!active) return
        hasDestinationData = true
        setSpot(data)

        const [authorResult, authorProfileResult, relatedResult] = await Promise.all([
          data.created_by
            ? supabase.from('info_users')
              .select('id, full_name, email, profile_image_url')
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
            full_name: authorProfileResult.data?.full_name?.trim() || authorResult.data?.full_name,
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
            .eq('item_type', 'tourist_spot')
            .eq('item_id', spotId)
            .maybeSingle()
          if (favoriteResult.error) throw favoriteResult.error
          if (active) setIsSaved(Boolean(favoriteResult.data))
        }
        await loadEngagement(spotId, currentUserId)
      } catch (loadError) {
        console.error('Tourist spot details failed to load:', loadError)
        if (active && hasDestinationData) {
          setActionError(hasCachedDetails
            ? 'Could not refresh all destination details. Showing the most recently saved information.'
            : 'Some destination information could not be loaded. Please try again.')
        } else if (active) {
          setError(loadError.message || 'Destination details could not be loaded.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [spotId, loadEngagement])

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_comments', filter: `content_type=eq.tourist_spot` }, (event) => {
        const row = event.new || event.old
        if (row?.content_id === spotId) refresh()
      })
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
  const entranceFee = spot ? optionalNumber(spot.entrance_fee) : null
  const latitude = spot ? optionalNumber(spot.latitude) : null
  const longitude = spot ? optionalNumber(spot.longitude) : null
  const hasCoordinates = latitude !== null && longitude !== null
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  const mapDestination = hasCoordinates ? `${latitude},${longitude}` : address
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapDestination)}`
  const mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapDestination)}&output=embed`

  const toggleFavorite = async () => {
    if (!userId) {
      router.push('/info/login')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      const result = isSaved
        ? await supabase.from('user_favorites').delete()
          .eq('user_id', userId).eq('item_type', 'tourist_spot').eq('item_id', spotId)
        : await supabase.from('user_favorites').upsert({
          user_id: userId, item_type: 'tourist_spot', item_id: spotId,
        }, { onConflict: 'user_id,item_type,item_id' })
      if (result.error) throw result.error
      setIsSaved(!isSaved)
      if (!isSaved) {
        void trackUserActivity({
          userId, activityType: 'save_content', entityType: 'tourist_spot', entityId: spotId,
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
      router.push('/info/login')
      return
    }
    const next = reaction === target ? '' : target
    setBusy(true)
    setActionError('')
    try {
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

  const scrollToComments = () => document.getElementById('tourist-comments')?.scrollIntoView({ behavior: 'smooth' })
  const moveLightbox = useCallback((direction) => {
    setLightboxIndex((index) => (index + direction + images.length) % images.length)
  }, [images.length])

  useEffect(() => {
    if (lightboxIndex === null) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setLightboxIndex(null)
      if (event.key === 'ArrowLeft') moveLightbox(-1)
      if (event.key === 'ArrowRight') moveLightbox(1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, moveLightbox])

  if (loading) {
    return <><UserTopHeader detailMode /><main className="event-detail-page tourist-detail-page"><div className="tourist-detail-loading"><LoaderCircle className="animate-spin" />Loading destination…</div></main></>
  }
  if (error || !spot) {
    return <><UserTopHeader detailMode /><main className="event-detail-page tourist-detail-page"><div className="tourist-detail-error"><p>{error || 'Destination not found.'}</p><Link href="/info/visitor/tourist-spots">Back to destinations</Link></div></main></>
  }

  const heroImage = images[0]
  const description = String(spot.description || spot.about || '').trim()
  const showDescriptionToggle = description.length > 420

  return (
    <>
      <div className="tourist-mobile-shell"><UserTopHeader detailMode homeHref="/info/visitor" /></div>
      <main className="event-detail-page tourist-detail-page">
        <header className="event-detail-header">
          <div className="event-detail-header-inner">
            <Link href="/info/visitor" className="event-detail-brand">
              <img src="/logo.png" alt="" /><span>Connect-Daet.ai</span>
            </Link>
            <div className="event-detail-header-actions">
              <Link href="/info/user/notifications" aria-label="Notifications" className="tourist-header-icon"><Bell size={18} />{unreadCount > 0 && <span className="tourist-unread-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}</Link>
              <Link href="/info/user/profile" aria-label="Your profile" className="event-detail-header-avatar">
                {profile?.profile_image_url ? <img src={profile.profile_image_url} alt="" /> : getInitials(profile?.full_name)}
              </Link>
            </div>
          </div>
        </header>

        <div className="tourist-detail-content">
          <section className="tourist-detail-intro">
            <Link href="/info/visitor" className="tourist-home-back">
              <ArrowLeft size={17} aria-hidden="true" />
              <span>Back to home</span>
            </Link>
            <div className="tourist-detail-kickers">
              {spot.category && <span>{spot.category}</span>}
              {(spot.is_popular || spot.is_featured) && <span className="tourist-popular-badge">Popular destination</span>}
            </div>
            <h1>{spot.name}</h1>
            {description && <p className="tourist-detail-deck">{description.slice(0, 220)}{description.length > 220 ? '…' : ''}</p>}
            {address && <p className="tourist-detail-byline"><MapPin size={16} aria-hidden="true" />{address}</p>}
            {spotAuthor?.full_name && <Link href={`/info/user/profile/${spotAuthor.id}`} className="tourist-author-byline">
              {spotAuthor.profile_image_url
                ? <img src={spotAuthor.profile_image_url} alt="" />
                : <span>{getInitials(spotAuthor.full_name)}</span>}
              <span>Posted by <strong>{spotAuthor.full_name}</strong></span>
            </Link>}
          </section>

          <nav className="event-detail-engagement tourist-engagement" aria-label="Destination interactions">
            <div className="event-detail-engagement-group">
              <a href="#ratings-reviews" className="tourist-engagement-rating" aria-label="Read ratings and reviews">
                <Heart size={16} className="fill-rose-500 text-rose-500" />
                <strong>{ratingSummary.average_rating == null ? '—' : Number(ratingSummary.average_rating).toFixed(1)}</strong>
                <span>({ratingSummary.total_count})</span>
              </a>
              <button type="button" onClick={() => toggleReaction('like')} disabled={busy} aria-pressed={reaction === 'like'}>
                <ThumbsUp size={17} /><span>{likeCount}</span><span className="tourist-action-label">Like</span>
              </button>
              <button type="button" onClick={scrollToComments}><MessageCircle size={17} /><span>{commentCount}</span><span className="tourist-action-label">Comment</span></button>
              <button type="button" onClick={openShareComposer}><Share2 size={17} /><span className="tourist-action-label">Share</span></button>
            </div>
            <div className="event-detail-engagement-group event-detail-engagement-end">
              <button type="button" onClick={() => toggleReaction('dislike')} disabled={busy} aria-pressed={reaction === 'dislike'} aria-label="Dislike destination"><ThumbsDown size={17} /></button>
              <button type="button" onClick={toggleFavorite} disabled={busy} aria-pressed={isSaved} aria-label={isSaved ? 'Remove bookmark' : 'Bookmark destination'}><Bookmark size={17} className={isSaved ? 'fill-current' : ''} /></button>
              <div className="relative" ref={menuRef}>
                <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-label="More options" aria-expanded={moreOpen}><MoreHorizontal size={19} /></button>
                {moreOpen && <div className="tourist-more-menu"><button type="button" onClick={copyLink}><Copy size={15} />Copy destination link</button></div>}
              </div>
            </div>
          </nav>

          <section className="tourist-hero" aria-label={`${spot.name} destination`}>
            {heroImage
              ? <img className="tourist-hero-image" src={heroImage} alt={spot.name} />
              : <div className="tourist-hero-placeholder"><Camera size={30} /><span>No destination photo available</span></div>}
          </section>

          {actionError && <p className="tourist-action-error" role="alert">{actionError}</p>}

          <div className="tourist-detail-columns">
            <div className="tourist-detail-primary">
              <section className="event-detail-section tourist-about-section">
                <h2>About This Destination</h2>
                {description
                  ? <div className="tourist-description">
                    <p className={showDescriptionToggle && !aboutExpanded ? 'is-clamped' : ''}>{description}</p>
                    {showDescriptionToggle && <button type="button" onClick={() => setAboutExpanded((expanded) => !expanded)}>{aboutExpanded ? 'See less' : 'See more'}</button>}
                  </div>
                  : <p className="tourist-muted">Destination details have not been added yet.</p>}
                <div className="tourist-facts">
                  {spot.category && <span><strong>Category</strong>{spot.category}</span>}
                  {(spot.visit_duration || spot.duration) && <span><strong>Recommended visit</strong>{spot.visit_duration || spot.duration}</span>}
                  {spot.best_visit_time && <span><strong>Best time to visit</strong>{spot.best_visit_time}</span>}
                  {entranceFee !== null && <span><strong>Entrance fee</strong>{entranceFee > 0 ? `₱${spot.entrance_fee}` : 'Free'}</span>}
                  {spot.opening_hours && <span><strong>Opening hours</strong>{spot.opening_hours}</span>}
                  {spot.weather_average && <span><strong>Weather</strong>{spot.weather_average}</span>}
                </div>
                {spot.highlights && <div className="tourist-highlights"><h3>Highlights</h3><p>{Array.isArray(spot.highlights) ? spot.highlights.join(' · ') : spot.highlights}</p></div>}
              </section>

              {images.length > 0 && <section className="event-detail-section tourist-gallery-section">
                <div className="tourist-section-heading"><h2>Photos</h2><span>{images.length} {images.length === 1 ? 'photo' : 'photos'}</span></div>
                <div className="tourist-gallery">
                  {images.slice(0, 5).map((image, index) => (
                    <button type="button" key={`${image}-${index}`} onClick={() => setLightboxIndex(index)} aria-label={`Open photo ${index + 1} of ${images.length}`} className={index === 0 ? 'is-featured' : ''}>
                      <img src={image} alt={`${spot.name} photo ${index + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              </section>}

              <section className="event-detail-section tourist-location-section" id="tourist-location">
                <h2>Location</h2>
                {address && <p className="tourist-location-address"><MapPin size={16} />{address}</p>}
                {mapDestination ? <div className="tourist-map-wrap">
                  <iframe title={`Map showing ${spot.name}`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div> : <p className="tourist-muted">Location information is not available yet.</p>}
                <div className="tourist-map-actions">
                  {mapDestination && <a href={directionsUrl} target="_blank" rel="noreferrer">Get directions <ExternalLink size={14} /></a>}
                  {mapDestination && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapDestination)}`} target="_blank" rel="noreferrer">Open in Google Maps <ExternalLink size={14} /></a>}
                </div>
              </section>

              <section className="event-detail-section tourist-rating-section">
                <RatingsReviews attractionId={spot.id} userId={userId} onRatingSummaryChange={setRatingSummary} />
              </section>

              <section className="event-detail-section tourist-comments-section" id="tourist-comments">
                <div className="tourist-section-heading"><h2>Comments</h2><span>{commentCount}</span></div>
                <Comments contentType="tourist_spot" contentId={spot.id} userId={userId} contentOwnerId={spot.created_by} contentTitle={spot.name} eventStyle />
              </section>
            </div>

            <aside className="tourist-detail-sidebar">
              {relatedSpots.length > 0 && <section className="event-detail-related tourist-related">
                <h2>You might also like</h2>
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

        {lightboxIndex !== null && images.length > 0 && <div className="tourist-lightbox" role="dialog" aria-modal="true" aria-label="Destination photo viewer" onClick={() => setLightboxIndex(null)}>
          <button type="button" className="tourist-lightbox-close" onClick={() => setLightboxIndex(null)} aria-label="Close photo viewer"><X /></button>
          {images.length > 1 && <button type="button" className="tourist-lightbox-prev" onClick={(event) => { event.stopPropagation(); moveLightbox(-1) }} aria-label="Previous photo"><ChevronLeft /></button>}
          <img src={images[lightboxIndex]} alt={`${spot.name} photo ${lightboxIndex + 1}`} onClick={(event) => event.stopPropagation()} />
          {images.length > 1 && <button type="button" className="tourist-lightbox-next" onClick={(event) => { event.stopPropagation(); moveLightbox(1) }} aria-label="Next photo"><ChevronRight /></button>}
          <span>{lightboxIndex + 1} / {images.length}</span>
        </div>}
      </main>
    </>
  )
}
