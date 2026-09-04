'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Compass,
  Heart,
  Loader,
  MessageCircle,
  MapPin,
  Phone,
  Share2,
  Star,
  ShieldCheck,
  Ticket,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import RatingsReviews from '@/app/components/user/RatingsReviews'
import { trackUserActivity } from '@/lib/trackActivity'

const defaultSpotImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80'

function getImageUrl(value, fallback) {
  if (Array.isArray(value) && value.length > 0) return value[0]
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function TouristSpotDetailPage() {
  const router = useRouter()
  const params = useParams()
  const spotId = params?.id
  const [spot, setSpot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isSaved, setIsSaved] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [relatedSpots, setRelatedSpots] = useState([])
  const [relatedThreads, setRelatedThreads] = useState([])
  const [relatedBlogs, setRelatedBlogs] = useState([])
  const [userId, setUserId] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    let ignore = false

    const loadSpot = async () => {
      try {
        if (!spotId) return

        const { data, error } = await supabase
          .from('info_tourist_spots')
          .select('*, info_users!info_tourist_spots_created_by_fkey(full_name, email)')
          .eq('id', spotId)
          .single()

        if (error) {
          console.error('Error loading spot:', error)
          setError('Destination not found or unavailable')
        } else if (data && !ignore) {
          setSpot(data)

          // Increment view count
          await supabase
            .from('info_tourist_spots')
            .update({ view_count: (data.view_count || 0) + 1 })
            .eq('id', spotId)

          // Load related spots with same category
          if (data.category) {
            const { data: relatedData } = await supabase
              .from('info_tourist_spots')
              .select('*')
              .eq('status', 'active')
              .eq('category', data.category)
              .neq('id', spotId)
              .order('rating', { ascending: false })
              .limit(3)

            setRelatedSpots(relatedData || [])
          }

          const [{ data: threadData }, { data: blogData }] = await Promise.all([
            supabase
              .from('forum_threads')
              .select('id, title, content, reply_count, last_activity_at')
              .eq('status', 'published')
              .order('last_activity_at', { ascending: false })
              .limit(3),
            supabase
              .from('info_blogs')
              .select('id, title, excerpt, featured_image, category')
              .eq('status', 'published')
              .order('views', { ascending: false })
              .limit(3),
          ])
          setRelatedThreads(threadData || [])
          setRelatedBlogs(blogData || [])

          const sessionResult = await supabase.auth.getSession()
          const session = sessionResult?.data?.session
          if (session?.user?.id) {
            setUserId(session.user.id)
            const { data: saveData } = await supabase
              .from('user_favorites')
              .select('id')
              .eq('user_id', session.user.id)
              .eq('item_type', 'tourist_spot')
              .eq('item_id', spotId)
              .single()

            setIsSaved(!!saveData)
          }
        }
      } catch (err) {
        console.error('Spot fetch failed:', err)
        setError('Destination not found or unavailable')
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadSpot()

    return () => {
      ignore = true
    }
  }, [spotId])

  const handleSave = async () => {
    const sessionResult = await supabase.auth.getSession()
    const session = sessionResult?.data?.session

    if (!session?.user?.id) {
      setShowAuthModal(true)
      return
    }

    try {
      if (isSaved) {
        await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', session.user.id)
          .eq('item_type', 'tourist_spot')
          .eq('item_id', spotId)
      } else {
        await supabase.from('user_favorites').insert({
          user_id: session.user.id,
          item_type: 'tourist_spot',
          item_id: spotId,
        })
      }

      setIsSaved(!isSaved)
      if (!isSaved && session?.user?.id) {
        trackUserActivity({
          userId: session.user.id,
          activityType: 'save_content',
          entityType: 'tourist_spot',
          entityId: spotId,
          description: `Saved ${spot?.name || 'destination'}`,
          metadata: { contentTitle: spot?.name || 'Destination' },
        })
      }
    } catch (error) {
      console.error('Error saving spot:', error)
    }
  }

  const handleShare = async (platform) => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = spot?.name || 'Check out this destination'

    if (platform === 'copy') {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
      alert('Link copied to clipboard!')
    } else if (platform === 'email') {
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${url}`)}`
    } else {
      const shareUrls = {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      }

      if (shareUrls[platform]) {
        window.open(shareUrls[platform], '_blank')
      }
    }

    if (userId && (platform !== 'copy' && platform !== 'email')) {
      trackUserActivity({
        userId,
        activityType: 'share_content',
        entityType: 'tourist_spot',
        entityId: spotId,
        description: `Shared ${spot?.name || 'destination'}`,
        metadata: { contentTitle: spot?.name || 'Destination', platform },
      })
    }

    setShowShareMenu(false)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Loader className="mx-auto mb-4 animate-spin text-slate-600" />
          <p className="text-slate-600">Loading destination...</p>
        </div>
      </main>
    )
  }

  if (error || !spot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9] p-6">
        <div className="w-full max-w-md rounded-[24px] border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-red-600">{error || 'Destination not found'}</p>
          <Link href="/tourist-spots" className="mt-4 inline-block rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
            Back to Destinations
          </Link>
        </div>
      </main>
    )
  }

  const visitDuration = spot.visit_duration || spot.duration || '2-3 hours'
  const bestVisitTime = spot.best_visit_time || 'Early morning'
  const weatherAverage = spot.weather_average || 'Warm and breezy'
  const crowdBars = [
    ['6 AM', 32],
    ['9 AM', 58],
    ['12 PM', 78],
    ['3 PM', 64],
    ['6 PM', 42],
  ]

  const galleryImages = [
    ...(Array.isArray(spot.gallery_images) ? spot.gallery_images : []),
    ...(Array.isArray(spot.images) ? spot.images : []),
    spot.featured_image,
  ].filter(Boolean)

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600"><Heart className="h-6 w-6" /></div>
            <h2 className="mt-4 text-xl font-black text-slate-900">Save this to your trip list</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Create a free account to start planning your itinerary and keep your favorite destinations together.</p>
            <div className="mt-5 grid gap-2"><Link href="/register" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Create free account</Link><Link href="/login" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">Sign in</Link></div>
            <button type="button" onClick={() => setShowAuthModal(false)} className="mt-4 text-xs font-semibold text-slate-500 hover:text-slate-800">Continue browsing</button>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-[900px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/tourist-spots"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-sky-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Destinations
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-slate-600 transition ${
                isSaved
                  ? 'border-sky-200 bg-sky-50 text-sky-600'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              title={isSaved ? 'Remove from saved' : 'Save to My Trip List'}
            >
              <Heart className={`h-5 w-5 ${isSaved ? 'fill-current' : ''}`} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                title="Share"
              >
                <Share2 className="h-5 w-5" />
              </button>

              {showShareMenu && (
                <div className="absolute right-0 top-12 z-10 rounded-[16px] border border-slate-200 bg-white shadow-lg">
                  <button type="button" onClick={() => handleShare('twitter')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-[14px]">Share on Twitter</button>
                  <button type="button" onClick={() => handleShare('facebook')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Share on Facebook</button>
                  <button type="button" onClick={() => handleShare('copy')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:rounded-b-[14px]">Copy Link</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          {/* Image Gallery */}
          <div className="relative">
            {galleryImages.length > 0 ? (
              <>
                <img
                  src={getImageUrl(galleryImages[galleryIndex], defaultSpotImage)}
                  alt={spot.name}
                  className="h-64 w-full object-cover md:h-80"
                />
                {galleryImages.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                    {galleryImages.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setGalleryIndex(idx)}
                        className={`h-2 w-2 rounded-full transition ${
                          galleryIndex === idx
                            ? 'bg-white shadow'
                            : 'bg-white/50 hover:bg-white/80'
                        }`}
                        aria-label={`View image ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-64 w-full items-center justify-center bg-gradient-to-br from-emerald-100 to-sky-100 md:h-80">
                <Compass className="h-16 w-16 text-emerald-400" />
              </div>
            )}

            <div className="absolute left-3 top-3 rounded-full bg-slate-900/70 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
              {spot.category || 'Destination'}
            </div>

            {spot.featured && (
              <div className="absolute right-3 top-3 rounded-full bg-amber-500/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                Featured
              </div>
            )}
          </div>

          <div className="p-5 md:p-8">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-black text-slate-900 md:text-3xl">{spot.name}</h1>
              <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-700 flex-shrink-0">
                <Star className="h-4 w-4 fill-current" />
                {Number(spot.rating || 0).toFixed(1)}
              </div>
            </div>

            {/* Key Info */}
            <div className="mt-4 flex flex-wrap gap-2">
              {spot.location && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                  <MapPin className="h-3.5 w-3.5 text-sky-600" />
                  {spot.location}
                </span>
              )}
              {spot.opening_hours && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                  <Clock className="h-3.5 w-3.5 text-sky-600" />
                  {spot.opening_hours}
                </span>
              )}
              {spot.entrance_fee != null && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                  <Ticket className="h-3.5 w-3.5 text-emerald-600" />
                  {spot.entrance_fee === 0
                    ? 'Free Entry'
                    : `₱${Number(spot.entrance_fee).toLocaleString()}`}
                </span>
              )}
              {spot.contact_number && (
                <a
                  href={`tel:${spot.contact_number}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  <Phone className="h-3.5 w-3.5 text-sky-600" />
                  {spot.contact_number}
                </a>
              )}
            </div>

            {/* Description */}
            {spot.description && (
              <div className="mt-6">
                <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-400">About</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700 md:text-base">
                  {spot.description}
                </p>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Entrance fee', spot.entrance_fee == null || Number(spot.entrance_fee) === 0 ? 'Free' : `₱${Number(spot.entrance_fee).toLocaleString()}`, Ticket],
                ['Typical stay', visitDuration, Clock],
                ['Best time', bestVisitTime, CalendarDays],
                ['Weather', weatherAverage, ShieldCheck],
              ].map(([label, value, Icon]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <Icon className="h-4 w-4 text-sky-600" />
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            {/* Review / Stats */}
            <div className="mt-6 grid gap-3 rounded-[20px] border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <div className="text-center">
                <p className="text-2xl font-black text-slate-900">{spot.view_count || 0}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Views</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-amber-600">{Number(spot.rating || 0).toFixed(1)}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Rating</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-sky-600">
                  {spot.created_at ? formatDate(spot.created_at).split(',')[0] : '—'}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Listed</p>
              </div>
            </div>

            {/* Map */}
            {spot.latitude && spot.longitude && (
              <div className="mt-6">
                <iframe
                  title={`Map - ${spot.name}`}
                  src={`https://www.google.com/maps?q=${spot.latitude},${spot.longitude}&z=14&output=embed`}
                  className="h-[240px] w-full rounded-[16px] border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                  <span className="rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-700">Parking nearby</span>
                  <span className="rounded-xl bg-sky-50 px-3 py-2 font-semibold text-sky-700">Public transport nearby</span>
                  <span className="rounded-xl bg-amber-50 px-3 py-2 font-semibold text-amber-700">Check local conditions</span>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-end justify-between gap-3"><div><h2 className="text-sm font-black text-slate-900">Packed or peaceful?</h2><p className="mt-1 text-xs text-slate-500">Typical visitor volume by time of day</p></div><span className="text-xs font-bold text-emerald-700">Quietest at 6 AM</span></div>
              <div className="mt-4 flex h-28 items-end justify-between gap-2">
                {crowdBars.map(([time, value]) => <div key={time} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="w-full rounded-t-lg bg-sky-200" style={{ height: `${value}%` }} /><span className="text-[10px] text-slate-500">{time}</span></div>)}
              </div>
            </div>
          </div>
        </div>

        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Local advice</p><h2 className="mt-1 text-xl font-black text-slate-900">Read the forum</h2></div><MessageCircle className="h-5 w-5 text-emerald-600" /></div>
            <div className="mt-4 space-y-3">{relatedThreads.map((thread) => <Link key={thread.id} href={`/forum/${thread.id}`} className="block rounded-2xl border border-slate-200 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/40"><p className="text-sm font-bold text-slate-900">{thread.title}</p><p className="mt-1 line-clamp-1 text-xs text-slate-500">{thread.reply_count || 0} replies · local conversation</p></Link>)}{relatedThreads.length === 0 && <p className="text-sm text-slate-500">Travel questions from the community will appear here.</p>}</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Travel stories from this spot</p><h2 className="mt-1 text-xl font-black text-slate-900">Curated blog picks</h2></div>
            <div className="mt-4 space-y-3">{relatedBlogs.map((blog) => <Link key={blog.id} href={`/blog/${blog.id}`} className="flex gap-3 rounded-2xl border border-slate-200 p-2 transition hover:border-amber-300 hover:bg-amber-50/40"><img src={blog.featured_image || defaultSpotImage} alt="" className="h-14 w-16 rounded-xl object-cover" /><span className="text-sm font-bold text-slate-900">{blog.title}</span></Link>)}{relatedBlogs.length === 0 && <p className="text-sm text-slate-500">More stories are on the way.</p>}</div>
          </div>
        </section>

        {/* Ratings & Reviews */}
        <div className="mt-8">
          <RatingsReviews attractionType="tourist_spot" attractionId={spotId} userId={userId} />
        </div>

        {/* Related Spots */}
        {relatedSpots.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-bold text-slate-900">You Might Also Like</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedSpots.map((related) => (
                <Link
                  key={related.id}
                  href={`/tourist-spots/${related.id}`}
                  className="group overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm transition hover:shadow-md hover:border-sky-200"
                >
                  <div className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-emerald-400 to-sky-500">
                    <img
                      src={getImageUrl(related.featured_image || related.images, defaultSpotImage)}
                      alt={related.name}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                    {related.featured && (
                      <div className="absolute right-2 top-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                        Featured
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-1 text-sm font-bold text-slate-900 group-hover:text-sky-700">{related.name}</h3>
                    {related.location && (
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        {related.location}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                        <Star className="h-3 w-3 fill-current" />
                        {Number(related.rating || 0).toFixed(1)}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {related.view_count || 0} views
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}