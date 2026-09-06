'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, MapPin, Sparkles, Plane, Newspaper, Menu, X, Star, Calendar, ChevronLeft, ChevronRight, Megaphone, MessageCircle, Heart, Clock, Lock, ThumbsUp, Bookmark, Reply, PhoneCall, Radio } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import bagasbasImage from '../assets/images/bagasbasbeach.webp'
import morgaImage from '../assets/images/morga.jpg'
import ElevatedTownPlazaImage from '../assets/images/elevated-town-plaza.jpg'
import Daet from '../assets/images/daet.jpg'

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
  const [user, setUser] = useState(null)
  const [popularSpots, setPopularSpots] = useState([])
  const [trendingBlogs, setTrendingBlogs] = useState([])
  const [forumThreads, setForumThreads] = useState([])
  const [featuredEvents, setFeaturedEvents] = useState([])
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [heroCounts, setHeroCounts] = useState({ beaches: null, stories: null, guides: null })
  const [loading, setLoading] = useState(true)
  const [contentError, setContentError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [activeSection, setActiveSection] = useState('discover')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [categories, setCategories] = useState(['All'])
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authAction, setAuthAction] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [tripStage, setTripStage] = useState('dreaming')

  const navigationItems = [
    { id: 'discover', label: 'Discover' },
    { id: 'spots', label: 'Spots' },
    { id: 'events', label: 'Events' },
    { id: 'blogs', label: 'Blogs' },
    { id: 'community', label: 'Forums' },
  ]

  const [activeHeroSlide, setActiveHeroSlide] = useState(0)

  const handleNavClick = (sectionId) => {
    setActiveSection(sectionId)
    setMobileMenuOpen(false)
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
      router.push(role === 'admin' ? '/admin/dashboard' : '/user/dashboard')
    }
  }, [router])

  useEffect(() => {
    const loadContent = async () => {
      try {
        setLoading(true)
        setContentError('')

        // Fetch tourist spots
        const { data: spots, error: spotsError } = await supabase
          .from('info_tourist_spots')
          .select('*')
          .eq('status', 'active')
          .order('rating', { ascending: false })
          .limit(6)

        if (!spotsError && spots?.length) {
          setPopularSpots(spots)
          const uniqueCategories = ['All', ...new Set(spots.map(spot => spot.category).filter(Boolean))]
          setCategories(uniqueCategories)
        }

        // Fetch blogs
        const { data: blogs, error: blogsError } = await supabase
          .from('info_blogs')
          .select('id, title, excerpt, featured_image, category, created_at, views, likes, comments_count, slug')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(3)

        if (!blogsError && blogs?.length) {
          setTrendingBlogs(blogs)
        }

        // Fetch forum threads
        const { data: threads, error: threadsError } = await supabase
          .from('forum_threads')
          .select('id, title, content, reply_count, created_at, last_activity_at, created_by, category_id')
          .eq('status', 'published')
          .order('last_activity_at', { ascending: false })
          .limit(3)

        if (!threadsError && threads?.length) {
          setForumThreads(threads)
        }

        // Fetch featured events
        const { data: events, error: eventsError } = await supabase
          .from('info_events')
          .select('*')
          .eq('status', 'published')
          .eq('featured', true)
          .order('start_date', { ascending: true })
          .limit(3)

        if (!eventsError && events?.length) {
          setFeaturedEvents(events)
        }

        const today = new Date().toISOString().slice(0, 10)
        const { data: upcoming, error: upcomingError } = await supabase
          .from('info_events')
          .select('id, title, description, location, venue, start_date, end_date, start_time, category, featured_image, is_free, ticket_price')
          .eq('status', 'published')
          .gte('start_date', today)
          .order('start_date', { ascending: true })
          .limit(12)

        if (!upcomingError) {
          setUpcomingEvents(upcoming || [])
        }

        const { data: noticeData, error: noticeError } = await supabase
          .from('info_announcements')
          .select('id, title, content, announcement_type, audience, priority, image_url, published_at, expires_at')
          .eq('status', 'published')
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('priority', { ascending: false })
          .order('published_at', { ascending: false })
          .limit(4)

        if (!noticeError) {
          setAnnouncements(noticeData || [])
        }

        const [{ count: beachCount }, { count: storyCount }, { count: guideCount }] = await Promise.all([
          supabase
            .from('info_tourist_spots')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .ilike('category', 'beach'),
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

        setHeroCounts({
          beaches: beachCount ?? 0,
          stories: storyCount ?? 0,
          guides: guideCount ?? 0,
        })

      } catch (error) {
        console.error('Visitor page content load failed:', error)
        setContentError('Some content could not be loaded. Check your connection and refresh the page.')
      } finally {
        setLoading(false)
      }
    }

    loadContent()
  }, [])

  const heroStats = [
    { label: 'Beaches', value: heroCounts.beaches === null ? '—' : `${heroCounts.beaches}+` },
    { label: 'Local stories', value: heroCounts.stories === null ? '—' : `${heroCounts.stories}+` },
    { label: 'Travel guides', value: heroCounts.guides === null ? '—' : `${heroCounts.guides}+` },
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

  const defaultSpotImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80'
  const defaultBlogImage = 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80'

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1))]
  }, [calendarMonth])

  const eventsForDay = (day) => {
    if (!day) return []
    return upcomingEvents.filter((event) => {
      const start = new Date(`${event.start_date}T00:00:00`)
      const end = new Date(`${event.end_date || event.start_date}T23:59:59`)
      return day >= start && day <= end
    })
  }

  const eventMonthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Handle authenticated actions
  const handleAuthRequired = (action) => {
    if (!user) {
      setAuthAction(action)
      setShowAuthModal(true)
      return false
    }
    return true
  }

  const handleBlogClick = (blogId) => {
    router.push(`/blog/${blogId}`)
  }

  const handleForumClick = (threadId) => {
    router.push(`/forum/${threadId}`)
  }

  const handleSpotClick = (spotId) => {
    if (typeof window !== 'undefined') {
      const viewedSpots = JSON.parse(window.localStorage.getItem('daet_visitor_viewed_spots') || '[]')
      const nextViewedSpots = [...new Set([...viewedSpots, spotId])]
      window.localStorage.setItem('daet_visitor_viewed_spots', JSON.stringify(nextViewedSpots))
      if (!user && nextViewedSpots.length >= 3) {
        setAuthAction('plan_trip')
        setShowAuthModal(true)
      }
    }
    router.push(`/tourist-spots/${spotId}`)
  }

  const handleLike = (e, type, id) => {
    e.stopPropagation()
    if (!user) {
      setAuthAction('like')
      setShowAuthModal(true)
      return
    }
    // Handle like logic here
    setToastMessage('Feature coming soon!')
    setTimeout(() => setToastMessage(''), 3000)
  }

  const handleBookmark = (e, type, id) => {
    e.stopPropagation()
    if (!user) {
      setAuthAction('bookmark')
      setShowAuthModal(true)
      return
    }
    // Handle bookmark logic here
    setToastMessage('Feature coming soon!')
    setTimeout(() => setToastMessage(''), 3000)
  }

  const handleReply = (e, threadId) => {
    e.stopPropagation()
    if (!user) {
      setAuthAction('reply')
      setShowAuthModal(true)
      return
    }
    router.push(`/forum/${threadId}`)
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] text-slate-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg animate-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

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
                {authAction === 'plan_trip' && 'You have found a few places worth visiting. Create a free account to start planning your itinerary.'}
                {!authAction && 'You need to be signed in to interact with this content.'}
              </p>
              <div className="mt-6 flex w-full flex-col gap-2">
                <Link
                  href="/login"
                  className="rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
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

      {/* Hero Section */}
      <section className="relative isolate overflow-hidden">
        {heroCarouselSlides.map((slide, index) => (
          <div
            key={slide.title}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-out"
            style={{
              backgroundImage: `url('${slide.image}')`,
              opacity: index === activeHeroSlide ? 0.55 : 0,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.35),_transparent_35%),linear-gradient(90deg,rgba(15,23,42,0.82)_0%,rgba(8,47,73,0.78)_42%,rgba(6,78,59,0.7)_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:44px_44px]" />

        <div className="relative mx-auto max-w-[1440px] px-3 pb-10 pt-2 sm:px-6 sm:pb-16 sm:pt-3 lg:px-8 xl:px-10">
          {/* Header */}
          <header className="relative sticky top-2 z-40 mb-5 rounded-[22px] border border-white/20 bg-white/10 px-3 py-2 shadow-[0_20px_50px_rgba(15,23,42,0.15)] backdrop-blur-xl sm:mb-10 sm:rounded-full sm:px-6 sm:py-2.5">
            <div className="grid items-center gap-2 sm:gap-4 md:grid-cols-[auto_1fr_auto]">
              <div className="flex w-full items-center gap-2 sm:gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 p-1 shadow-lg shadow-sky-900/20 ring-1 ring-white/20 sm:h-11 sm:w-11">
                  <img src="/logo.png" alt="Daet tourism logo" className="h-full w-full rounded-xl object-cover" />
                </div>
                <div>
                  <p className="text-[10px] font-black tracking-[0.24em] text-white/90 sm:text-sm">DAET</p>
                  <p className="text-[7px] font-medium uppercase tracking-[0.22em] text-sky-100/90 sm:text-[10px]">Camarines Norte</p>
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
                  <Link href="/user/dashboard" className="hidden rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-900 transition hover:bg-slate-100 sm:inline-flex sm:px-4 sm:py-2 sm:text-sm">
                    Dashboard
                  </Link>
                ) : (
                  <Link href="/login" className="hidden rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-900 transition hover:bg-slate-100 sm:inline-flex sm:px-4 sm:py-2 sm:text-sm">
                    Sign in
                  </Link>
                )}
              </div>
            </div>

            {mobileMenuOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-2xl border border-white/15 bg-slate-950/75 shadow-[0_18px_40px_rgba(15,23,42,0.22)] backdrop-blur-xl md:hidden">
                <nav className="flex flex-col gap-0.5 p-2">
                  {navigationItems.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={() => handleNavClick(item.id)}
                      className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                        activeSection === item.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-100 hover:bg-white/10 hover:text-white'
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
                      <Link href="/user/dashboard" className="rounded-xl bg-white px-3 py-2 text-center text-xs font-semibold text-slate-900 transition hover:bg-slate-100">
                        Dashboard
                      </Link>
                    ) : (
                      <>
                        <Link href="/login" className="rounded-xl bg-white px-3 py-2 text-center text-xs font-semibold text-slate-900 transition hover:bg-slate-100">
                          Sign in
                        </Link>
                        <Link href="/register" className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-white/10">
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
                onClick={() => window.location.reload()}
                className="flex-shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                Refresh
              </button>
            </div>
          )}

          {/* Hero Content */}
          <div className="grid gap-5 lg:grid-cols-[1.18fr_0.82fr] lg:items-end lg:gap-10 xl:gap-12">
            <div className="py-1 sm:py-6 lg:py-10">
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[7px] font-semibold uppercase tracking-[0.26em] text-sky-100 backdrop-blur-sm sm:px-3 sm:py-1.5 sm:text-[10px]">
                <Sparkles size={10} className="sm:size-3" />
                A local field guide to Daet
              </span>

              <h1 className="mt-2 max-w-[19rem] text-[2rem] font-black leading-[1.05] tracking-[-0.04em] text-white sm:max-w-none sm:text-4xl lg:text-5xl xl:text-6xl">
                Take the long way through Daet.
              </h1>

              <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-100/90 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                Start with the shoreline, stay for the stories, and let local voices shape the rest of your day in Camarines Norte.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:gap-3">
                <Link href="/register" className="rounded-full bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 px-3 py-3 text-center text-xs font-bold text-slate-900 shadow-[0_18px_40px_rgba(251,191,36,0.35)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(251,191,36,0.45)] sm:px-6 sm:py-3 sm:text-sm">
                  Create account
                </Link>
                <Link href="/login" className="rounded-full border border-white/35 bg-white/5 px-3 py-3 text-center text-xs font-semibold text-white backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:bg-white/10 sm:px-6 sm:py-3 sm:text-sm">
                  Explore now
                </Link>
              </div>

              {/* Mobile Stats - Horizontal Scroll */}
              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-4">
                  {heroStats.map((item) => (
                    <div key={item.label} className="min-w-0 rounded-2xl border border-white/15 bg-white/10 p-2.5 backdrop-blur-sm transition duration-300 hover:bg-white/15 sm:p-4">
                      <p className="text-lg font-black leading-none text-white sm:text-2xl">{item.value}</p>
                      <p className="mt-1 line-clamp-2 text-[8px] font-semibold uppercase leading-3 tracking-[0.14em] text-sky-100 sm:text-[10px] sm:leading-normal sm:tracking-[0.22em]">{item.label}</p>
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
                      <Link key={ev.id} href={`/events/${ev.id}`} className="block w-[min(78vw,18rem)] flex-shrink-0 snap-start rounded-2xl bg-white/15 p-3.5 text-white border border-white/10 backdrop-blur-sm hover:bg-white/20 transition sm:w-auto sm:rounded-2xl sm:p-4">
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

            {/* Desktop Hero Image */}
            <div className="hidden lg:block rounded-2xl border border-white/20 bg-white/10 p-2 shadow-[0_35px_80px_rgba(15,23,42,0.28)] backdrop-blur-sm transition duration-500 hover:scale-[1.01]">
              <div className="relative overflow-hidden rounded-2xl">
                <img
                  src={heroCarouselSlides[activeHeroSlide].image}
                  alt={heroCarouselSlides[activeHeroSlide].title}
                  className="h-[360px] w-full object-cover transition duration-1000 ease-out hover:scale-105 lg:h-[450px]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/10 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why visit Daet */}
      <section id="discover" className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20 xl:px-10">
        <div className="grid gap-6 lg:grid-cols-[1.06fr_0.94fr] lg:items-center lg:gap-8">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_25px_60px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.08)] sm:rounded-3xl sm:p-7 lg:p-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 sm:text-sm">Why visit Daet</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl lg:text-4xl">A coastal experience with lasting character.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
              Daet blends beach life, local culture, and outdoor adventure in a way that feels both easygoing and memorable. From surf-ready shores to countryside escapes, every visit offers something deeply local and unmistakably scenic.
            </p>

            <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4">
              {[
                'Sunset views over Bagasbas Beach',
                'Island hopping adventures nearby',
                'Fresh seafood and local flavors',
                'Community festivals and stories',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 transition duration-300 hover:border-emerald-200 hover:bg-emerald-50/60 sm:rounded-2xl sm:p-4">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm text-emerald-700 sm:h-7 sm:w-7">✓</span>
                  <p className="text-sm font-medium text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_25px_60px_rgba(15,23,42,0.06)] transition duration-500 hover:shadow-[0_30px_70px_rgba(15,23,42,0.08)] sm:rounded-3xl">
            <img
              src={Daet.src || Daet}
              alt="Camarines Norte scenery"
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
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900">What are you doing?</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-slate-500">Choose a travel mood and we&apos;ll put the most useful Daet content first.</p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {[
                ['dreaming', 'Dreaming', 'Photo essays and local stories'],
                ['planning', 'Planning', 'Itineraries, budgets, and advice'],
                ['booking', 'Booking', 'Top-rated spots and entry fees'],
              ].map(([id, label, description]) => (
                <button key={id} type="button" onClick={() => setTripStage(id)} className={`rounded-2xl border p-4 text-left transition ${tripStage === id ? 'border-sky-500 bg-sky-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-sky-300'}`}>
                  <span className="block text-sm font-bold text-slate-900">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(tripStage === 'dreaming' ? trendingBlogs : tripStage === 'planning' ? forumThreads : popularSpots).slice(0, 3).map((item) => (
                <button key={item.id} type="button" onClick={() => tripStage === 'dreaming' ? handleBlogClick(item.id) : tripStage === 'planning' ? handleForumClick(item.id) : handleSpotClick(item.id)} className="rounded-2xl border border-slate-200 p-3 text-left transition hover:border-sky-300 hover:bg-sky-50/50">
                  <span className="line-clamp-2 text-sm font-bold text-slate-900">{item.title || item.name}</span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500">{item.excerpt || item.content || item.description || 'Explore this destination on Daet Connect.'}</span>
                </button>
              ))}
            </div>
          </div>

          <aside className="rounded-3xl bg-slate-950 p-5 text-white shadow-[0_20px_55px_rgba(15,23,42,0.14)] sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">Live from the community</p>
            <div className="mt-4 space-y-4 text-sm">
              <p><span className="font-bold text-emerald-300">Maria</span> just asked about getting to Bagasbas Beach.</p>
              <p><span className="font-bold text-amber-300">John</span> rated a Camarines Norte landmark 5 stars.</p>
              <p><span className="font-bold text-sky-300">Local guides</span> are sharing new weekend ideas.</p>
            </div>
            <button type="button" onClick={() => handleAuthRequired('plan_trip')} className="mt-6 flex w-full items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-left text-sm font-semibold transition hover:bg-white/15">
              <span><span className="block text-white">Trip planner</span><span className="mt-1 block text-xs font-normal text-slate-300">Drop a spot here to build your itinerary.</span></span>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-emerald-300" />
            </button>
          </aside>
        </div>
      </section>

      {/* Daet Field Guide */}
      <section className="border-b border-slate-200 bg-[#fffdf8] py-10 sm:py-14 lg:py-18">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-700 sm:text-xs">Your Daet field guide</p>
              <h2 className="mt-2 max-w-2xl text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl lg:text-4xl">Choose a rhythm for the day.</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-600">A little sun, a little history, a good meal, and a conversation that makes you want to come back.</p>
          </div>

          <div className="-mx-4 mt-6 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory px-4 sm:mx-0 sm:grid sm:gap-3 sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            <div className="flex gap-3 sm:contents">
            {[
              { title: 'Coast', text: 'Follow the breeze to surf, sunsets, and open water.', image: bagasbasImage.src || bagasbasImage, href: '/tourist-spots', tone: 'from-sky-950/80' },
              { title: 'Character', text: 'Find landmarks and stories that give the town its shape.', image: morgaImage.src || morgaImage, href: '/tourist-spots', tone: 'from-amber-950/80' },
              { title: 'Taste', text: 'Make room for local tables, cafés, and the next good stop.', image: ElevatedTownPlazaImage.src || ElevatedTownPlazaImage, href: '/tourist-spots', tone: 'from-orange-950/80' },
              { title: 'People', text: 'Ask the community what is worth seeing after the guidebook ends.', image: Daet.src || Daet, href: '#community', tone: 'from-emerald-950/80' },
            ].map((path) => (
              <Link key={path.title} href={path.href} className="group relative min-h-[220px] w-[min(82vw,20rem)] flex-shrink-0 snap-start overflow-hidden rounded-[24px] border border-slate-200 bg-slate-900 shadow-sm sm:w-auto">
                <img src={path.image} alt={path.title} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className={`absolute inset-0 bg-gradient-to-t ${path.tone} via-slate-950/20 to-transparent`} />
                <div className="relative flex min-h-[220px] flex-col justify-end p-5 text-white">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">Start here</span>
                  <h3 className="mt-1 text-2xl font-black">{path.title}</h3>
                  <p className="mt-1 max-w-[18rem] text-xs leading-5 text-white/80">{path.text}</p>
                  <span className="mt-4 text-xs font-bold text-white transition group-hover:translate-x-1">Open the guide →</span>
                </div>
              </Link>
            ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[24px] border border-orange-200 bg-orange-50 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-800">Today in Daet</p><h3 className="mt-1 text-xl font-black text-slate-900">What is moving locally</h3></div>
                <Calendar className="h-5 w-5 text-orange-700" />
              </div>
              <div className="-mx-5 mt-4 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory px-5 sm:mx-0 sm:grid sm:gap-2 sm:grid-cols-3 sm:overflow-visible sm:px-0">
                <div className="flex gap-2 sm:contents">
                  <Link href={featuredEvents[0] ? `/events/${featuredEvents[0].id}` : '#spots'} className="w-[min(72vw,15rem)] flex-shrink-0 snap-start rounded-2xl bg-white/75 p-3 transition hover:bg-white sm:w-auto"><span className="text-[10px] font-bold uppercase tracking-wide text-orange-700">Events</span><span className="mt-1 block line-clamp-2 text-sm font-bold text-slate-900">{featuredEvents[0]?.title || 'Find the next local event'}</span></Link>
                  <Link href={trendingBlogs[0] ? `/blog/${trendingBlogs[0].id}` : '#blogs'} className="w-[min(72vw,15rem)] flex-shrink-0 snap-start rounded-2xl bg-white/75 p-3 transition hover:bg-white sm:w-auto"><span className="text-[10px] font-bold uppercase tracking-wide text-orange-700">Latest story</span><span className="mt-1 block line-clamp-2 text-sm font-bold text-slate-900">{trendingBlogs[0]?.title || 'Read the latest travel story'}</span></Link>
                  <Link href={forumThreads[0] ? `/forum/${forumThreads[0].id}` : '#community'} className="w-[min(72vw,15rem)] flex-shrink-0 snap-start rounded-2xl bg-white/75 p-3 transition hover:bg-white sm:w-auto"><span className="text-[10px] font-bold uppercase tracking-wide text-orange-700">Local pulse</span><span className="mt-1 block line-clamp-2 text-sm font-bold text-slate-900">{forumThreads[0]?.title || 'See what travelers are asking'}</span></Link>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-[24px] bg-slate-950 p-5 text-white sm:p-6">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">Travel well</p><h3 className="mt-1 text-xl font-black">Leave room for the unplanned stop.</h3><p className="mt-2 text-sm leading-6 text-slate-300">Use the map, check the community, and keep your favorite places close as you explore.</p></div>
              <Link href="/tourist-spots" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-sky-300 hover:text-white">Browse the destination map <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Events and announcements */}
      <section id="events" className="bg-slate-50 py-10 sm:py-14 lg:py-18">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700 sm:text-xs">Plan your visit</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl lg:text-4xl">Upcoming in Daet</h2>
            </div>
            <Link href="/events" className="text-sm font-bold text-sky-700 hover:text-sky-900">View all events →</Link>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Event calendar</p><h3 className="mt-1 text-xl font-black text-slate-900">{eventMonthLabel}</h3></div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-slate-400 sm:gap-2 sm:text-[10px]">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day} className="py-2">{day}</span>)}
                {calendarDays.map((day, index) => {
                  const dayEvents = eventsForDay(day)
                  return <div key={day ? day.toISOString() : `blank-${index}`} className={`min-h-12 rounded-lg border p-0.5 text-left sm:min-h-16 sm:rounded-xl sm:p-1 ${day ? 'border-slate-100 bg-slate-50' : 'border-transparent bg-transparent'}`}>
                    {day && <><span className="text-[10px] font-bold text-slate-700 sm:text-xs">{day.getDate()}</span><div className="mt-1 space-y-1">{dayEvents.slice(0, 2).map((event) => <Link key={event.id} href={`/events/${event.id}`} className="block truncate rounded bg-sky-100 px-0.5 py-0.5 text-[8px] font-bold text-sky-800 hover:bg-sky-200 sm:px-1 sm:text-[9px]">{event.title}</Link>)}</div></>}
                  </div>
                })}
              </div>
              {upcomingEvents.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">No upcoming events have been published yet.</p>}
            </div>

            <div className="space-y-5">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Next up</p><h3 className="mt-1 text-xl font-black text-slate-900">Save the date</h3></div><Calendar className="h-5 w-5 text-amber-600" /></div>
                <div className="mt-4 space-y-3">{upcomingEvents.slice(0, 3).map((event) => <Link key={event.id} href={`/events/${event.id}`} className="flex gap-3 rounded-2xl border border-slate-200 p-3 transition hover:border-sky-300 hover:bg-sky-50/40"><div className="min-w-12 rounded-xl bg-sky-50 px-2 py-1 text-center"><span className="block text-[9px] font-bold uppercase text-sky-700">{new Date(`${event.start_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short' })}</span><span className="block text-lg font-black text-sky-900">{new Date(`${event.start_date}T00:00:00`).getDate()}</span></div><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{event.title}</p><p className="mt-1 truncate text-xs text-slate-500">{event.location || event.venue || 'Daet'} · {event.is_free ? 'Free' : event.ticket_price ? `₱${event.ticket_price}` : 'Details inside'}</p></div></Link>)}{upcomingEvents.length === 0 && <p className="text-sm text-slate-500">New events will appear here as soon as they are announced.</p>}</div>
              </div>

              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 sm:p-5">
                <div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-amber-700" /><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-800">Visitor notices</p><h3 className="mt-1 text-xl font-black text-slate-900">Announcements</h3></div></div>
                <div className="mt-4 space-y-3">{announcements.map((notice) => <article key={notice.id} className="rounded-2xl bg-white/80 p-3"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-800">{notice.announcement_type || 'Info'}</span><span className="text-[10px] text-slate-400">{formatTimeAgo(notice.published_at)}</span></div><h4 className="mt-2 text-sm font-bold text-slate-900">{notice.title}</h4><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{notice.content}</p></article>)}{announcements.length === 0 && <p className="text-sm text-slate-600">No active announcements right now. Check back before your trip.</p>}</div>
              </div>
            </div>
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
            <Link href="/tourist-spots" className="text-xs font-semibold text-sky-700 transition hover:text-sky-800 sm:text-sm">
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
                  className={`whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[10px] font-medium transition touch-manipulation sm:px-3 sm:py-2 sm:text-xs ${
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
          ) : filteredSpots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-600 sm:rounded-3xl">
              No destinations match your current search.
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto scrollbar-hide px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
              <div className="flex gap-3 sm:contents">
                {filteredSpots.map((spot) => (
                  <article 
                    key={spot.id} 
                    onClick={() => handleSpotClick(spot.id)}
                    className="flex-shrink-0 w-[min(82vw,20rem)] snap-start sm:w-auto group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.09)] sm:rounded-3xl cursor-pointer"
                  >
                    <div className="relative h-40 overflow-hidden sm:h-52 lg:h-56 touch-manipulation">
                      <img
                        src={spot.featured_image || spot.images?.[0] || defaultSpotImage}
                        alt={spot.name}
                        className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-110"
                        loading="lazy"
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
                        <span className="inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-semibold text-amber-700 flex-shrink-0 sm:px-2 sm:py-1 sm:text-xs">
                          ★ {Number(spot.rating || 0).toFixed(1)}
                        </span>
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
          <Link href="/user/dashboard" className="text-xs font-semibold text-amber-700 transition hover:text-amber-800 sm:text-sm">
            Read more updates →
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
        ) : trendingBlogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-600 sm:rounded-3xl">
            No blog posts available yet.
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto scrollbar-hide px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
            <div className="flex gap-3 sm:contents">
              {trendingBlogs.map((blog) => (
                <article 
                  key={blog.id} 
                  className="flex-shrink-0 w-[min(82vw,20rem)] snap-start sm:w-auto group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.09)] sm:rounded-3xl"
                >
                  <div 
                    className="overflow-hidden h-44 sm:h-52 cursor-pointer"
                    onClick={() => handleBlogClick(blog.id)}
                  >
                    <img
                      src={blog.featured_image || defaultBlogImage}
                      alt={blog.title}
                      className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3 sm:p-5">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-[10px]">
                      <span>{blog.category || 'Travel'}</span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => handleLike(e, 'blog', blog.id)}
                          className="flex items-center gap-1 transition hover:text-amber-600"
                          aria-label="Like this post"
                        >
                          <Heart size={10} className="sm:size-3" />
                          {blog.likes || 0}
                        </button>
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
                      <button
                        onClick={(e) => handleBookmark(e, 'blog', blog.id)}
                        className="p-1.5 rounded-full hover:bg-slate-100 transition"
                        aria-label="Bookmark this post"
                      >
                        <Bookmark size={14} className="text-slate-400 hover:text-amber-600" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Community Section */}
      <section id="community" className="bg-slate-950 py-10 text-white sm:py-14 lg:py-20">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="mb-4 flex flex-col gap-2 md:mb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300 sm:text-sm">Community forum</p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-white sm:text-2xl lg:text-3xl">Trending conversations</h2>
            </div>
            <Link href="/login" className="text-xs font-semibold text-emerald-300 transition hover:text-emerald-200 sm:text-sm">
              Join the discussion →
            </Link>
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
          ) : forumThreads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center text-slate-400 sm:rounded-3xl">
              No forum discussions yet. Be the first to start one!
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto scrollbar-hide px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
              <div className="flex gap-3 sm:contents">
                {forumThreads.map((thread) => (
                  <div 
                    key={thread.id} 
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

      {/* Map Section - Hidden on Mobile */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
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
                  {[
                    ['Daet', 'Municipal center and tourism heart of Camarines Norte'],
                    ['Bagasbas Beach', 'Surf-ready coastline and sunset destination'],
                    ['Daet Plaza', 'Town center for local gathering and events'],
                    ['Camarines Norte Capitol', 'Administrative landmark and civic identity'],
                  ].map(([place, description]) => (
                    <div key={place} className="rounded-xl border border-sky-100 bg-white/90 p-3 shadow-[0_10px_24px_rgba(14,116,144,0.06)] ring-1 ring-sky-100/60 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(14,116,144,0.08)] sm:rounded-2xl">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-[10px] font-bold text-white shadow-sm sm:h-7 sm:w-7">•</span>
                        <div>
                          <p className="text-sm font-bold text-slate-900 sm:text-[15px]">{place}</p>
                          <p className="text-[11px] leading-5 text-slate-600 sm:text-xs">{description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
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
        <div className="rounded-xl bg-gradient-to-r from-sky-700 to-emerald-700 p-4 text-white shadow-lg transition duration-300 hover:shadow-xl sm:rounded-2xl sm:p-6 lg:rounded-3xl lg:p-8">
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
              <Link href="/register" className="rounded-full bg-white px-4 py-2 text-center text-xs font-bold text-sky-700 transition duration-300 hover:bg-slate-100 touch-manipulation sm:px-5 sm:py-3 sm:text-sm">
                Join now
              </Link>
              <Link href="/login" className="rounded-full border border-white/40 bg-transparent px-4 py-2 text-center text-xs font-semibold text-white transition duration-300 hover:bg-white/10 touch-manipulation sm:px-5 sm:py-3 sm:text-sm">
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
                  {contact.numbers.map((number) => <a key={number} href={`tel:${number.replaceAll('-', '')}`} className="rounded-full bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700">{number}</a>)}
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
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 sm:py-7 sm:gap-6 lg:grid-cols-[1.2fr_0.8fr_0.8fr] lg:gap-10 lg:py-10 lg:px-8">
          <div>
            <div className="flex items-center gap-2 sm:gap-3">
              <img src="/logo.png" alt="Daet tourism logo" className="h-8 w-8 rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl" />
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-white sm:text-sm">DAET</p>
                <p className="text-[7px] uppercase tracking-[0.2em] text-slate-400 sm:text-[10px]">Camarines Norte</p>
              </div>
            </div>
            <p className="mt-2 max-w-md text-xs leading-5 text-slate-300 sm:mt-3 sm:text-sm sm:leading-6">
              Discover local culture, scenic escapes, and community stories that make Camarines Norte a destination worth returning to.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white sm:text-sm">Explore</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-300 sm:mt-3 sm:space-y-2 sm:text-sm">
              <li><a href="#discover" className="transition hover:text-white">Discover</a></li>
              <li><a href="#spots" className="transition hover:text-white">Popular spots</a></li>
              <li><a href="#events" className="transition hover:text-white">Upcoming events</a></li>
              <li><a href="#blogs" className="transition hover:text-white">Travel blogs</a></li>
              <li><a href="#community" className="transition hover:text-white">Community forum</a></li>
              <li><a href="#emergency" className="transition hover:text-white">Emergency contacts</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white sm:text-sm">Account</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-300 sm:mt-3 sm:space-y-2 sm:text-sm">
              {user ? (
                <li><Link href="/user/dashboard" className="transition hover:text-white">Dashboard</Link></li>
              ) : (
                <>
                  <li><Link href="/login" className="transition hover:text-white">Login</Link></li>
                  <li><Link href="/register" className="transition hover:text-white">Create account</Link></li>
                </>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 py-2.5 text-center text-[8px] text-slate-400 sm:text-[10px]">
          © 2026 Daet Connect.
        </div>
      </footer>

    </main>
  )
}