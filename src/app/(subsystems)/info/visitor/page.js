'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Landmark,
  Mail,
  MapPin,
  MessageSquare,
  Newspaper,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  TriangleAlert,
  Umbrella,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { usePublicSettings } from '@/lib/usePublicSettings'
import { useScrollReveal, staggerDelay } from '@/lib/useScrollReveal'
import VisitorNavbar from '@/app/(subsystems)/info/components/visitor/VisitorNavbar'
import VisitorFooter from '@/app/(subsystems)/info/components/visitor/VisitorFooter'
import styles from './VisitorHome.module.css'

// Import local authentic high-resolution images
import bagasbasImage from '@/app/(subsystems)/info/assets/images/bagasbasbeach.webp'
import daetImage from '@/app/(subsystems)/info/assets/images/daet.jpg'
import plazaImage from '@/app/(subsystems)/info/assets/images/elevated-town-plaza.jpg'
import morgaImage from '@/app/(subsystems)/info/assets/images/morga.jpg'

const FALLBACK_IMAGE = bagasbasImage.src || bagasbasImage
const REALTIME_TABLES = ['info_tourist_spots', 'info_events', 'info_blogs', 'forum_threads', 'info_announcements']

const QUICK_SERVICES = [
  { label: 'Attractions', description: 'Explore top spots', href: '/info/visitor/tourist-spots', icon: Umbrella },
  { label: 'Events', description: 'Join exciting events', href: '/info/visitor/events', icon: CalendarDays },
  { label: 'Blogs', description: 'Read local stories', href: '/info/visitor/search?type=blogs', icon: Newspaper },
  { label: 'Tourist Info', description: 'Plan your trip', href: '/info/contact', icon: MapPin },
  { label: 'Community', description: 'Connect with locals', href: '/info/visitor/forum', icon: MessageSquare },
]

const today = () => new Date().toISOString().slice(0, 10)
const imageOf = (item) => [item?.image_url, item?.featured_image, item?.gallery_images?.[0]]
  .find((image) => typeof image === 'string' && image.trim()) || null

const formatDay = (value) => {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? { month: 'NOV', day: '22' } : {
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: date.getDate(),
  }
}

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

function formatEventTime(timeStr) {
  if (!timeStr) return '8:00 AM – 10:00 PM'
  const trimmed = String(timeStr).trim()
  if (trimmed.includes('AM') || trimmed.includes('PM')) return trimmed
  const parts = trimmed.split(':')
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10)
    const m = parts[1]
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return `${h}:${m} ${ampm}`
  }
  return timeStr
}

export default function VisitorHomePage() {
  const router = useRouter()
  const { settings } = usePublicSettings()
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [searchSuggestionsLoading, setSearchSuggestionsLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [eventsError, setEventsError] = useState('')
  const [storiesError, setStoriesError] = useState('')
  const [emailSubscribed, setEmailSubscribed] = useState(false)
  const [subscriberEmail, setSubscriberEmail] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [heroSlide, setHeroSlide] = useState(0)
  const [eventSlide, setEventSlide] = useState(0)
  const [data, setData] = useState({
    alerts: [], announcements: [], places: [], events: [], stories: [],
  })

  const { observe } = useScrollReveal()

  const realtime = useRealtimeRefresh({ channelName: 'visitor-home', tables: REALTIME_TABLES })
  const { setRefreshCallback } = realtime
  const refresh = useCallback(() => new Promise((resolve) => {
    setReload((n) => n + 1)
    resolve(true)
  }), [])
  useEffect(() => { setRefreshCallback(refresh) }, [refresh, setRefreshCallback])

  useEffect(() => {
    let active = true
    const syncSession = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('Visitor homepage authentication lookup failed:', error)
        return
      }
      if (!active) return
      setIsAuthenticated(Boolean(data.session?.user?.id))
    }

    void syncSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      const authenticated = Boolean(session?.user?.id)
      setIsAuthenticated(authenticated)
      if (!authenticated) {
        setEmailSubscribed(false)
        setSubscriberEmail('')
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      const day = today()
      const now = new Date().toISOString()

      const [alertsRes, noticeRes, placesRes, eventsRes, storiesRes] = await Promise.all([
        fetch('/info/api/alerts', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        supabase.from('info_announcements').select('id, title, content, published_at')
          .eq('status', 'published').in('audience', ['all', 'tourists'])
          .or(`expires_at.is.null,expires_at.gt.${now}`).order('published_at', { ascending: false }).limit(3),
        supabase.from('info_tourist_spots').select('id, name, listing_type, category, location, barangay, rating, review_count, image_url, featured_image, gallery_images, featured')
          .eq('status', 'active').order('featured', { ascending: false }).order('rating', { ascending: false }).limit(8),
        supabase.from('info_events').select('id, title, description, location, venue, start_date, end_date, start_time, category, featured_image, is_free, current_attendees')
          .eq('status', 'published').eq('approval_status', 'approved')
          .or(`end_date.gte.${day},start_date.gte.${day}`)
          .order('current_attendees', { ascending: false })
          .order('start_date', { ascending: true })
          .limit(3),
        supabase.from('info_blogs').select('id, title, excerpt, featured_image, category, published_at, views, likes, comments_count')
          .eq('status', 'published').eq('approval_status', 'approved')
          .or(`published_at.is.null,published_at.lte.${now}`)
          .order('views', { ascending: false })
          .order('likes', { ascending: false })
          .order('comments_count', { ascending: false })
          .order('published_at', { ascending: false })
          .limit(3),
      ])
      if (!active) return

      setEventsError(eventsRes.error ? 'Popular upcoming events could not be loaded.' : '')
      setStoriesError(storiesRes.error ? 'Popular news could not be loaded.' : '')
      if (eventsRes.error) console.error('Visitor homepage events failed to load:', eventsRes.error)
      if (storiesRes.error) console.error('Visitor homepage news failed to load:', storiesRes.error)
      setData({
        alerts: alertsRes?.current || [],
        announcements: noticeRes?.data || [],
        places: placesRes?.data || [],
        events: eventsRes?.data || [],
        stories: storiesRes?.data || [],
      })
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [reload])

  // Search suggestions
  useEffect(() => {
    const term = query.trim()
    if (!searchFocused || !term) return

    let active = true
    const timeout = window.setTimeout(async () => {
      const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`

      try {
        const [placesResult, eventsResult, storiesResult] = await Promise.all([
          supabase.from('info_tourist_spots').select('id, name')
            .eq('status', 'active').ilike('name', pattern).limit(3),
          supabase.from('info_events').select('id, title')
            .eq('status', 'published').eq('approval_status', 'approved')
            .ilike('title', pattern).limit(3),
          supabase.from('info_blogs').select('id, title')
            .eq('status', 'published').eq('approval_status', 'approved')
            .ilike('title', pattern).limit(3),
        ])

        if (!active) return
        setSearchSuggestions([
          ...(placesResult.data || []).map((item) => ({ id: item.id, title: item.name, type: 'Attraction' })),
          ...(eventsResult.data || []).map((item) => ({ id: item.id, title: item.title, type: 'Event' })),
          ...(storiesResult.data || []).map((item) => ({ id: item.id, title: item.title, type: 'Story' })),
        ].slice(0, 6))
        setSearchSuggestionsLoading(false)
      } catch {
        if (!active) return
        setSearchSuggestionsLoading(false)
      }
    }, 200)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [query, searchFocused])

  const submitSearch = (event) => {
    event.preventDefault()
    const term = query.trim()
    setSearchFocused(false)
    router.push(`/info/visitor/search${term ? `?q=${encodeURIComponent(term)}` : ''}`)
  }

  const submitSearchSuggestion = (suggestion) => {
    setQuery(suggestion.title)
    setSearchFocused(false)
    router.push(`/info/visitor/search?q=${encodeURIComponent(suggestion.title)}`)
  }

  const handleSubscribe = (event) => {
    event.preventDefault()
    if (isAuthenticated && subscriberEmail.trim()) {
      setEmailSubscribed(true)
      setSubscriberEmail('')
    }
  }

  const { municipality } = settings
  const mapQuery = encodeURIComponent(`${municipality.name || 'Daet'}, ${municipality.province || 'Camarines Norte'}, Philippines`)

  const destinationFallbackImages = [bagasbasImage, plazaImage, daetImage, morgaImage]
  const displayDestinations = data.places.slice(0, 4).map((place, index) => {
    const reviewCount = Math.max(0, Number(place.review_count) || 0)
    const rating = Number(place.rating)
    return {
      id: place.id,
      name: place.name,
      rating: reviewCount > 0 && rating > 0 ? rating.toFixed(1) : null,
      reviewCount,
      image: imageOf(place) || destinationFallbackImages[index].src || destinationFallbackImages[index],
      href: `/info/visitor/tourist-spots/${place.id}`,
    }
  })

  // Feature the upcoming event with the most confirmed registrations first.
  const activeEvent = data.events.length > 0 ? data.events[eventSlide % data.events.length] : null

  const eventDateObj = activeEvent ? formatDay(activeEvent.start_date) : null

  const displayNews = data.stories

  return (
    <div className={`${styles.homePage} flex min-h-screen flex-col bg-[#f8fafc] text-slate-900`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>

      {/* Unified Header with dynamic scroll state */}
      <VisitorNavbar alertsCount={data.alerts.length} transparent />

      {/* Live Safety / Emergency Alerts Banner */}
      {data.alerts.length > 0 && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2.5 shadow-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-xs sm:text-sm font-bold">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0 animate-bounce" />
              <span>{data.alerts[0].title}</span>
            </div>
            <Link href="/info/visitor/alerts" className="underline font-black hover:text-white shrink-0">
              Details →
            </Link>
          </div>
        </div>
      )}

      <main id="main" className="flex-1">
        {/* ════════════════════ HERO SECTION ════════════════════ */}
        <section className="relative isolate overflow-hidden bg-[#081c49] text-white">
          {/* Hero background photo with drift zoom animation */}
          <div className="absolute inset-0 -z-20 overflow-hidden">
            <Image
              src="/daet-rizal-monument-hero.png"
              alt="Rizal monument at the Daet town plaza"
              fill
              preload
              sizes="100vw"
              className={`${styles.heroImage} h-full w-full object-cover object-center filter brightness-[0.88]`}
            />
          </div>

          {/* Cool-toned dark overlay keeps hero copy readable over the photo. */}
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: `
                radial-gradient(ellipse at 80% 30%, rgba(56, 189, 248, 0.16) 0%, transparent 55%),
                linear-gradient(90deg, rgba(6, 26, 75, 0.94) 0%, rgba(9, 41, 107, 0.70) 45%, rgba(6, 26, 75, 0.25) 80%, rgba(6, 26, 75, 0.65) 100%),
                linear-gradient(0deg, rgba(8, 28, 73, 0.92) 0%, transparent 60%)
              `,
            }}
          />

          <div className="mx-auto max-w-7xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16 sm:pb-32 lg:px-8 lg:pt-20 lg:pb-36">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              {/* Left Column: Hero Copy + Search */}
              <div className="lg:col-span-12">
                {/* Location pill */}
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur-md">
                  <MapPin className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                  <span>Welcome to Daet!</span>
                </div>

                {/* Main Hero Headline */}
                <h1 className="mt-4 text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl">
                  Adventures that<br />
                  stay with{' '}
                  <span className="relative inline-block text-sky-400">
                    you
                    {/* Cute curved smile underline */}
                    <svg
                      className="absolute -bottom-2 left-0 w-full text-sky-400"
                      viewBox="0 0 100 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      preserveAspectRatio="none"
                    >
                      <path d="M5 8 Q 50 20 95 8" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
                    </svg>
                  </span>
                </h1>

                {/* Subtitle */}
                <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-100 sm:text-base sm:leading-7">
                  Discover Daet&apos;s best attractions, stay updated with the latest events, and experience the beauty of Camarines Norte!
                </p>

                {/* Hero Search Bar */}
                <div
                  className="relative mt-8 max-w-xl"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false)
                  }}
                >
                  <form
                    onSubmit={submitSearch}
                    role="search"
                    className="flex items-center gap-2 rounded-full border border-white/40 bg-white p-1.5 shadow-2xl transition-all duration-200 focus-within:ring-4 focus-within:ring-sky-400/40"
                  >
                    <label htmlFor="hero-search-input" className="sr-only">
                      Search attractions, events, or places
                    </label>
                    <div className="flex min-w-0 flex-1 items-center gap-2 pl-3">
                      <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                      <input
                        id="hero-search-input"
                        value={query}
                        onFocus={() => setSearchFocused(true)}
                        onChange={(event) => {
                          const next = event.target.value
                          setQuery(next)
                          setSearchSuggestions([])
                          setSearchSuggestionsLoading(Boolean(next.trim()))
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setSearchFocused(false)
                        }}
                        placeholder="Search attractions, events, or places…"
                        className="w-full min-w-0 bg-transparent py-2 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 sm:text-base"
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#1d68ed] px-6 py-2.5 text-xs font-bold text-white shadow-md transition-all duration-200 hover:bg-blue-600 hover:shadow-lg active:scale-95"
                    >
                      <span>Search</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </form>

                  {/* Suggestions Popover */}
                  {searchFocused && query.trim() && (
                    <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-white/20 bg-[#081c49]/95 p-2 text-white shadow-2xl backdrop-blur-xl">
                      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Suggestions</p>
                      {searchSuggestions.map((suggestion) => (
                        <button
                          key={`${suggestion.type}-${suggestion.id}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => submitSearchSuggestion(suggestion)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                        >
                          <span className="flex items-center gap-2">
                            <Search className="h-3.5 w-3.5 text-sky-400" />
                            {suggestion.title}
                          </span>
                          <span className="text-[10px] text-slate-400">{suggestion.type}</span>
                        </button>
                      ))}
                      {searchSuggestionsLoading && <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>}
                      {!searchSuggestionsLoading && searchSuggestions.length === 0 && (
                        <p className="px-3 py-2 text-xs text-slate-400">No direct matches. Press Enter to search all.</p>
                      )}
                    </div>
                  )}

                  {/* Carousel indicator dots centered under search */}
                  <div className="mt-5 flex items-center justify-center gap-2 max-w-xl">
                    {[0, 1, 2].map((idx) => (
                      <span
                        key={idx}
                        role="button"
                        tabIndex={0}
                        onClick={() => setHeroSlide(idx)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setHeroSlide(idx) }}
                        aria-label={`Hero slide ${idx + 1}`}
                        style={{
                          display: 'inline-block',
                          height: 6,
                          width: heroSlide === idx ? 24 : 6,
                          minWidth: heroSlide === idx ? 24 : 6,
                          minHeight: 6,
                          maxHeight: 6,
                          borderRadius: 9999,
                          padding: 0,
                          margin: 0,
                        }}
                        className={`cursor-pointer transition-all duration-300 ${
                          heroSlide === idx ? 'bg-sky-400 shadow-sm' : 'bg-white/40 hover:bg-white/70'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Organic Sweeping Wave Transition into Content */}
          <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-none z-10 pointer-events-none">
            <svg
              viewBox="0 0 1440 96"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-12 sm:h-16 md:h-20 text-[#f8fafc]"
              preserveAspectRatio="none"
            >
              <path
                d="M0,45 C280,95 480,10 720,48 C960,86 1200,20 1440,55 L1440,96 L0,96 Z"
                fill="currentColor"
              />
            </svg>
          </div>
        </section>

        {/* ════════════════════ 5 FLOATING CATEGORY CARDS ════════════════════ */}
        <section aria-labelledby="quick-services-heading" className="relative z-20 -mt-8 sm:-mt-12 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="quick-services-heading" className="sr-only">Quick Services</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {QUICK_SERVICES.map(({ label, description, href, icon: Icon }, index) => (
              <Link
                key={label}
                href={href}
                ref={observe}
                style={staggerDelay(index, 70)}
                className="group flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-4 text-center shadow-md shadow-slate-200/50 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-sky-300"
              >
                {/* Circular blue icon badge */}
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-sky-400 text-white shadow-md shadow-blue-500/25 transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  {label}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ════════════════════ FEATURED DESTINATIONS ════════════════════ */}
        <section aria-labelledby="featured-heading" className="mx-auto max-w-7xl px-4 pt-14 pb-12 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl" role="img" aria-label="Palm Tree">🌴</span>
              <div>
                <h2 id="featured-heading" className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  Featured Destinations
                </h2>
                <p className="text-xs text-slate-500">Explore the must-visit places in Daet</p>
              </div>
            </div>
            <Link
              href="/info/visitor/tourist-spots"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
            >
              <span>View All</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Featured cards use live destination and review data. */}
          {displayDestinations.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {displayDestinations.map((item, index) => (
              <Link
                key={item.id}
                href={item.href}
                ref={observe}
                style={staggerDelay(index, 80)}
                className="group relative h-72 sm:h-80 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-900 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-sky-300"
              >
                {/* Full-bleed Bright Destination Image */}
                <img
                  src={item.image}
                  alt={item.name}
                  loading="lazy"
                  className="h-full w-full object-cover filter brightness-[0.98] transition-transform duration-700 ease-out group-hover:scale-105"
                />

                {/* Keep the photo visible behind the card details while maintaining contrast. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

                {/* Bottom Card Content */}
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                  <div className="min-w-0 pr-2">
                    {/* Location Badge */}
                    <div className="inline-flex items-center gap-1 rounded-full bg-[#1d68ed] px-3 py-1 text-xs font-bold text-white shadow-md backdrop-blur-md">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[150px] sm:max-w-[170px]">{item.name}</span>
                    </div>

                    {/* Live rating summary */}
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-white">
                      {item.rating ? (
                        <>
                          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                          <span>{item.rating}</span>
                        </>
                      ) : (
                        <span className="font-semibold text-slate-300">Not rated yet</span>
                      )}
                      <span className="text-[11px] font-normal text-slate-300">
                        ({item.reviewCount.toLocaleString()} {item.reviewCount === 1 ? 'review' : 'reviews'})
                      </span>
                    </div>
                  </div>

                  {/* Circular White Action Button */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition-all duration-300 group-hover:bg-[#1d68ed] group-hover:text-white group-hover:scale-110 group-hover:shadow-blue-500/30">
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm text-slate-500">
              {loading ? 'Loading featured destinations…' : 'No featured destinations are available yet.'}
            </div>
          )}
        </section>

        {/* ════════════════════ SPLIT SECTION: EVENTS + NEWS ════════════════════ */}
        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left Column: Popular Upcoming Events */}
            <div className="lg:col-span-7">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-slate-900">Popular Upcoming Events</h2>
                    <p className="text-xs text-slate-500">Upcoming events with the most registrations.</p>
                  </div>
                </div>
                <Link
                  href="/info/visitor/events"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
                >
                  <span>View Calendar</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {/* Main Featured Event Card */}
              {activeEvent ? (
                <Link
                  href={`/info/visitor/events/${activeEvent.id}`}
                  className="group flex flex-col sm:flex-row overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-sky-200"
                >
                {/* Big Blue Date Block */}
                <div className="mb-3 sm:mb-0 flex h-24 w-20 shrink-0 flex-col items-center justify-center rounded-xl bg-[#1d68ed] text-white shadow-md">
                  <span className="text-[11px] font-black tracking-wider uppercase">{eventDateObj.month}</span>
                  <span className="text-3xl font-black leading-none">{eventDateObj.day}</span>
                </div>

                {/* Event Details */}
                <div className="sm:ml-4 flex flex-1 flex-col justify-center min-w-0 pr-3">
                  <h3 className="text-base font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                    {activeEvent.title}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">{activeEvent.venue || activeEvent.location || 'Daet, Camarines Norte'}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span>{formatEventTime(activeEvent.start_time)}</span>
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
                    {activeEvent.description}
                  </p>
                </div>

                {/* Prominent Event Photo on Right */}
                <div className="mt-3 sm:mt-0 h-36 w-full sm:h-28 sm:w-44 md:h-32 md:w-48 shrink-0 overflow-hidden rounded-xl bg-slate-100 shadow-inner">
                  <img
                    src={imageOf(activeEvent) || activeEvent.featured_image || morgaImage.src || morgaImage}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                </Link>
              ) : (
                <div role="status" className="rounded-2xl border border-slate-200/80 bg-white p-6 text-sm text-slate-500 shadow-sm">
                  {loading ? 'Loading popular upcoming events…' : eventsError || 'No upcoming events are available yet.'}
                </div>
              )}

              {/* Event carousel pagination dots */}
              {data.events.length > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  {data.events.map((event, idx) => {
                    const isActive = idx === eventSlide % data.events.length
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setEventSlide(idx)}
                        aria-label={`Show popular event ${idx + 1}: ${event.title}`}
                        aria-current={isActive ? 'true' : undefined}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          isActive ? 'w-[22px] bg-[#1d68ed] shadow-sm' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                        }`}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Popular Blogs */}
            <div className="lg:col-span-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                    <Newspaper className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-slate-900">Popular Blogs</h2>
                    <p className="text-xs text-slate-500">The most-viewed stories on Daet Connect.</p>
                  </div>
                </div>
                <Link
                  href="/info/visitor/search?type=blogs"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
                >
                  <span>View All</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {/* 3 Blog Rows */}
              <div className="space-y-2.5">
                {displayNews.length ? displayNews.map((news) => (
                  <Link
                    key={news.id}
                    href={`/info/visitor/blog/${news.id}`}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm transition-all duration-200 hover:border-sky-300 hover:shadow-md"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                      <img
                        src={imageOf(news) || news.image || FALLBACK_IMAGE}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {news.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-400">{formatDate(news.published_at)}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
                  </Link>
                )) : (
                  <div role="status" className="rounded-2xl border border-slate-200/80 bg-white p-5 text-sm text-slate-500 shadow-sm">
                    {loading ? 'Loading popular news…' : storiesError || 'No published news is available yet.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════ BOTTOM SECTION: EXPLORE DAET + STAY CONNECTED ════════════════════ */}
        <section className="mx-auto max-w-7xl px-4 py-8 pb-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Card: Explore Daet (Map preview card) */}
            <div className="lg:col-span-7 flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Explore Daet</h2>
                    <p className="text-xs text-slate-500">Plan your next adventure with our interactive map.</p>
                  </div>
                </div>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-100"
                >
                  <span>Open Map</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Map Graphic with checklist & inset photo */}
              <div className="relative flex-1 min-h-[190px] overflow-hidden rounded-xl bg-gradient-to-br from-emerald-50 via-sky-50 to-blue-50 p-4 border border-blue-100">
                {/* Embedded Stylized Map Grid Pattern */}
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(#0284c7_1px,transparent_1px)] [background-size:16px_16px]" />

                <div className="relative z-10 flex flex-col justify-between h-full gap-4 sm:flex-row sm:items-center">
                  {/* Checklist on left */}
                  <div className="space-y-2.5">
                    {[
                      'Tourist Spots',
                      'Events Locations',
                      'Essential Services',
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  {/* Daet Pin Marker Badge in center */}
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-black text-slate-800 shadow-lg border border-slate-200">
                    <MapPin className="h-4 w-4 text-red-500 shrink-0" />
                    <span>Daet, Camarines Norte</span>
                  </div>

                  {/* Guaranteed Working Local Photo of Monument */}
                  <div className="h-24 w-28 shrink-0 overflow-hidden rounded-xl border-2 border-white shadow-lg bg-slate-200">
                    <img
                      src={morgaImage.src || morgaImage}
                      alt="First Rizal Monument in Daet"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Card: Stay Connected! */}
            <div className="lg:col-span-5 relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#1d68ed] via-[#1052cc] to-[#0a3285] p-6 text-white shadow-lg">
              {/* Soft radial glow */}
              <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-sky-300/20 blur-2xl" />

              <div>
                {/* Paper plane icon with subtle burst rays */}
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur shadow-inner">
                  <Send className="h-5 w-5 -rotate-12" />
                  {/* Radiating burst accents */}
                  <span className="absolute -top-1.5 -right-1.5 h-1.5 w-1.5 rounded-full bg-sky-300 animate-ping" />
                </div>

                <h2 className="mt-4 text-2xl font-black tracking-tight">Stay Connected!</h2>
                <p className="mt-2 text-xs leading-relaxed text-blue-100 max-w-sm">
                  Get the latest updates, events, and travel tips in your inbox.
                </p>
              </div>

              {/* Form with clean pill input matching reference design */}
              {isAuthenticated ? (
                <form onSubmit={handleSubscribe} className="mt-6">
                  {emailSubscribed ? (
                    <div className="rounded-full bg-white/20 px-4 py-2.5 text-center text-xs font-bold backdrop-blur">
                      🎉 Thank you for subscribing!
                    </div>
                  ) : (
                    <div className="flex items-center rounded-full bg-white p-1 shadow-lg">
                      <label htmlFor="subscribe-email-input" className="sr-only">
                        Email address
                      </label>
                      <input
                        id="subscribe-email-input"
                        type="email"
                        required
                        value={subscriberEmail}
                        onChange={(e) => setSubscriberEmail(e.target.value)}
                        placeholder="Enter your email address"
                        className="w-full min-w-0 bg-transparent px-4 py-2 text-xs text-slate-900 outline-none placeholder:text-slate-400"
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-full bg-[#1d68ed] px-5 py-2.5 text-xs font-bold text-white shadow transition hover:bg-blue-600 active:scale-95"
                      >
                        Subscribe
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link href="/info/login" className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-xs font-bold text-blue-800 transition hover:bg-blue-50">Sign in to subscribe</Link>
                  <Link href="/info/register" className="inline-flex min-h-10 items-center rounded-full border border-white/50 px-4 text-xs font-bold text-white transition hover:bg-white/10">Create account</Link>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Unified Global Visitor Footer */}
      <VisitorFooter />
    </div>
  )
}
