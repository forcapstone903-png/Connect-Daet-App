'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, MapPin, Sparkles, Plane, Newspaper, Menu, X, Star, Calendar, MessageCircle, Heart, Clock, Lock, ThumbsUp, Bookmark, Reply } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import logoImage from '../assets/images/logo.png'
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

export default function WelcomePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [popularSpots, setPopularSpots] = useState([])
  const [trendingBlogs, setTrendingBlogs] = useState([])
  const [forumThreads, setForumThreads] = useState([])
  const [featuredEvents, setFeaturedEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [activeSection, setActiveSection] = useState('discover')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [categories, setCategories] = useState(['All'])
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authAction, setAuthAction] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  const navigationItems = [
    { id: 'discover', label: 'Discover' },
    { id: 'spots', label: 'Spots' },
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

      } catch (error) {
        console.error('Welcome page content load failed:', error)
      } finally {
        setLoading(false)
      }
    }

    loadContent()
  }, [])

  const heroStats = useMemo(
    () => [
      { label: 'Beaches', value: '18+' },
      { label: 'Local stories', value: '120+' },
      { label: 'Travel guides', value: '40+' },
    ],
    []
  )

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
    if (!user) {
      setAuthAction('read_blog')
      setShowAuthModal(true)
      return
    }
    router.push(`/blog/${blogId}`)
  }

  const handleForumClick = (threadId) => {
    if (!user) {
      setAuthAction('view_forum')
      setShowAuthModal(true)
      return
    }
    router.push(`/forum/${threadId}`)
  }

  const handleSpotClick = (spotId) => {
    // Allow viewing spot details without login
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] text-slate-900">
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
                {authAction === 'view_forum' && 'You need to be signed in to view forum discussions.'}
                {authAction === 'read_blog' && 'You need to be signed in to read full blog posts.'}
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

        <div className="relative mx-auto max-w-[1440px] px-3 pb-16 pt-3 sm:px-6 lg:px-8 xl:px-10">
          {/* Header */}
          <header className="sticky top-2 z-40 mb-6 rounded-full border border-white/20 bg-white/10 px-3 py-2 shadow-[0_20px_50px_rgba(15,23,42,0.15)] backdrop-blur-xl sm:mb-10 sm:px-6 sm:py-2.5">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 p-1 shadow-lg shadow-sky-900/20 ring-1 ring-white/20 sm:h-11 sm:w-11">
                  <img src={logoImage.src || logoImage} alt="Daet tourism logo" className="h-full w-full rounded-xl object-cover" />
                </div>
                <div>
                  <p className="text-[10px] font-black tracking-[0.24em] text-white/90 sm:text-sm">DAET</p>
                  <p className="text-[7px] font-medium uppercase tracking-[0.22em] text-sky-100/90 sm:text-[10px]">Camarines Norte</p>
                </div>
              </div>

              <nav className="hidden items-center gap-1 text-sm md:flex">
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

              <div className="flex items-center gap-1.5 sm:gap-3">
                {user ? (
                  <Link href="/dashboard" className="hidden rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-900 transition hover:bg-slate-100 sm:inline-flex sm:px-4 sm:py-2 sm:text-sm">
                    Dashboard
                  </Link>
                ) : (
                  <Link href="/login" className="hidden rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-900 transition hover:bg-slate-100 sm:inline-flex sm:px-4 sm:py-2 sm:text-sm">
                    Sign in
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-expanded={mobileMenuOpen}
                  aria-label="Toggle navigation menu"
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 md:hidden ${
                    mobileMenuOpen
                      ? 'border-white/40 bg-white text-slate-900 shadow-lg'
                      : 'border-white/20 bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  {mobileMenuOpen ? <X size={18} className="transition-transform duration-200" /> : <Menu size={18} className="transition-transform duration-200" />}
                </button>
              </div>
            </div>

            {mobileMenuOpen && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/40 shadow-[0_18px_40px_rgba(15,23,42,0.22)] backdrop-blur-xl md:hidden">
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
                      <Link href="/dashboard" className="rounded-xl bg-white px-3 py-2 text-center text-xs font-semibold text-slate-900 transition hover:bg-slate-100">
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

          {/* Hero Content */}
          <div className="grid gap-5 lg:grid-cols-[1.18fr_0.82fr] lg:items-end lg:gap-10 xl:gap-12">
            <div className="py-2 sm:py-6 lg:py-10">
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[7px] font-semibold uppercase tracking-[0.26em] text-sky-100 backdrop-blur-sm sm:px-3 sm:py-1.5 sm:text-[10px]">
                <Sparkles size={10} className="sm:size-3" />
                Welcome to Daet Connect
              </span>

              <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl xl:text-6xl">
                Discover the heart of Camarines Norte.
              </h1>

              <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-100/90 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                Experience coastal beauty, local stories, and community-driven travel inspiration across Daet — where surf, culture, and warm hospitality meet.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:gap-3">
                <Link href="/register" className="rounded-full bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 px-5 py-2.5 text-center text-xs font-bold text-slate-900 shadow-[0_18px_40px_rgba(251,191,36,0.35)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(251,191,36,0.45)] sm:px-6 sm:py-3 sm:text-sm">
                  Create account
                </Link>
                <Link href="/login" className="rounded-full border border-white/35 bg-white/5 px-5 py-2.5 text-center text-xs font-semibold text-white backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:bg-white/10 sm:px-6 sm:py-3 sm:text-sm">
                  Explore now
                </Link>
              </div>

              {/* Mobile Stats - Horizontal Scroll */}
              <div className="mt-5 -mx-3 overflow-x-auto scrollbar-hide sm:mx-0 sm:grid sm:gap-4 sm:grid-cols-3">
                <div className="flex gap-2.5 px-3 sm:contents">
                  {heroStats.map((item) => (
                    <div key={item.label} className="flex-shrink-0 w-20 rounded-xl border border-white/15 bg-white/10 p-2.5 backdrop-blur-sm transition duration-300 hover:bg-white/15 sm:w-auto sm:rounded-2xl sm:p-4">
                      <p className="text-base font-black text-white sm:text-2xl">{item.value}</p>
                      <p className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.22em] text-sky-100 sm:text-[10px]">{item.label}</p>
                    </div>
                  ))}
                </div>
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
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
                    {featuredEvents.map((ev) => (
                      <Link key={ev.id} href={`/events/${ev.id}`} className="block rounded-xl bg-white/15 p-3 text-white border border-white/10 backdrop-blur-sm hover:bg-white/20 transition sm:rounded-2xl sm:p-4">
                        <p className="font-semibold text-sm sm:text-base line-clamp-1">{ev.title}</p>
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

      {/* Discover Section - Hidden on Mobile */}
      <section id="discover" className="hidden lg:block mx-auto max-w-[1440px] px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20 xl:px-10">
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
            <div className="-mx-4 overflow-x-auto scrollbar-hide px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
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
                    className="flex-shrink-0 w-64 sm:w-auto group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.09)] sm:rounded-3xl cursor-pointer"
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
          <Link href="/dashboard" className="text-xs font-semibold text-amber-700 transition hover:text-amber-800 sm:text-sm">
            Read more updates →
          </Link>
        </div>

        {loading ? (
          <div className="-mx-4 overflow-x-auto scrollbar-hide px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
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
                  className="flex-shrink-0 w-64 sm:w-auto group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.09)] sm:rounded-3xl"
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
                        Read story <ArrowRight size={13} className="sm:size-15" />
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
            <div className="-mx-4 overflow-x-auto scrollbar-hide px-4 sm:grid sm:gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mx-0 sm:px-0">
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
                    className="flex-shrink-0 w-64 sm:w-auto rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-emerald-300/40 hover:bg-white/[0.07] sm:rounded-3xl sm:p-5"
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
      <section className="hidden lg:block mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
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
                  className="h-[240px] w-full border-0 sm:h-[300px] lg:h-full lg:min-h-[460px]"
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

      {/* Footer */}
      <footer className="mt-6 border-t border-slate-200 bg-slate-950 text-slate-300 sm:mt-8">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 sm:py-7 sm:gap-6 lg:grid-cols-[1.2fr_0.8fr_0.8fr] lg:gap-10 lg:py-10 lg:px-8">
          <div>
            <div className="flex items-center gap-2 sm:gap-3">
              <img src={logoImage.src || logoImage} alt="Daet tourism logo" className="h-8 w-8 rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl" />
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
              <li><a href="#blogs" className="transition hover:text-white">Travel blogs</a></li>
              <li><a href="#community" className="transition hover:text-white">Community forum</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white sm:text-sm">Account</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-300 sm:mt-3 sm:space-y-2 sm:text-sm">
              {user ? (
                <li><Link href="/dashboard" className="transition hover:text-white">Dashboard</Link></li>
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