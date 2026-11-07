'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, MapPin, Home, Sparkles, Plane, Newspaper, Menu, X, Star, Calendar, Megaphone, MessageCircle, Heart, Clock, Lock, ThumbsUp, Bookmark, Reply, PhoneCall, Radio, Utensils, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCache, getCacheKey, setCache } from '@/lib/cache'
import { getStoredSessionObject } from '@/lib/authCookies'
import VisitorScrollEffects from './VisitorScrollEffects'
import bagasbasImage from '@/app/(subsystems)/info/assets/images/bagasbasbeach.webp'
import morgaImage from '@/app/(subsystems)/info/assets/images/morga.jpg'
import ElevatedTownPlazaImage from '@/app/(subsystems)/info/assets/images/elevated-town-plaza.jpg'
import Daet from '@/app/(subsystems)/info/assets/images/daet.jpg'

const MAX_VISITOR_ITEMS = 4
const COOKIE_CONSENT_KEY = 'daet-cookie-consent'
const PUBLIC_ANNOUNCEMENT_SEEN_KEY = 'daet:visitor:seen-public-announcement'
const PUBLIC_REVIEWS_CACHE_KEY = getCacheKey('visitor', 'public', 'reviews')
const PUBLIC_REVIEWS_CACHE_TTL = 5 * 60 * 1000

function getCookieConsent() {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) || ''
  } catch {
    return ''
  }
}

function subscribeToCookieConsent(callback) {
  window.addEventListener('daet-cookie-consent', callback)
  window.addEventListener('storage', callback)

  return () => {
    window.removeEventListener('daet-cookie-consent', callback)
    window.removeEventListener('storage', callback)
  }
}

const heroCarouselSlides = [
  {
    title: 'Bagasbas Beach',
    label: 'Surf & sunset',
    image: bagasbasImage.src || bagasbasImage,
  },
  {
    title: 'First Rizal Monument',
    label: 'History & culture',
    image: morgaImage.src || morgaImage,
  },
  {
    title: 'Daet Elevated Town Plaza',
    label: 'Food Trip & Local Life',
    image: ElevatedTownPlazaImage.src || ElevatedTownPlazaImage,
  },
]

function formatDate(value) {
  if (!value) return 'Recently'
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatEventDate(value) {
  if (!value) return 'Date to be announced'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 'Date to be announced'
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTimeAgo(value) {
  if (!value) return 'Recently'
  const diff = Date.now() - new Date(value).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(value)
}

export default function VisitorPage() {
  const router = useRouter()
  const cookieConsent = useSyncExternalStore(subscribeToCookieConsent, getCookieConsent, () => '')
  const [user, setUser] = useState(null)
  const [popularSpots, setPopularSpots] = useState([])
  const [trendingBlogs, setTrendingBlogs] = useState([])
  const [forumThreads, setForumThreads] = useState([])
  const [featuredEvents, setFeaturedEvents] = useState([])
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [activeUpcomingEventId, setActiveUpcomingEventId] = useState(null)
  const [announcements, setAnnouncements] = useState([])
  const [announcementPanelOpen, setAnnouncementPanelOpen] = useState(false)
  const [heroCounts, setHeroCounts] = useState({ stories: null, guides: null })
  const [loading, setLoading] = useState(true)
  const [contentError, setContentError] = useState('')
  const [failedSections, setFailedSections] = useState([])
  const [contentRetryKey, setContentRetryKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [activeSection, setActiveSection] = useState('discover')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [categories, setCategories] = useState(['All'])
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authAction, setAuthAction] = useState('')
  const [travelGuides, setTravelGuides] = useState([])
  const [visitorReviews, setVisitorReviews] = useState([])
  const [tripStage, setTripStage] = useState('stories')

  const navigationItems = [
    { id: 'discover', label: 'Discover' },
    { id: 'spots', label: 'Spots' },
    { id: 'events', label: 'Events' },
    { id: 'blogs', label: 'Blogs' },
    { id: 'community', label: 'Forums' },
    { id: 'map', label: 'Map' },
  ]

  const [activeHeroSlide, setActiveHeroSlide] = useState(0)

  const handleNavClick = (sectionId) => {
    setActiveSection(sectionId)
    setMobileMenuOpen(false)
  }

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    const query = searchQuery.trim()
    router.push(`/info/visitor/search${query ? `?q=${encodeURIComponent(query)}` : ''}`)
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveHeroSlide((current) => (current + 1) % heroCarouselSlides.length)
    }, 4000)

    return () => clearInterval(interval)
  }, [])

  // Check auth status
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    checkUser()
  }, [])

  // Check session and redirect to the correct dashboard if already logged in.
  // Uses the persistent cookie so newly-opened tabs (with an empty per-tab
  // sessionStorage) don't bounce between routes and cause the flicker/glitch.
  useEffect(() => {
    const cookieSession = getStoredSessionObject()
    if (cookieSession && cookieSession.logged_in) {
      const role = String(cookieSession.role || '').trim().toLowerCase()
      router.push(role === 'admin' ? '/info/admin/dashboard' : '/info/user/dashboard')
    }
  }, [router])

  useEffect(() => {
    const loadContent = async () => {
      try {
        setLoading(true)
        setContentError('')
        setFailedSections([])
        setPopularSpots([])
        setTrendingBlogs([])
        setTravelGuides([])
        setForumThreads([])
        setFeaturedEvents([])
        setUpcomingEvents([])
        setAnnouncements([])

        const failures = new Set()
        const reportError = (section, error) => {
          if (!error) return
          console.error(`Visitor page: ${section} could not load:`, error.message)
          failures.add(section)
          setFailedSections([...failures])
          setContentError(`Could not load ${[...failures].join(', ')}. Use retry to try again.`)
        }
        // Use the deployed schema, not optional counters that do not exist.
        const fetchPublished = async (table, select, orderBy) => {
          const { data, error } = await supabase
            .from(table)
            .select(select)
            .eq('status', 'published')
            .order(orderBy, { ascending: false })
            .limit(MAX_VISITOR_ITEMS)
          reportError(table === 'info_blogs' ? 'stories' : 'discussions', error)
          return data || []
        }

        // Fetch tourist spots
        const { data: spots, error: spotsError } = await supabase
          .from('info_tourist_spots')
          .select('*')
          .eq('status', 'active')
          .order('rating', { ascending: false })
          .limit(MAX_VISITOR_ITEMS)

        reportError('destinations', spotsError)

        if (!spotsError && spots?.length) {
          const validSpots = spots.filter(Boolean)
          setPopularSpots(validSpots)
          const uniqueCategories = ['All', ...new Set(validSpots.map(spot => spot.category).filter(Boolean))]
          setCategories(uniqueCategories)
        }

        // Fetch blogs
        const blogs = await fetchPublished(
          'info_blogs',
          'id, title, excerpt, featured_image, category, created_at, views, likes, comments_count, slug, created_by',
          'published_at',
        )

        // Publication status and database RLS determine public visibility.
        // Engagement is not a prerequisite for showing real published stories.
        setTrendingBlogs(blogs.filter(Boolean).slice(0, MAX_VISITOR_ITEMS))
        setTravelGuides(
          blogs
            .filter(Boolean)
            .filter((blog) => String(blog.category || '').toLowerCase().replace(/[\s-]+/g, '_') === 'travel_guides')
            .slice(0, MAX_VISITOR_ITEMS)
        )

        // Fetch forum threads
        const threads = await fetchPublished(
          'forum_threads',
          'id, title, content, reply_count, created_at, last_activity_at, created_by, category_id, views',
          'last_activity_at',
        )

        setForumThreads(threads.filter(Boolean).slice(0, MAX_VISITOR_ITEMS))

        // Fetch featured events
        const { data: events, error: eventsError } = await supabase
          .from('info_events')
          .select('*')
          .eq('status', 'published')
          .eq('featured', true)
          .or(`end_date.gte.${new Date().toISOString().slice(0, 10)},start_date.gte.${new Date().toISOString().slice(0, 10)}`)
          .order('start_date', { ascending: true })
          .limit(MAX_VISITOR_ITEMS)

        reportError('featured events', eventsError)

        if (!eventsError && events?.length) {
          setFeaturedEvents(events.filter(Boolean))
        }

        const today = new Date().toISOString().slice(0, 10)
        const { data: upcoming, error: upcomingError } = await supabase
          .from('info_events')
          .select('id, title, description, location, venue, start_date, end_date, start_time, category, featured_image, is_free, ticket_price')
          .eq('status', 'published')
          .or(`end_date.gte.${today},start_date.gte.${today}`)
          .order('start_date', { ascending: true })
          .limit(MAX_VISITOR_ITEMS)

        reportError('upcoming events', upcomingError)
        if (!upcomingError) {
          const validUpcomingEvents = (upcoming || []).filter(Boolean)
          setUpcomingEvents(validUpcomingEvents)
          setActiveUpcomingEventId(validUpcomingEvents[0]?.id || null)
        }

        const { data: noticeData, error: noticeError } = await supabase
          .from('info_announcements')
          .select('id, title, content, announcement_type, audience, priority, image_url, published_at, expires_at')
          .eq('status', 'published')
          .in('audience', ['all', 'tourists'])
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('published_at', { ascending: false })
          .order('priority', { ascending: false })
          .limit(MAX_VISITOR_ITEMS)

        reportError('announcements', noticeError)
        if (!noticeError) {
          const publicAnnouncements = (noticeData || []).filter(Boolean)
          setAnnouncements(publicAnnouncements)
          if (publicAnnouncements.length > 0) {
            const latestAnnouncementId = String(publicAnnouncements[0].id)
            try {
              if (window.localStorage.getItem(PUBLIC_ANNOUNCEMENT_SEEN_KEY) !== latestAnnouncementId) {
                setAnnouncementPanelOpen(true)
                window.localStorage.setItem(PUBLIC_ANNOUNCEMENT_SEEN_KEY, latestAnnouncementId)
              }
            } catch (error) {
              console.error('Visitor announcement preference could not be saved:', error)
              setAnnouncementPanelOpen(true)
            }
          }
        }

        const cachedReviews = getCache(PUBLIC_REVIEWS_CACHE_KEY, { allowStale: true })
        if (Array.isArray(cachedReviews?.data)) {
          setVisitorReviews(cachedReviews.data)
        }

        if (!cachedReviews || cachedReviews.stale) {
          const { data: reviews, error: reviewsError } = await supabase
            .from('attraction_ratings')
            .select('id, rating, review_text, created_at, attraction_id, info_users!attraction_ratings_user_id_fkey(full_name, profile_image_url)')
            .eq('attraction_type', 'tourist_spot')
            .not('review_text', 'is', null)
            .neq('review_text', '')
            .order('created_at', { ascending: false })
            .limit(MAX_VISITOR_ITEMS)

          reportError('visitor reviews', reviewsError)
          if (!reviewsError) {
            const publishedReviews = (reviews || []).filter(
              (review) => review && typeof review.review_text === 'string' && review.review_text.trim()
            )
            setVisitorReviews(publishedReviews)
            setCache(PUBLIC_REVIEWS_CACHE_KEY, publishedReviews, PUBLIC_REVIEWS_CACHE_TTL)
          }
        }

        const [
          { count: storyCount, error: storyCountError },
          { count: guideCount, error: guideCountError },
        ] = await Promise.all([
          supabase
            .from('info_blogs')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'published'),
          supabase
            .from('info_blogs')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'published')
            .ilike('category', 'travel_guides'),
        ])
        reportError('story counts', storyCountError)
        reportError('guide counts', guideCountError)
        setHeroCounts({
          stories: storyCountError ? null : storyCount ?? 0,
          guides: guideCountError ? null : guideCount ?? 0,
        })

      } catch (error) {
        console.error('Visitor page content load failed:', error)
        setFailedSections((previous) => [...new Set([...previous, 'visitor content'])])
        setContentError('Some content could not be loaded. Check your connection and retry.')
      } finally {
        setLoading(false)
      }
    }

    loadContent()
  }, [contentRetryKey])

  const heroStats = [
    { label: 'Local stories', value: heroCounts.stories === null ? '—' : String(heroCounts.stories) },
    { label: 'Travel guides', value: heroCounts.guides === null ? '—' : String(heroCounts.guides) },
  ]

  const filteredSpots = useMemo(() => {
    return popularSpots.filter((spot) => {
      const matchesQuery = searchQuery.trim() === '' || 
        [spot.name, spot.location, spot.category].some((value) =>
          String(value || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      const matchesCategory = selectedCategory === 'All' || spot.category === selectedCategory
      return matchesQuery && matchesCategory
    })
  }, [popularSpots, searchQuery, selectedCategory])

  const defaultSpotImage = Daet.src || Daet
  const defaultBlogImage = Daet.src || Daet

  const handleBlogClick = (blogId) => {
    router.push(`/info/visitor/blog/${blogId}`)
  }

  const handleForumClick = (threadId) => {
    router.push(`/info/visitor/forum/${threadId}`)
  }

  const handleSpotClick = (spotId) => {
    router.push(`/info/visitor/tourist-spots/${spotId}`)
  }

  const handleReply = (e, threadId) => {
    e.stopPropagation()
    if (!user) {
      setAuthAction('reply')
      setShowAuthModal(true)
      return
    }
    router.push(`/info/visitor/forum/${threadId}`)
  }

  return (
    <VisitorScrollEffects className="visitor-page-shell min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] pb-[calc(5rem+env(safe-area-inset-bottom))] text-slate-900 md:pb-0">

      {/* Auth Required Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-full bg-amber-100 p-3 mb-4">
                <Lock size={28} className="text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Sign in to continue</h3>
              <p className="mt-2 text-sm text-slate-600">
                {authAction === 'like' && 'You need to be signed in to like content.'}
                {authAction === 'bookmark' && 'You need to be signed in to bookmark content.'}
                {authAction === 'reply' && 'You need to be signed in to reply to forum threads.'}
                {!authAction && 'You need to be signed in to interact with this content.'}
              </p>
              <div className="mt-6 flex w-full flex-col gap-2">
                <Link
                  href="/info/login"
                  className="rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Sign in
                </Link>
                <Link
                  href="/info/register"
                  className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Create account
                </Link>
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="mt-2 text-sm text-slate-500 transition hover:text-slate-700"
                >
                  Continue browsing
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[80] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
          {announcementPanelOpen && (
            <section
              id="visitor-announcements-panel"
              role="dialog"
              aria-label="Public announcements"
              className="max-h-[min(70dvh,34rem)] w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 text-white sm:px-5">
                <div className="flex items-center gap-2">
                  <Megaphone aria-hidden="true" className="h-5 w-5 text-amber-300" />
                  <div>
                    <h2 className="text-sm font-bold">Public announcements</h2>
                    <p className="text-[11px] text-slate-300">Updates for Daet visitors</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAnnouncementPanelOpen(false)}
                  aria-label="Close announcements"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[calc(min(70dvh,34rem)-4rem)] space-y-3 overflow-y-auto p-3 sm:p-4">
                {loading ? (
                  <p role="status" className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Checking for the latest public announcements…</p>
                ) : failedSections.includes('announcements') || failedSections.includes('visitor content') ? (
                  <div role="status" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <p>Announcements could not be loaded.</p>
                    <button
                      type="button"
                      onClick={() => setContentRetryKey((value) => value + 1)}
                      className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-red-800 px-4 font-semibold text-white transition hover:bg-red-900"
                    >
                      Retry
                    </button>
                  </div>
                ) : announcements.length > 0 ? announcements.map((notice, index) => (
                  <article
                    key={notice.id}
                    className={`rounded-2xl border p-4 ${index === 0 ? 'border-amber-300 bg-amber-50 shadow-sm' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${index === 0 ? 'bg-amber-200 text-amber-950' : 'bg-slate-100 text-slate-700'}`}>
                        {index === 0 ? 'Latest · ' : ''}{notice.announcement_type || 'Info'}
                      </span>
                      <time dateTime={notice.published_at || undefined} className="text-[11px] text-slate-500">
                        {formatDate(notice.published_at)}
                      </time>
                    </div>
                    <h3 className="mt-3 text-base font-bold leading-snug text-slate-950">{notice.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notice.content}</p>
                  </article>
                )) : (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">There are no current public announcements.</p>
                )}
              </div>
            </section>
          )}

          <button
            type="button"
            onClick={() => setAnnouncementPanelOpen((isOpen) => !isOpen)}
            aria-expanded={announcementPanelOpen}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-bold text-white shadow-[0_8px_28px_rgba(15,23,42,0.28)] ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
          >
            <Megaphone aria-hidden="true" className="h-5 w-5 text-amber-300" />
            <span>Announcements</span>
            {announcements.length > 0 && <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-black text-slate-950">{announcements.length}</span>}
          </button>
      </div>

      {/* Hero Section */}
      <section id="top" className="relative isolate min-h-[min(48rem,100svh)] scroll-mt-24 overflow-hidden">
        {heroCarouselSlides.map((slide, index) => (
          <div
            key={slide.title}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-out"
            style={{
              backgroundImage: `url('${slide.image}')`,
              opacity: index === activeHeroSlide ? 0.72 : 0,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,24,39,0.78)_0%,rgba(8,35,53,0.52)_52%,rgba(5,35,32,0.30)_100%),linear-gradient(0deg,rgba(8,24,39,0.4)_0%,transparent_38%)]" />

        <div className="relative mx-auto max-w-[1440px] px-3 pb-10 pt-2 sm:px-6 sm:pb-16 sm:pt-3 lg:px-8 xl:px-10">
          {/* Header */}
          <header className={`relative sticky top-2 z-40 mb-5 rounded-[22px] border border-white/20 px-3 py-2 shadow-[0_20px_50px_rgba(15,23,42,0.15)] sm:mb-10 sm:rounded-full sm:px-6 sm:py-2.5 ${mobileMenuOpen ? 'bg-slate-950' : 'bg-white/10 backdrop-blur-xl'}`}>
            <div className="grid items-center gap-2 sm:gap-4 md:grid-cols-[auto_1fr_auto]">
              <div className="flex w-full items-center gap-2 sm:gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 p-1 shadow-lg shadow-sky-900/20 ring-1 ring-white/20 sm:h-11 sm:w-11">
                  <img src="/logo.png" alt="Daet tourism logo" className="h-full w-full rounded-xl object-cover" />
                </div>
                <div>
                  <p className="text-[10px] font-black tracking-[0.12em] text-white/90 sm:text-sm">Connect-Daet.ai</p>
                  <p className="text-[9px] font-medium leading-tight text-sky-100/90 sm:text-[10px]">Subsystem 1: Daet Information, Engagement, & Management System</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-expanded={mobileMenuOpen}
                  aria-label="Toggle navigation menu"
                  className={`ml-auto flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 md:hidden ${
                    mobileMenuOpen
                      ? 'border-white/40 bg-white text-slate-900 shadow-lg'
                      : 'border-white/20 bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  {mobileMenuOpen ? <X size={18} className="transition-transform duration-200" /> : <Menu size={18} className="transition-transform duration-200" />}
                </button>
              </div>

              <nav className="hidden items-center justify-center gap-1 text-sm md:flex">
                {navigationItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => handleNavClick(item.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      activeSection === item.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-100 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              <div className="flex items-center justify-end gap-1.5 sm:gap-3">
                {user ? (
                  <Link href="/info/user/dashboard" className="hidden rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-900 transition hover:bg-slate-100 sm:inline-flex sm:px-4 sm:py-2 sm:text-sm">
                    Dashboard
                  </Link>
                ) : (
                  <Link href="/info/login" className="hidden rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-900 transition hover:bg-slate-100 sm:inline-flex sm:px-4 sm:py-2 sm:text-sm">
                    Sign in
                  </Link>
                )}
              </div>
            </div>

            {mobileMenuOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[60] overflow-hidden rounded-2xl border border-white/20 bg-slate-950 shadow-[0_18px_40px_rgba(15,23,42,0.35)] md:hidden">
                <nav className="flex flex-col gap-0.5 p-2">
                  {navigationItems.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={() => handleNavClick(item.id)}
                      className={`flex min-h-11 items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                        activeSection === item.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-white hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span>{item.label}</span>
                      <span className={`text-xs ${activeSection === item.id ? 'text-slate-500' : 'text-slate-300'}`}>
                        {activeSection === item.id ? '•' : '→'}
                      </span>
                    </a>
                  ))}
                </nav>

                <div className="border-t border-white/10 px-2 py-2">
                  <div className="grid grid-cols-2 gap-2">
                    {user ? (
                      <Link href="/info/user/dashboard" className="rounded-xl bg-white px-3 py-2 text-center text-xs font-semibold text-slate-900 transition hover:bg-slate-100">
                        Dashboard
                      </Link>
                    ) : (
                      <>
                        <Link href="/info/login" className="rounded-xl bg-white px-3 py-2 text-center text-xs font-semibold text-slate-900 transition hover:bg-slate-100">
                          Sign in
                        </Link>
                        <Link href="/info/register" className="rounded-xl border border-white/30 bg-slate-800 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-slate-700">
                          Join now
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </header>

          {contentError && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-2xl border border-red-300/40 bg-red-950/60 px-4 py-3 text-sm text-red-100 backdrop-blur-sm"
            >
              <div className="flex-1">
                <p className="font-semibold text-red-50">Something went wrong</p>
                <p className="mt-0.5 text-xs text-red-200">{contentError}</p>
              </div>
              <button
                type="button"
                onClick={() => setContentRetryKey((value) => value + 1)}
                className="flex-shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                Retry
              </button>
            </div>
          )}

          {/* Hero Content */}
          <div className="mx-auto max-w-4xl">
            <div className="py-1 text-center sm:py-6 lg:py-10">
              <span className="mb-3 inline-flex max-w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-1.5 text-[9px] font-semibold uppercase leading-4 tracking-[0.1em] text-sky-100 backdrop-blur-sm sm:rounded-full sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.26em]">
                <Sparkles size={12} className="shrink-0 sm:size-3" />
                Your local travel companion
              </span>

              <h1 className="mx-auto mt-2 max-w-[19rem] text-[2rem] font-black leading-[1.05] tracking-[-0.04em] text-white sm:max-w-none sm:text-4xl lg:text-5xl xl:text-6xl">
                Discover Daet, one experience at a time.
              </h1>

              <p className="mx-auto mt-3 max-w-2xl text-xs leading-5 text-slate-100/90 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                Find places, local food, events, and experiences.
              </p>

              <form onSubmit={handleSearchSubmit} role="search" className="mx-auto mt-5 flex max-w-2xl flex-col gap-2 rounded-2xl bg-white p-2 text-left shadow-[0_20px_50px_rgba(15,23,42,0.28)] sm:flex-row sm:items-center sm:rounded-full">
                <label htmlFor="visitor-hero-search" className="sr-only">Search places, food, events, and stories</label>
                <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
                  <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-500" />
                  <input
                    id="visitor-hero-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Where do you want to go?"
                    className="min-h-11 w-full min-w-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-600"
                  />
                </div>
                <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                  Search <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:mt-4">
                <Link href="/info/visitor/tourist-spots" className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:bg-blue-700">
                  Explore places
                </Link>
                <a href="#map" onClick={() => handleNavClick('map')} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/50 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20">
                  Explore map
                </a>
              </div>

              <div className="mx-auto mt-5 grid max-w-2xl grid-cols-2 gap-2 sm:gap-4">
                  {heroStats.map((item) => (
                    <div key={item.label} className="min-w-0 rounded-2xl border border-white/15 bg-white/10 p-2.5 backdrop-blur-sm transition duration-300 hover:bg-white/15 sm:p-4">
                      <p className="text-lg font-black leading-none text-white sm:text-2xl">{item.value}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.1em] text-sky-100 sm:text-[10px] sm:leading-normal sm:tracking-[0.22em]">{item.label}</p>
                    </div>
                  ))}
              </div>

              <style>{`
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
              `}</style>

              {/* Featured Events - Mobile Friendly */}
              {featuredEvents.length > 0 && (
                <div className="mt-5">
                  <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5 sm:text-xl">
                    <Calendar size={14} className="sm:size-5" />
                    Featured Events
                  </h2>
                  <div className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-3 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-3">
                    {featuredEvents.map((ev) => (
                      <Link key={ev.id} href={`/info/visitor/events/${ev.id}`} className="block w-[min(78vw,18rem)] flex-shrink-0 snap-start rounded-2xl bg-white/15 p-3.5 text-white border border-white/10 backdrop-blur-sm hover:bg-white/20 transition sm:w-auto sm:rounded-2xl sm:p-4">
                        <p className="line-clamp-2 min-h-10 text-sm font-semibold sm:text-base">{ev.title}</p>
                        <p className="text-[10px] text-white/70 mt-0.5 sm:text-xs">{formatDate(ev.start_date || ev.start)}</p>
                        {ev.location && (
                          <p className="text-[10px] text-white/50 mt-0.5 line-clamp-1">{ev.location}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      <section aria-labelledby="quick-actions-heading" className="border-b border-slate-200 bg-stone-50 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <h2 id="quick-actions-heading" className="mb-3 text-sm font-bold text-slate-900 sm:text-base">Start exploring</h2>
          <nav aria-label="Tourism shortcuts" className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
            {[
              { label: 'Places', href: '/info/visitor/tourist-spots', icon: MapPin },
              { label: 'Eat', href: '/info/visitor/search?q=food', icon: Utensils },
              { label: 'Events', href: '/info/visitor/events', icon: Calendar },
              { label: 'Map', href: '#map', icon: MapPin, section: 'map' },
              { label: 'Stories', href: '/info/visitor/search?q=travel%20stories', icon: Newspaper },
              { label: 'Emergency', href: '#emergency', icon: PhoneCall },
            ].map(({ label, href, icon: Icon, section }) => (
              <Link
                key={label}
                href={href}
                onClick={section ? () => handleNavClick(section) : undefined}
                className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:min-h-[80px] sm:text-sm"
              >
                <Icon aria-hidden="true" className="h-5 w-5 text-blue-700" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* Daet Connect visitor resources */}
      <section id="discover" className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20 xl:px-10">
        <div className="grid gap-6 lg:grid-cols-[1.06fr_0.94fr] lg:items-stretch lg:gap-8">
          <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_25px_60px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.08)] sm:rounded-3xl sm:p-7 lg:p-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 sm:text-sm">Daet Connect visitor resources</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl lg:text-4xl">Plan your visit with local information.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
              Explore active destination listings, published travel stories and events, and public conversations in one place.
            </p>

            <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4">
              {[
                ['Destination directory', 'Browse active tourist spot listings.'],
                ['Events calendar', 'Find published events and dates.'],
                ['Travel stories', 'Read stories and guides from the platform.'],
                ['Community forum', 'Explore public local discussions.'],
              ].map(([title, text]) => (
                <div key={title} className="flex min-h-11 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 transition duration-300 hover:border-emerald-200 hover:bg-emerald-50/60 sm:rounded-2xl sm:p-4">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm text-emerald-700 sm:h-7 sm:w-7">✓</span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_25px_60px_rgba(15,23,42,0.06)] transition duration-500 hover:shadow-[0_30px_70px_rgba(15,23,42,0.08)] sm:rounded-3xl">
            <img
              src={Daet.src || Daet}
              alt="Daet destination photo"
              className="h-[260px] w-full object-cover transition duration-700 ease-out hover:scale-105 sm:h-[360px] lg:h-full lg:min-h-[320px]"
            />
          </div>
        </div>
      </section>

      {/* Destination discovery */}
      <section className="mx-auto max-w-[1440px] px-4 pb-8 pt-8 sm:px-6 lg:px-8 xl:px-10">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.34fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.06)] sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700 sm:text-xs">Destination discovery</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900">Choose your next step.</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-slate-500">Choose a section to explore published Daet content.</p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {[
                ['stories', 'Read stories', 'Published local travel stories'],
                ['community', 'Ask the community', 'Public discussions from locals and travelers'],
                ['places', 'Choose a place', 'Active destination listings'],
              ].map(([id, label, description]) => (
                <button key={id} type="button" onClick={() => setTripStage(id)} className={`rounded-2xl border p-4 text-left transition ${tripStage === id ? 'border-sky-500 bg-sky-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-sky-300'}`}>
                  <span className="block text-sm font-bold text-slate-900">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(tripStage === 'stories' ? trendingBlogs : tripStage === 'community' ? forumThreads : popularSpots).slice(0, 3).map((item) => (
                <button key={item.id} type="button" onClick={() => tripStage === 'stories' ? handleBlogClick(item.id) : tripStage === 'community' ? handleForumClick(item.id) : handleSpotClick(item.id)} className="min-h-11 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-sky-300 hover:bg-sky-50/50">
                  <span className="line-clamp-2 text-sm font-bold text-slate-900">{item.title || item.name}</span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500">{item.excerpt || item.content || item.description || 'Explore this destination on Daet Connect.'}</span>
                </button>
              ))}
            </div>
          </div>

          <aside className="rounded-3xl bg-slate-950 p-5 text-white shadow-[0_20px_55px_rgba(15,23,42,0.14)] sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">Public community posts</p>
            <div className="mt-4 space-y-3">
              {forumThreads.length ? forumThreads.slice(0, 2).map((thread) => (
                <Link key={thread.id} href={`/info/visitor/forum/${thread.id}`} className="block min-h-11 rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10">
                  <span className="block line-clamp-2 text-sm font-bold text-white">{thread.title}</span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-300">{thread.content}</span>
                </Link>
              )) : (
                <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                  {loading ? 'Loading public discussions…' : 'No public discussions are available right now.'}
                </p>
              )}
            </div>
            <Link href="/info/visitor/forum" className="mt-4 inline-flex min-h-11 w-full items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">
              <span>Browse the forum</span>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-emerald-300" />
            </Link>
          </aside>
        </div>
      </section>

      {/* Upcoming events */}
      <section id="events" className="bg-slate-50 py-10 sm:py-14 lg:py-18">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700 sm:text-xs">Plan your visit</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl lg:text-4xl">Upcoming in Daet</h2>
            </div>
            <Link href="/info/visitor/events" className="text-sm font-bold text-sky-700 hover:text-sky-900">View all events →</Link>
          </div>

          <div className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-lg font-black text-slate-900">Upcoming events</h3>
                <span className="text-xs font-medium text-slate-500">Hover or tap a card to explore</span>
              </div>
              {loading ? (
                <div className="-mx-4 flex gap-3 overflow-hidden px-4 xl:mx-0 xl:px-0">
                  {[1, 2, 3, 4].map((item) => <div key={item} className="h-72 w-[min(84vw,20rem)] flex-shrink-0 animate-pulse rounded-3xl bg-slate-200 xl:w-full" />)}
                </div>
              ) : failedSections.includes('upcoming events') || failedSections.includes('visitor content') ? (
                <p role="status" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Upcoming events could not be loaded. Use the retry button above to try again.</p>
              ) : upcomingEvents.length === 0 ? (
                <p role="status" className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">No upcoming events have been published yet.</p>
              ) : (
                <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 scrollbar-hide xl:mx-0 xl:items-stretch xl:overflow-visible xl:px-0">
                  {upcomingEvents.map((event, index) => {
                    const isActive = activeUpcomingEventId === event.id || (!activeUpcomingEventId && index === 0)
                    const fallbackImages = [bagasbasImage, morgaImage, ElevatedTownPlazaImage, Daet]
                    const eventImage = event.featured_image || fallbackImages[index % fallbackImages.length].src

                    return (
                      <article
                        key={event.id}
                        data-scroll-card
                        onMouseEnter={() => setActiveUpcomingEventId(event.id)}
                        onFocusCapture={() => setActiveUpcomingEventId(event.id)}
                        className={`group relative flex h-[19rem] w-[min(84vw,22rem)] flex-shrink-0 snap-start flex-col overflow-hidden rounded-3xl bg-slate-900 shadow-sm transition-[flex-grow,flex-basis,box-shadow] duration-500 hover:shadow-xl xl:min-w-0 ${isActive ? 'xl:flex-[2]' : 'xl:flex-1'}`}
                      >
                        <img src={eventImage} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/35 to-slate-950/10" />
                        <button
                          type="button"
                          aria-expanded={isActive}
                          onClick={() => setActiveUpcomingEventId(event.id)}
                          className="relative flex min-h-0 flex-1 flex-col items-start justify-end p-4 text-left text-white focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white sm:p-5"
                        >
                          <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur">{event.category || 'Community event'}</span>
                          <span className="mt-3 text-xs font-semibold text-white/80">{formatEventDate(event.start_date)}</span>
                          <span className="mt-1 line-clamp-2 text-lg font-black sm:text-xl">{event.title}</span>
                          {isActive && (
                            <>
                              {(event.location || event.venue) && <span className="mt-2 flex items-center gap-1.5 text-xs text-white/80"><MapPin aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />{event.location || event.venue}</span>}
                              {event.description && <span className="mt-2 line-clamp-3 text-sm leading-5 text-white/80">{event.description}</span>}
                            </>
                          )}
                        </button>
                        <Link href={`/info/visitor/events/${event.id}`} className="relative z-10 inline-flex min-h-11 items-center gap-2 px-4 pb-3 text-sm font-bold text-white transition hover:text-sky-200 sm:px-5">
                          Explore event <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </Link>
                      </article>
                    )
                  })}
                </div>
              )}
          </div>
        </div>
      </section>

      {/* Popular Spots Section */}
      <section id="spots" className="bg-white/80 py-10 sm:py-14 lg:py-20">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="mb-4 flex flex-col gap-2 md:mb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 sm:text-sm">Popular spots</p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-900 sm:text-2xl lg:text-3xl">Must-visit places in Daet</h2>
            </div>
            <Link href="/info/visitor/tourist-spots" className="text-xs font-semibold text-sky-700 transition hover:text-sky-800 sm:text-sm">
              View all destinations →
            </Link>
          </div>

          {/* Search - Mobile Friendly */}
          <div className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search destinations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 placeholder:text-slate-400"
              />
            </div>

            {/* Category Filters - Horizontal Scroll on Mobile */}
            <div className="flex flex-wrap gap-1.5 overflow-x-auto scrollbar-hide pb-1 sm:gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`min-h-11 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition touch-manipulation ${
                    selectedCategory === category
                      ? 'border-sky-700 bg-sky-700 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-700'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="-mx-4 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
              <div className="flex gap-3 sm:contents">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex-shrink-0 w-64 sm:w-auto animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:rounded-3xl">
                    <div className="h-44 bg-slate-200 sm:h-56" />
                    <div className="space-y-2 p-3 sm:p-4">
                      <div className="h-3 w-1/3 rounded bg-slate-200" />
                      <div className="h-5 w-2/3 rounded bg-slate-200" />
                      <div className="h-3 w-full rounded bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : failedSections.includes('destinations') || failedSections.includes('visitor content') ? (
            <div role="status" className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center text-sm text-red-800 sm:rounded-3xl">
              Destination listings could not be loaded. Use the retry button above to try again.
            </div>
          ) : filteredSpots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-600 sm:rounded-3xl">
              No destinations match your current search.
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto scrollbar-hide px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
              <div className="flex gap-3 sm:contents">
                {filteredSpots.map((spot) => (
                  <article 
                    key={spot.id} data-scroll-card
                    onClick={() => handleSpotClick(spot.id)}
                    className="flex-shrink-0 w-[min(82vw,20rem)] snap-start sm:w-auto group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.09)] sm:rounded-3xl cursor-pointer"
                  >
                    <div className="relative h-40 overflow-hidden sm:h-52 lg:h-56 touch-manipulation">
                      <img
                        src={spot.featured_image || spot.images?.[0] || defaultSpotImage}
                        alt={spot.featured_image || spot.images?.[0] ? spot.name : 'Daet tourism destination'}
                        className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-110"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="absolute left-2 top-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur-sm sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[9px]">
                        {spot.category || 'Destination'}
                      </div>
                      {spot.featured && (
                        <div className="absolute right-2 top-2 rounded-full bg-amber-500/80 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur-sm sm:right-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[9px]">
                          Featured
                        </div>
                      )}
                    </div>

                    <div className="p-3 sm:p-5">
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900 sm:text-lg">{spot.name}</h3>
                        {spot.review_count > 0 && (
                          <span className="inline-block flex-shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-semibold text-amber-700 sm:px-2 sm:py-1 sm:text-xs">
                            ★ {Number(spot.rating || 0).toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-sky-700 sm:text-sm">{spot.location}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{spot.description}</p>
                      {spot.visit_count > 0 && (
                        <p className="mt-1.5 text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock size={12} />
                          {spot.visit_count} visits
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Blogs Section */}
      <section id="blogs" className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20 xl:px-10">
        <div className="mb-4 flex flex-col gap-2 md:mb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 sm:text-sm">Trending blogs</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-900 sm:text-2xl lg:text-3xl">Stories and local guides</h2>
          </div>
          <Link href="/info/visitor/search?q=travel%20stories" className="text-xs font-semibold text-amber-700 transition hover:text-amber-800 sm:text-sm">
            Search published stories →
          </Link>
        </div>

        {loading ? (
          <div className="-mx-4 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
            <div className="flex gap-3 sm:contents">
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex-shrink-0 w-64 sm:w-auto animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:rounded-3xl">
                  <div className="h-44 bg-slate-200 sm:h-52" />
                  <div className="space-y-2 p-3 sm:p-4">
                    <div className="h-3 w-1/3 rounded bg-slate-200" />
                    <div className="h-5 w-2/3 rounded bg-slate-200" />
                    <div className="h-3 w-full rounded bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : failedSections.includes('stories') || failedSections.includes('visitor content') ? (
          <div role="status" className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center text-sm text-red-800 sm:rounded-3xl">
            Published stories could not be loaded. Use the retry button above to try again.
          </div>
        ) : trendingBlogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-600 sm:rounded-3xl">
            No published stories are available right now.
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto scrollbar-hide px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
            <div className="flex gap-3 sm:contents">
              {trendingBlogs.map((blog) => (
                <article 
                  key={blog.id} data-scroll-card
                  className="flex-shrink-0 w-[min(82vw,20rem)] snap-start sm:w-auto group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.09)] sm:rounded-3xl"
                >
                  <div 
                    className="overflow-hidden h-44 sm:h-52 cursor-pointer"
                    onClick={() => handleBlogClick(blog.id)}
                  >
                    <img
                      src={blog.featured_image || defaultBlogImage}
                      alt={blog.featured_image ? blog.title : 'Daet tourism destination'}
                      className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="p-3 sm:p-5">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-[10px]">
                      <span>{blog.category || 'Travel'}</span>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1" aria-label="Post likes">
                          <Heart size={10} className="sm:size-3" />
                          {blog.likes || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle size={10} className="sm:size-3" />
                          {blog.comments_count || 0}
                        </span>
                        <span>{formatDate(blog.created_at)}</span>
                      </div>
                    </div>
                    <h3 
                      className="text-base font-bold text-slate-900 sm:text-xl cursor-pointer hover:text-amber-700 transition"
                      onClick={() => handleBlogClick(blog.id)}
                    >
                      {blog.title}
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{blog.excerpt}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <button
                        onClick={() => handleBlogClick(blog.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 transition hover:text-amber-800 sm:mt-4 sm:text-sm"
                      >
                        Read story
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {travelGuides.length > 0 && (
        <section id="guides" aria-labelledby="guides-heading" className="bg-[#fffdf8] py-10 sm:py-14 lg:py-18">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 xl:px-10">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-700 sm:text-xs">Published travel guides</p>
                <h2 id="guides-heading" className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">Ideas for your Daet visit</h2>
              </div>
              <Link href="/info/visitor/search?q=travel%20guides" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-800 transition hover:text-orange-950">
                Find more guides <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
              {travelGuides.map((guide) => (
                <Link key={guide.id} href={`/info/visitor/blog/${guide.id}`} className="group min-h-11 w-[min(84vw,24rem)] flex-shrink-0 snap-start overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg sm:w-auto">
                  <div className="relative h-40 overflow-hidden sm:h-48">
                    <img src={guide.featured_image || defaultBlogImage} alt={guide.featured_image ? guide.title : 'Daet tourism destination'} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-800 backdrop-blur">{guide.category}</span>
                  </div>
                  <div className="p-4 sm:p-5">
                    <h3 className="line-clamp-2 text-lg font-bold text-slate-900">{guide.title}</h3>
                    {guide.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{guide.excerpt}</p>}
                    <span className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-800">Read guide <ArrowRight className="h-4 w-4" /></span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="platform-benefits-heading" className="border-y border-slate-200 bg-white px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 sm:text-xs">One place to plan</p>
            <h2 id="platform-benefits-heading" className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">Useful information for your visit</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Destination directory', text: 'Browse active places and their details.', href: '/info/visitor/tourist-spots', icon: MapPin },
              { title: 'Local events', text: 'See published events and dates.', href: '/info/visitor/events', icon: Calendar },
              { title: 'Travel stories', text: 'Read published stories and guides.', href: '/info/visitor/search?q=travel%20stories', icon: Newspaper },
              { title: 'Community forum', text: 'Explore public local discussions.', href: '/info/visitor/forum', icon: MessageCircle },
            ].map(({ title, text, href, icon: Icon }) => (
              <Link key={title} href={href} className="flex min-h-[88px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm"><Icon aria-hidden="true" className="h-5 w-5" /></span>
                <span><span className="block text-sm font-bold text-slate-900">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{text}</span></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section id="community" className="bg-slate-950 py-10 text-white sm:py-14 lg:py-20">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="mb-4 flex flex-col gap-2 md:mb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300 sm:text-sm">Community forum</p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-white sm:text-2xl lg:text-3xl">Trending conversations</h2>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link href="/info/visitor/forum" className="text-xs font-semibold text-white transition hover:text-emerald-200 sm:text-sm">
                Browse public discussions →
              </Link>
              <Link href="/info/login" className="text-xs font-semibold text-emerald-300 transition hover:text-emerald-200 sm:text-sm">
                Sign in to participate →
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="-mx-4 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
              <div className="flex gap-3 sm:contents">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex-shrink-0 w-64 sm:w-auto animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4 sm:rounded-3xl sm:p-5">
                    <div className="h-3 w-1/3 rounded bg-white/10" />
                    <div className="mt-3 h-5 w-2/3 rounded bg-white/10" />
                    <div className="mt-3 h-12 w-full rounded bg-white/10" />
                  </div>
                ))}
              </div>
            </div>
          ) : failedSections.includes('discussions') || failedSections.includes('visitor content') ? (
            <div role="status" className="rounded-2xl border border-red-200 bg-red-950/60 px-6 py-10 text-center text-sm text-red-100 sm:rounded-3xl">
              Public discussions could not be loaded. Use the retry button above to try again.
            </div>
          ) : forumThreads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center text-slate-400 sm:rounded-3xl">
              No published discussions are available right now.
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto scrollbar-hide px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
              <div className="flex gap-3 sm:contents">
                {forumThreads.map((thread) => (
                  <div 
                    key={thread.id} data-scroll-card
                    className="flex-shrink-0 w-[min(82vw,20rem)] snap-start sm:w-auto rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-emerald-300/40 hover:bg-white/[0.07] sm:rounded-3xl sm:p-5"
                  >
                    <div className="mb-2 flex items-center justify-between text-[8px] uppercase tracking-[0.18em] text-slate-300 sm:text-[10px]">
                      <span>Forum</span>
                      <span>{formatTimeAgo(thread.last_activity_at || thread.created_at)}</span>
                    </div>
                    <h3 
                      className="text-base font-bold text-white sm:text-xl cursor-pointer hover:text-emerald-300 transition"
                      onClick={() => handleForumClick(thread.id)}
                    >
                      {thread.title}
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-slate-300 sm:text-sm sm:leading-6">{thread.content}</p>
                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-slate-300 sm:mt-4 sm:pt-4 sm:text-sm">
                      <span className="flex items-center gap-1.5">
                        <MessageCircle size={12} className="sm:size-14" />
                        {thread.reply_count || 0} replies
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleReply(e, thread.id)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-emerald-300 hover:bg-emerald-500/10 transition"
                        >
                          <Reply size={12} />
                          <span className="text-xs">Reply</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleForumClick(thread.id)
                          }}
                          className="font-semibold text-emerald-300 hover:text-emerald-200 transition"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Daet map */}
      {visitorReviews.length > 0 && (
        <section aria-labelledby="visitor-reviews-heading" className="bg-white py-10 sm:py-14 lg:py-18">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 xl:px-10">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 sm:text-xs">Visitor feedback</p>
                <h2 id="visitor-reviews-heading" className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">Notes from visitors</h2>
              </div>
              <Link href="/info/visitor/tourist-spots" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-amber-800 transition hover:text-amber-950">
                Explore reviewed destinations <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
              {visitorReviews.map((review) => {
                const reviewerName = String(review.info_users?.full_name || '').trim() || 'Visitor'
                return (
                  <article key={review.id} className="w-[min(84vw,24rem)] flex-shrink-0 snap-start rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:w-auto">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-sm font-bold text-sky-800">
                          {review.info_users?.profile_image_url ? (
                            <img src={review.info_users.profile_image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : reviewerName[0]?.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{reviewerName}</p>
                          <p className="text-xs text-slate-500">{formatDate(review.created_at)}</p>
                        </div>
                      </div>
                      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800" aria-label={`${review.rating} out of 5 stars`}>
                        <Star aria-hidden="true" className="h-3.5 w-3.5 fill-current" /> {review.rating}/5
                      </span>
                    </div>
                    <p className="mt-4 line-clamp-5 text-sm leading-6 text-slate-700">{review.review_text}</p>
                    <Link href={`/info/visitor/tourist-spots/${review.attraction_id}`} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-800 hover:text-sky-950">
                      View destination <ArrowRight className="h-4 w-4" />
                    </Link>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <section id="map" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#f5fbff_0%,#edf7ff_28%,#ffffff_100%)] shadow-[0_25px_70px_rgba(14,116,144,0.12)] sm:rounded-3xl lg:rounded-[2.5rem]">
          <div className="grid gap-0 lg:min-h-[520px] lg:grid-cols-[0.74fr_1.26fr] lg:items-stretch">
            <div className="flex flex-col justify-between border-b border-slate-200 bg-[linear-gradient(180deg,#f8fcff_0%,#eef8ff_100%)] p-4 sm:p-6 lg:border-b-0 lg:border-r lg:p-8">
              <div>
                <div className="inline-flex items-center rounded-full border border-sky-200 bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.25em] text-sky-700 shadow-sm sm:px-4 sm:py-2 sm:text-[10px]">
                  Daet Map
                </div>

                <h3 className="mt-4 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">Explore Daet</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-[15px]">
                  Discover the coastal heart of Camarines Norte, from surf-friendly shores to lively town landmarks and scenic local spots.
                </p>

                <div className="mt-5 space-y-3 sm:mt-6">
                  {popularSpots.slice(0, 4).map((spot) => (
                    <Link key={spot.id} href={`/info/visitor/tourist-spots/${spot.id}`} className="block min-h-11 rounded-xl border border-sky-100 bg-white/90 p-3 shadow-[0_10px_24px_rgba(14,116,144,0.06)] ring-1 ring-sky-100/60 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(14,116,144,0.08)] sm:rounded-2xl">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm"><MapPin aria-hidden="true" className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 sm:text-[15px]">{spot.name}</p>
                          <p className="line-clamp-2 text-[11px] leading-5 text-slate-600 sm:text-xs">{spot.location || spot.category}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                  {!popularSpots.length && !loading && (
                    <p className="rounded-xl border border-dashed border-sky-200 bg-white/80 p-3 text-xs text-slate-600">No active destination listings are available right now.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="relative bg-white p-2 sm:p-3">
              <div className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner sm:rounded-2xl lg:rounded-3xl">
                <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/85 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-700 shadow-lg backdrop-blur-sm sm:left-4 sm:top-4 sm:px-3 sm:text-[10px]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Daet
                </div>

                <iframe
                  title="Daet Map - Camarines Norte, Bicol, Philippines"
                  src="https://www.google.com/maps?q=Daet%20Camarines%20Norte%20Bicol%20Philippines&z=12&output=embed"
                  className="h-[260px] w-full border-0 sm:h-[340px] lg:h-full lg:min-h-[460px]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
        <div className="relative isolate overflow-hidden rounded-2xl bg-slate-950 p-5 text-white shadow-lg transition duration-300 hover:shadow-xl sm:rounded-3xl sm:p-7 lg:p-10">
          <img src={Daet.src || Daet} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/90 via-slate-900/75 to-emerald-950/55" />
          <div className="flex flex-col items-start gap-4 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-8">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[8px] font-bold uppercase tracking-[0.2em] text-sky-100 sm:mb-3 sm:text-[10px]">
                <Newspaper size={14} className="sm:size-4" />
                Ready to explore?
              </div>
              <h2 className="text-lg font-black sm:text-2xl lg:text-3xl">Discover Daet with the community</h2>
              <p className="mt-1 text-xs leading-5 text-sky-50 sm:mt-2 sm:text-sm sm:leading-6">
                Join travelers and locals to find hidden gems and authentic experiences.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:justify-end sm:gap-3">
              <Link href="/info/visitor/tourist-spots" className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-center text-sm font-bold text-sky-800 transition duration-300 hover:bg-slate-100 touch-manipulation">
                Explore destinations
              </Link>
              <Link href="/info/register" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/50 bg-white/10 px-5 text-center text-sm font-semibold text-white transition duration-300 hover:bg-white/20 touch-manipulation">
                Join now
              </Link>
              <Link href="/info/login" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/40 bg-transparent px-5 text-center text-sm font-semibold text-white transition duration-300 hover:bg-white/10 touch-manipulation">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer utility: emergency contacts */}
      <section id="emergency" className="border-t border-red-200 bg-red-50 py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-700 sm:text-xs">Footer utility · urgent assistance</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">Daet emergency hotlines</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-600">Keep these contacts close while exploring. Tap a number to call from your phone.</p>
          </div>

          <div className="-mx-4 mt-6 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory px-4 sm:mx-0 sm:grid sm:gap-3 sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            <div className="flex gap-3 sm:contents">
            {[
              { name: 'LGU Daet MHO', detail: 'CHEMS · 24/7 Rescue', numbers: ['0960-861-8245'], tone: 'border-red-200 bg-white' },
              { name: 'MDRRMO Daet', detail: 'Disaster risk reduction and response', numbers: ['0992-445-8736', '0912-855-5551'], tone: 'border-red-200 bg-white' },
              { name: 'PNP Municipal Police Station', detail: 'Police assistance', numbers: ['0998-598-5954'], tone: 'border-blue-200 bg-white' },
              { name: 'BFP Daet Central Fire Station', detail: 'Fire and rescue assistance', numbers: ['0939-933-7795', '0920-989-5892'], tone: 'border-orange-200 bg-white' },
            ].map((contact) => (
              <div key={contact.name} className={`w-[min(82vw,20rem)] flex-shrink-0 snap-start rounded-2xl border p-4 shadow-sm sm:w-auto ${contact.tone}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700"><PhoneCall className="h-4 w-4" /></div>
                  <div className="min-w-0"><h3 className="text-sm font-black text-slate-900">{contact.name}</h3><p className="mt-1 text-xs text-slate-500">{contact.detail}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contact.numbers.map((number) => <a key={number} href={`tel:${number.replaceAll('-', '')}`} className="inline-flex min-h-11 items-center rounded-full bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-red-700">{number}</a>)}
                </div>
              </div>
            ))}

            <div className="w-[min(82vw,20rem)] flex-shrink-0 snap-start rounded-2xl border border-slate-300 bg-slate-900 p-4 text-white shadow-sm sm:col-span-2 sm:w-auto lg:col-span-2">
              <div className="flex items-start gap-3"><div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-sky-300"><Radio className="h-4 w-4" /></div><div><h3 className="text-sm font-black">Radio Frequency</h3><p className="mt-1 text-xs text-slate-300">For coordinated local emergency communication</p></div></div>
              <p className="mt-4 text-2xl font-black tracking-wide text-white">138.125 MHz</p>
            </div>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-red-800">In a life-threatening emergency, call the appropriate service immediately and provide your exact location.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-6 border-t border-slate-200 bg-slate-950 text-slate-300 sm:mt-8">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 sm:py-7 sm:gap-6 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr] lg:gap-10 lg:py-10 lg:px-8">
          <div>
            <div className="flex items-center gap-2 sm:gap-3">
              <img src="/logo.png" alt="DAET Connect logo" className="h-8 w-8 rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl" />
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-white sm:text-sm">DAET</p>
                <p className="text-[7px] uppercase tracking-[0.2em] text-slate-400 sm:text-[10px]">Camarines Norte</p>
              </div>
            </div>
            <p className="mt-2 max-w-md text-xs leading-5 text-slate-300 sm:mt-3 sm:text-sm sm:leading-6">
              DAET Connect is a tourism and community platform serving Daet, Camarines Norte, Philippines. It provides local discovery, event updates, community discussions, and practical travel information.
            </p>
            <div className="mt-3 text-[10px] leading-5 text-slate-400 sm:text-xs">
              <p><span className="font-semibold text-slate-200">Business details:</span> DAET Connect · tourism and community services · Daet, Camarines Norte, Philippines.</p>
              <p>Contact details and operator information should be confirmed with the local business entity before public commercial launch.</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white sm:text-sm">Explore</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-300 sm:mt-3 sm:space-y-2 sm:text-sm">
              <li><a href="#discover" className="inline-flex min-h-11 items-center transition hover:text-white">Discover</a></li>
              <li><a href="#spots" className="inline-flex min-h-11 items-center transition hover:text-white">Popular spots</a></li>
              <li><a href="#events" className="inline-flex min-h-11 items-center transition hover:text-white">Upcoming events</a></li>
              <li><a href="#blogs" className="inline-flex min-h-11 items-center transition hover:text-white">Travel blogs</a></li>
              <li><a href="#community" className="inline-flex min-h-11 items-center transition hover:text-white">Community forum</a></li>
              <li><a href="#emergency" className="inline-flex min-h-11 items-center transition hover:text-white">Emergency contacts</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white sm:text-sm">Account</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-300 sm:mt-3 sm:space-y-2 sm:text-sm">
              {user ? (
                <li><Link href="/info/user/dashboard" className="inline-flex min-h-11 items-center transition hover:text-white">Dashboard</Link></li>
              ) : (
                <>
                  <li><Link href="/info/login" className="inline-flex min-h-11 items-center transition hover:text-white">Login</Link></li>
                  <li><Link href="/info/register" className="inline-flex min-h-11 items-center transition hover:text-white">Create account</Link></li>
                </>
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white sm:text-sm">Legal</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-300 sm:mt-3 sm:space-y-2 sm:text-sm">
              <li><Link href="/info/legal/privacy-policy" className="inline-flex min-h-11 items-center transition hover:text-white">Privacy policy</Link></li>
              {!cookieConsent && (
                <li><button type="button" onClick={() => window.dispatchEvent(new Event('daet-open-cookie-settings'))} className="inline-flex min-h-11 items-center text-left transition hover:text-white">Privacy settings</button></li>
              )}
              <li><Link href="/info/legal/terms-and-conditions" className="inline-flex min-h-11 items-center transition hover:text-white">Terms and conditions</Link></li>
              <li><Link href="/info/legal/cookie-policy" className="inline-flex min-h-11 items-center transition hover:text-white">Cookie policy</Link></li>
              <li><Link href="/info/legal/refund-policy" className="inline-flex min-h-11 items-center transition hover:text-white">Refund policy</Link></li>
              <li><Link href="/info/legal/form-consent" className="inline-flex min-h-11 items-center transition hover:text-white">Form consent</Link></li>
              <li><Link href="/info/legal/accessibility" className="inline-flex min-h-11 items-center transition hover:text-white">Accessibility</Link></li>
              <li><Link href="/info/legal/risk-assessment" className="inline-flex min-h-11 items-center transition hover:text-white">Risk assessment</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 py-2.5 text-center text-[8px] text-slate-400 sm:text-[10px]">
          © 2026 DAET Connect. Review all legal notices before public commercial launch and confirm local compliance with the applicable Philippine rules.
        </div>
      </footer>

      <nav aria-label="Mobile primary navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {[
            { label: 'Home', href: '#top', icon: Home, section: 'discover' },
            { label: 'Explore', href: '/info/visitor/tourist-spots', icon: MapPin, section: 'spots' },
            { label: 'Map', href: '#map', icon: MapPin, section: 'map' },
            { label: 'Profile', href: user ? '/info/user/profile' : '/info/login', icon: UserRound },
          ].map(({ label, href, icon: Icon, section }) => (
            <Link
              key={label}
              href={href}
              onClick={section ? () => handleNavClick(section) : undefined}
              aria-current={section && activeSection === section ? 'location' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 px-2 py-1 text-[10px] font-semibold focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600 ${
                section && activeSection === section ? 'text-blue-700' : 'text-slate-600 hover:text-blue-700'
              }`}
            >
              <Icon aria-hidden="true" className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>

    </VisitorScrollEffects>
  )
}