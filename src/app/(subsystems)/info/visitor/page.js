'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowRight, BedDouble, Bell, CalendarDays, ChevronRight, Clock, Landmark, Mail, MapPin, Menu, MessageSquare,
  Flag, Navigation, Newspaper, Phone, Search, ShoppingBag, Siren, Star, TriangleAlert, Utensils, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { decodeReviewText } from '@/lib/reviewText'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { usePublicSettings } from '@/lib/usePublicSettings'
import { loginUrlFor } from '@/lib/loginPrompt'
import { notifyToast } from '@/lib/toast.mjs'
import FrequentlyAskedQuestions from '@/app/(subsystems)/info/components/FrequentlyAskedQuestions'
import connectDaetLogo from '@/app/(subsystems)/info/assets/images/logo.png'
import styles from './VisitorHome.module.css'
import bagasbasImage from '@/app/(subsystems)/info/assets/images/bagasbasbeach.webp'

const HERO_IMAGE = bagasbasImage.src || bagasbasImage
const REALTIME_TABLES = ['info_tourist_spots', 'info_events', 'info_blogs', 'forum_threads', 'info_announcements']

const PLACE_TYPES = [
  { type: 'attraction', label: 'See & Do', hint: 'Beaches, heritage, nature', icon: Landmark, tone: 'bg-sky-50 text-sky-700' },
  { type: 'accommodation', label: 'Stay', hint: 'Hotels, resorts, inns', icon: BedDouble, tone: 'bg-violet-50 text-violet-700' },
  { type: 'restaurant', label: 'Eat & Drink', hint: 'Local food and cafés', icon: Utensils, tone: 'bg-amber-50 text-amber-700' },
  { type: 'business', label: 'Shops & Services', hint: 'Pasalubong, tours, rentals', icon: ShoppingBag, tone: 'bg-emerald-50 text-emerald-700' },
]

const SEVERITY = {
  critical: { label: 'Critical', box: 'border-red-300 bg-red-50 text-red-900', dot: 'bg-red-600' },
  warning: { label: 'Warning', box: 'border-orange-300 bg-orange-50 text-orange-900', dot: 'bg-orange-500' },
  advisory: { label: 'Advisory', box: 'border-amber-300 bg-amber-50 text-amber-900', dot: 'bg-amber-500' },
  info: { label: 'Info', box: 'border-sky-300 bg-sky-50 text-sky-900', dot: 'bg-sky-500' },
}

const NAV = [
  { href: '/info/visitor/tourist-spots', label: 'Places' },
  { href: '/info/visitor/events', label: 'Events' },
  { href: '/info/visitor/alerts', label: 'Alerts' },
  { href: '/info/visitor/search?type=blogs', label: 'Stories' },
  { href: '/info/visitor/forum', label: 'Forum' },
  { href: '/info/about', label: 'About' },
  { href: '/info/contact', label: 'Contact' },
]

const today = () => new Date().toISOString().slice(0, 10)
const imageOf = (item) => [item?.image_url, item?.featured_image, item?.gallery_images?.[0]]
  .find((image) => typeof image === 'string' && image.trim()) || null
const formatDay = (value) => {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? { month: '—', day: '' } : {
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    day: date.getDate(),
  }
}
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

function SectionHeader({ eyebrow, title, href, linkLabel }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      </div>
      {href ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-900">
          {linkLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  )
}

function SkeletonCards({ count = 3, tall = false }) {
  return Array.from({ length: count }, (_, index) => (
    <div key={index} className={`animate-pulse rounded-2xl border border-slate-200 bg-white ${tall ? 'h-72' : 'h-40'}`} />
  ))
}

function EmptyNote({ children }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">{children}</p>
}

function MediaPlaceholder({ icon: Icon }) {
  return (
    <div aria-hidden="true" className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 via-sky-50 to-slate-200 text-slate-400">
      <Icon className="h-10 w-10" />
    </div>
  )
}

function Stars({ value }) {
  const rounded = Math.round(Number(value) || 0)
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rounded} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-3.5 w-3.5 ${n <= rounded ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />)}
    </span>
  )
}

export default function VisitorHomePage() {
  const router = useRouter()
  const { settings } = usePublicSettings()
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [searchSuggestionsLoading, setSearchSuggestionsLoading] = useState(false)
  const [searchSuggestionsError, setSearchSuggestionsError] = useState(false)
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState([])
  const [data, setData] = useState({
    alerts: [], announcements: [], counts: {}, places: [], events: [], stories: [], threads: [], reviews: [],
  })

  const realtime = useRealtimeRefresh({ channelName: 'visitor-home', tables: REALTIME_TABLES })
  const { setRefreshCallback } = realtime
  const refresh = useCallback(() => new Promise((resolve) => {
    setReload((n) => n + 1)
    resolve(true)
  }), [])
  useEffect(() => { setRefreshCallback(refresh) }, [refresh, setRefreshCallback])

  useEffect(() => {
    let active = true
    const load = async () => {
      const day = today()
      const now = new Date().toISOString()
      const countType = (type) => supabase.from('info_tourist_spots').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('listing_type', type)

      const [alertsRes, noticeRes, placesRes, eventsRes, storiesRes, threadsRes, reviewsRes, ...countRes] = await Promise.all([
        fetch('/info/api/alerts', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        supabase.from('info_announcements').select('id, title, content, published_at')
          .eq('status', 'published').in('audience', ['all', 'tourists'])
          .or(`expires_at.is.null,expires_at.gt.${now}`).order('published_at', { ascending: false }).limit(3),
        supabase.from('info_tourist_spots').select('id, name, listing_type, category, location, barangay, rating, image_url, featured_image, gallery_images, featured')
          .eq('status', 'active').order('featured', { ascending: false }).order('rating', { ascending: false }).limit(6),
        supabase.from('info_events').select('id, title, location, venue, start_date, end_date, start_time, category, featured_image, is_free')
          .eq('status', 'published').eq('approval_status', 'approved')
          .or(`end_date.gte.${day},start_date.gte.${day}`).order('start_date', { ascending: true }).limit(4),
        supabase.from('info_blogs').select('id, title, excerpt, featured_image, category, published_at')
          .eq('status', 'published').eq('approval_status', 'approved')
          .or(`published_at.is.null,published_at.lte.${now}`).order('published_at', { ascending: false }).limit(3),
        supabase.from('forum_threads').select('id, title, reply_count, last_activity_at')
          .eq('status', 'published').order('last_activity_at', { ascending: false }).limit(4),
        supabase.from('attraction_ratings').select('id, rating, review_text, created_at, attraction_id, info_users!attraction_ratings_user_id_fkey(full_name)')
          .eq('attraction_type', 'tourist_spot').not('review_text', 'is', null).neq('review_text', '')
          .order('created_at', { ascending: false }).limit(3),
        ...PLACE_TYPES.map((item) => countType(item.type)),
      ])
      if (!active) return

      const problems = []
      const take = (result, label) => {
        if (result?.error) {
          console.error(`Visitor home: ${label} failed`, result.error.message)
          problems.push(label)
          return []
        }
        return result?.data || []
      }
      if (!alertsRes) problems.push('alerts')

      setData({
        alerts: alertsRes?.current || [],
        announcements: take(noticeRes, 'announcements'),
        places: take(placesRes, 'places'),
        events: take(eventsRes, 'events'),
        stories: take(storiesRes, 'stories'),
        threads: take(threadsRes, 'discussions'),
        reviews: take(reviewsRes, 'reviews'),
        counts: Object.fromEntries(PLACE_TYPES.map((item, index) => [item.type, countRes[index]?.error ? null : countRes[index]?.count ?? 0])),
      })
      setFailed(problems)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [reload])

  useEffect(() => {
    const term = query.trim()
    if (!searchFocused || !term) return

    let active = true
    const timeout = window.setTimeout(async () => {
      const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`
      const now = new Date().toISOString()

      try {
        const [placesResult, eventsResult, storiesResult] = await Promise.all([
          supabase.from('info_tourist_spots').select('id, name')
            .eq('status', 'active').ilike('name', pattern).limit(4),
          supabase.from('info_events').select('id, title')
            .eq('status', 'published').eq('approval_status', 'approved')
            .ilike('title', pattern).limit(4),
          supabase.from('info_blogs').select('id, title')
            .eq('status', 'published').eq('approval_status', 'approved')
            .or(`published_at.is.null,published_at.lte.${now}`)
            .ilike('title', pattern).limit(4),
        ])

        const failedResult = [placesResult, eventsResult, storiesResult].find((result) => result.error)
        if (failedResult?.error) throw failedResult.error
        if (!active) return

        setSearchSuggestions([
          ...(placesResult.data || []).map((item) => ({ id: item.id, title: item.name, type: 'Place' })),
          ...(eventsResult.data || []).map((item) => ({ id: item.id, title: item.title, type: 'Event' })),
          ...(storiesResult.data || []).map((item) => ({ id: item.id, title: item.title, type: 'Story' })),
        ].slice(0, 6))
        setSearchSuggestionsLoading(false)
      } catch (error) {
        if (!active) return
        console.error('Visitor search suggestions failed:', error)
        setSearchSuggestionsError(true)
        setSearchSuggestionsLoading(false)
      }
    }, 200)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [query, searchFocused])

  const [reportingId, setReportingId] = useState('')
  const reportReview = async (review) => {
    const reason = window.prompt('Why are you reporting this review?')?.trim()
    if (!reason) return
    setReportingId(review.id)
    try {
      const response = await fetch('/info/api/reports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: 'review', reason, itemId: review.id, itemTable: 'attraction_ratings' }),
      })
      if (response.status === 401) {
        router.push(loginUrlFor('Sign in to report a review.'))
        return
      }
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to report this review.')
      notifyToast('Thank you. The review was sent to our moderators.', 'success')
    } catch (error) {
      notifyToast(error.message || 'Unable to report this review right now.', 'error')
    } finally {
      setReportingId('')
    }
  }

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

  const { contact, municipality } = settings
  const mapQuery = encodeURIComponent(`${municipality.name}, ${municipality.province}, Philippines`)

  return (
    <div className={`${styles.homePage} flex min-h-screen flex-col bg-slate-50 text-slate-900`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>

      {/* ---------- Header ---------- */}
      <header className={`${styles.header} sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur`}>
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/info/visitor" className={`${styles.brandLink} flex min-w-0 items-center gap-2.5`}>
            <span className={styles.brandMark}>
              <Image
                src={settings.logoUrl || connectDaetLogo}
                alt=""
                width={36}
                height={36}
                unoptimized
                className={`${styles.brandLogo} h-9 w-9 object-contain`}
              />
            </span>
            <span className="truncate text-sm font-black tracking-tight text-slate-900 sm:text-base">{settings.siteName}</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={`${styles.navLink} rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900`}>{item.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/info/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:inline-flex">Sign in</Link>
            <Link href="/info/register" className="hidden rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 sm:inline-flex">Create account</Link>
            <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="visitor-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 lg:hidden">
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen ? (
          <nav id="visitor-menu" aria-label="Mobile" className="border-t border-slate-200 bg-white px-4 pb-4 lg:hidden">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className="flex items-center justify-between border-b border-slate-100 py-3 text-sm font-semibold text-slate-700 transition hover:pl-1 hover:text-sky-700">
                {item.label} <ChevronRight className="h-4 w-4 text-slate-400" />
              </Link>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/info/login" className="rounded-full border border-slate-200 py-2.5 text-center text-sm font-semibold text-slate-700">Sign in</Link>
              <Link href="/info/register" className="rounded-full bg-sky-600 py-2.5 text-center text-sm font-semibold text-white">Create account</Link>
            </div>
          </nav>
        ) : null}
      </header>

      {/* ---------- Live alerts ---------- */}
      {data.alerts.length ? (
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl space-y-2 px-4 py-3 sm:px-6 lg:px-8" role="region" aria-label="Current alerts">
            {data.alerts.slice(0, 2).map((alert) => {
              const tone = SEVERITY[alert.severity] || SEVERITY.info
              return (
                <Link key={alert.id} href={`/info/visitor/alerts/${alert.id}`} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${tone.box}`}>
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="text-xs font-bold uppercase tracking-wide">{tone.label}{alert.affected_area ? ` · ${alert.affected_area}` : ''}</span>
                    <span className="block truncate text-sm font-semibold">{alert.title}</span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              )
            })}
            {data.alerts.length > 2 ? <Link href="/info/visitor/alerts" className="block text-right text-xs font-semibold text-slate-600 hover:underline">View all {data.alerts.length} active alerts</Link> : null}
          </div>
        </div>
      ) : null}

      <main id="main" className="flex-1">
        {/* ---------- Hero ---------- */}
        <section className={`${styles.hero} relative isolate overflow-hidden`}>
          <img src={HERO_IMAGE} alt="" className={`${styles.heroImage} absolute inset-0 -z-10 h-full w-full object-cover`} />
          <div className={`${styles.heroOverlay} absolute inset-0 -z-10`} />
          <div className={`${styles.heroCopy} mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20`}>
            <div className={`${styles.heroPill} mb-5 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold tracking-wide text-white sm:text-sm`}>
              <MapPin className="h-4 w-4 text-sky-300" aria-hidden="true" />
              Official guide to {municipality.name}
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-200 sm:text-sm">{municipality.name}, {municipality.province}</p>
            <h1 className={`${styles.heroTitle} mt-3 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl`}>Plan your visit to {municipality.name}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200 sm:text-lg sm:leading-7">Find welcoming places, local events, and real-time advisories from the {settings.tourismOfficeName}.</p>
            <div
              className="relative mt-7 max-w-2xl sm:mt-8"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false)
              }}
            >
              <form onSubmit={submitSearch} role="search" className={`${styles.heroSearch} flex gap-2 rounded-2xl bg-white p-2`}>
                <label htmlFor="visitor-search" className="sr-only">Search places, events, and stories</label>
                <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2">
                  <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                  <input
                    id="visitor-search"
                    value={query}
                    onFocus={() => setSearchFocused(true)}
                    onChange={(event) => {
                      const nextQuery = event.target.value
                      setQuery(nextQuery)
                      setSearchSuggestions([])
                      setSearchSuggestionsLoading(Boolean(nextQuery.trim()))
                      setSearchSuggestionsError(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setSearchFocused(false)
                    }}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    aria-controls="visitor-search-suggestions"
                    aria-expanded={searchFocused && Boolean(query.trim())}
                    placeholder="Search places, food, events…"
                    className="w-full min-w-0 bg-transparent py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 sm:text-base"
                  />
                </div>
                <button type="submit" className={`${styles.heroSearchButton} rounded-xl bg-sky-600 px-6 text-sm font-bold text-white transition hover:bg-sky-700 active:scale-[0.98]`}>Search</button>
              </form>
              {searchFocused && query.trim() ? (
                <div
                  id="visitor-search-suggestions"
                  role="listbox"
                  aria-label="Search suggestions"
                  className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/95 p-2 text-white shadow-2xl backdrop-blur"
                >
                  <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Suggestions</p>
                  {searchSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.type}-${suggestion.id}`}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => submitSearchSuggestion(suggestion)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-100 transition hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="truncate">{suggestion.title}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{suggestion.type}</span>
                    </button>
                  ))}
                  {searchSuggestionsLoading ? <p role="status" className="px-3 py-2 text-xs text-slate-400">Finding suggestions…</p> : null}
                  {searchSuggestionsError ? <p role="status" className="px-3 py-2 text-xs text-amber-200">Suggestions are temporarily unavailable. You can still search.</p> : null}
                  {!searchSuggestionsLoading && !searchSuggestionsError && !searchSuggestions.length ? (
                    <p className="px-3 py-2 text-xs text-slate-400">No matching places, events, or stories yet.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {failed.length ? (
          <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span>Some sections could not load ({failed.join(', ')}).</span>
              <button type="button" onClick={() => { setLoading(true); setReload((n) => n + 1) }} className="font-semibold underline">Try again</button>
            </div>
          </div>
        ) : null}

        {/* ---------- Place types ---------- */}
        <section aria-labelledby="types-heading" className="mx-auto -mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="types-heading" className="sr-only">Browse by type</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {PLACE_TYPES.map(({ type, label, hint, icon: Icon, tone }) => (
              <Link key={type} href={`/info/visitor/tourist-spots?type=${type}`} className={`${styles.categoryCard} group min-h-40 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4`}>
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="mt-3 block text-base font-bold text-slate-900">{label}</span>
                <span className="min-h-10 line-clamp-2 block text-xs text-slate-500">{hint}</span>
                <span className="mt-auto block pt-2 text-xs font-semibold text-sky-700">{data.counts[type] == null ? (loading ? '…' : 'Browse') : `${data.counts[type]} listed`}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------- Featured places ---------- */}
        <section aria-labelledby="places-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div id="places-heading"><SectionHeader eyebrow="Places" title="Popular in Daet" href="/info/visitor/tourist-spots" linkLabel="All places" /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? <SkeletonCards tall /> : data.places.length ? data.places.map((place) => {
              const image = imageOf(place)
              return (
                <Link key={place.id} href={`/info/visitor/tourist-spots/${place.id}`} className={`${styles.placeCard} group rounded-2xl border border-slate-200 bg-white shadow-sm`}>
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                    {image ? <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <MediaPlaceholder icon={Landmark} />}
                    {place.featured ? <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-sky-700">Featured</span> : null}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{PLACE_TYPES.find((t) => t.type === place.listing_type)?.label || 'Place'} · {place.category}</p>
                    <h3 className="mt-1 min-h-14 line-clamp-2 text-lg font-bold text-slate-900 group-hover:text-sky-700">{place.name}</h3>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-sm text-slate-500">
                      <span className="flex min-w-0 items-center gap-1"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{place.barangay || place.location}</span></span>
                      {Number(place.rating) > 0 ? <span className="flex items-center gap-1 font-semibold text-slate-700"><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />{Number(place.rating).toFixed(1)}</span> : null}
                    </div>
                  </div>
                </Link>
              )
            }) : <EmptyNote>No places have been published yet.</EmptyNote>}
          </div>
        </section>

        {/* ---------- Events + announcements ---------- */}
        <section aria-labelledby="events-heading" className="bg-white py-12">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:px-8">
            <div className="min-w-0">
              <div id="events-heading"><SectionHeader eyebrow="Events & festivals" title="Coming up" href="/info/visitor/events" linkLabel="All events" /></div>
              <div className="space-y-3">
                {loading ? <SkeletonCards count={3} /> : data.events.length ? data.events.map((event) => {
                  const { month, day } = formatDay(event.start_date)
                  return (
                    <Link key={event.id} href={`/info/visitor/events/${event.id}`} className={`${styles.eventCard} flex min-h-24 gap-3 rounded-2xl border border-slate-200 p-3 sm:gap-4`}>
                      <span className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-sky-600 text-white">
                        <span className="text-xs font-bold uppercase">{month}</span>
                        <span className="text-2xl font-black leading-none">{day}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="block h-6 truncate text-base font-bold text-slate-900">{event.title}</span>
                        <span className="mt-1 flex max-h-10 min-h-10 flex-wrap content-center gap-x-3 gap-y-1 overflow-hidden text-sm text-slate-500">
                          {event.start_time ? <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden="true" />{event.start_time.slice(0, 5)}</span> : null}
                          <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{event.venue || event.location || 'Daet'}</span></span>
                          {event.is_free ? <span className="font-semibold text-emerald-700">Free</span> : null}
                        </span>
                      </span>
                    </Link>
                  )
                }) : <EmptyNote>No upcoming events right now. Check back soon.</EmptyNote>}
              </div>
            </div>
            <aside aria-labelledby="notices-heading" className="min-w-0">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">From the tourism office</p>
                <h2 id="notices-heading" className="mt-1 text-2xl font-black tracking-tight text-slate-900">Announcements</h2>
              </div>
              <div className="space-y-3">
                {loading ? <SkeletonCards count={2} /> : data.announcements.length ? data.announcements.map((notice) => (
                  <article key={notice.id} className="flex min-h-44 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">{formatDate(notice.published_at)}</p>
                    <h3 className="mt-1 min-h-12 line-clamp-2 font-bold text-slate-900">{notice.title}</h3>
                    <p className="mt-1 min-h-[4.5rem] line-clamp-3 text-sm text-slate-600">{notice.content}</p>
                  </article>
                )) : <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No announcements at the moment.</p>}
                <Link href="/info/visitor/alerts" className="flex items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white hover:bg-slate-800">
                  <Bell className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-sm"><span className="block font-bold">Get real-time alerts</span><span className="text-slate-300">Weather, sea, roads and event changes</span></span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </aside>
          </div>
        </section>

        {/* ---------- Stories + forum ---------- */}
        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:px-8">
          <div aria-labelledby="stories-heading">
            <div id="stories-heading"><SectionHeader eyebrow="Travel stories" title="From the community" href="/info/visitor/search?type=blogs" linkLabel="More stories" /></div>
            <div className="grid gap-4 sm:grid-cols-3">
              {loading ? <SkeletonCards tall /> : data.stories.length ? data.stories.map((story) => {
                const image = imageOf(story)
                return (
                  <Link key={story.id} href={`/info/visitor/blog/${story.id}`} className={`${styles.storyCard} group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`}>
                    <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                      {image ? <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" /> : <MediaPlaceholder icon={Newspaper} />}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="flex items-center gap-1 text-xs text-slate-500"><Newspaper className="h-3.5 w-3.5" aria-hidden="true" />{formatDate(story.published_at)}</p>
                      <h3 className="mt-1 min-h-12 line-clamp-2 font-bold text-slate-900 group-hover:text-sky-700">{story.title}</h3>
                      <p className="mt-1 min-h-10 line-clamp-2 text-sm text-slate-600">{story.excerpt || ''}</p>
                    </div>
                  </Link>
                )
              }) : <EmptyNote>No stories have been published yet.</EmptyNote>}
            </div>
          </div>
          <aside aria-labelledby="forum-heading">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Ask locals</p>
              <h2 id="forum-heading" className="mt-1 text-2xl font-black tracking-tight text-slate-900">Forum</h2>
            </div>
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {loading ? <div className="h-48 animate-pulse" /> : data.threads.length ? data.threads.map((thread) => (
                <Link key={thread.id} href={`/info/visitor/forum/${thread.id}`} className="flex min-h-[76px] items-start gap-3 p-4 hover:bg-slate-50">
                  <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block min-h-10 line-clamp-2 text-sm font-semibold text-slate-900">{thread.title}</span>
                    <span className="text-xs text-slate-500">{thread.reply_count || 0} replies</span>
                  </span>
                </Link>
              )) : <p className="p-4 text-sm text-slate-500">No discussions yet.</p>}
              <Link href="/info/visitor/forum" className="block p-4 text-sm font-semibold text-sky-700 hover:bg-slate-50">Browse the forum</Link>
            </div>
          </aside>
        </section>

        {/* ---------- Reviews ---------- */}
        {!loading && data.reviews.length ? (
          <section aria-labelledby="reviews-heading" className="bg-white py-12">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div id="reviews-heading"><SectionHeader eyebrow="Reviews" title="What visitors say" /></div>
              <div className="grid gap-4 md:grid-cols-3">
                {data.reviews.map((review) => {
                  const text = decodeReviewText(review.review_text)
                  return (
                    <article key={review.id} className="flex min-h-[260px] flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <Link href={`/info/visitor/tourist-spots/${review.attraction_id}`} className="flex flex-1 flex-col hover:text-sky-800">
                        <Stars value={review.rating} />
                        {text.title ? <h3 className="mt-2 min-h-6 line-clamp-1 font-bold text-slate-900">{text.title}</h3> : <span aria-hidden="true" className="mt-2 h-6" />}
                        <p className="mt-2 min-h-20 line-clamp-4 text-sm text-slate-700">“{text.body}”</p>
                      </Link>
                      <div className="mt-3 flex min-w-0 items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-semibold text-slate-500">{review.info_users?.full_name || 'Visitor'} · {formatDate(review.created_at)}</span>
                        <button type="button" onClick={() => void reportReview(review)} disabled={reportingId === review.id} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-slate-500 hover:bg-white hover:text-red-600 disabled:opacity-50">
                          <Flag className="h-3.5 w-3.5" aria-hidden="true" /> Report
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </section>
        ) : null}

        {/* ---------- Map + contact + emergency ---------- */}
        <section aria-labelledby="visit-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="Getting here" title="Map & contacts" />
          <h2 id="visit-heading" className="sr-only">Map and contacts</h2>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <iframe title={`Map of ${municipality.name}`} src={`https://maps.google.com/maps?q=${mapQuery}&z=13&output=embed`} className="h-72 w-full sm:h-96" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 border-t border-slate-200 py-3 text-sm font-semibold text-sky-700 hover:bg-slate-50">
                <Navigation className="h-4 w-4" aria-hidden="true" /> Get directions to {municipality.name}
              </a>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                <h3 className="flex items-center gap-2 font-bold text-red-900"><Siren className="h-5 w-5" aria-hidden="true" />In an emergency</h3>
                <p className="mt-1 text-sm text-red-800">Call the national emergency hotline <a href="tel:911" className="font-bold underline">911</a>{contact.emergencyHotline ? <> or the local hotline <a href={`tel:${contact.emergencyHotline.replace(/[^0-9+]/g, '')}`} className="font-bold underline">{contact.emergencyHotline}</a></> : null}. This site shares advisories but is not an emergency service.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold text-slate-900">{settings.tourismOfficeName}</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {contact.address ? <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{contact.address}</li> : null}
                  {contact.phone ? <li className="flex gap-2"><Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><a href={`tel:${contact.phone.replace(/[^0-9+]/g, '')}`} className="hover:underline">{contact.phone}</a></li> : null}
                  {contact.email ? <li className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><a href={`mailto:${contact.email}`} className="break-all hover:underline">{contact.email}</a></li> : null}
                  {contact.officeHours ? <li className="flex gap-2"><Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{contact.officeHours}</li> : null}
                </ul>
                <Link href="/info/contact" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:underline">Contact the office <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
            </div>
          </div>
        </section>

        <FrequentlyAskedQuestions audience="visitor" />

        {/* ---------- Join ---------- */}
        <section className="px-4 pb-12 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 rounded-3xl bg-sky-600 p-6 text-white sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 className="text-xl font-black sm:text-2xl">Save places, plan your trip, and share your story</h2>
              <p className="mt-1 text-sm text-sky-100">A free account lets you write reviews, join the forum, choose alert topics, and ask the tourism office questions.</p>
            </div>
            <div className="flex gap-2">
              <Link href="/info/register" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-sky-700 hover:bg-sky-50">Create account</Link>
              <Link href="/info/login" className="rounded-full border border-white/60 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10">Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <span className={styles.footerBrandMark}>
                <Image
                  src={settings.logoUrl || connectDaetLogo}
                  alt=""
                  width={28}
                  height={28}
                  unoptimized
                  className="h-7 w-7 object-contain"
                />
              </span>
              <p className="font-black text-slate-900">{settings.siteName}</p>
            </div>
            <p className="mt-2 max-w-xs leading-6 text-slate-500">{settings.tagline}</p>
          </div>
          <div>
            <p className="font-bold text-slate-900">Explore</p>
            <ul className="mt-2 space-y-1.5 text-slate-600">
              {PLACE_TYPES.map((t) => <li key={t.type}><Link href={`/info/visitor/tourist-spots?type=${t.type}`} className="hover:underline">{t.label}</Link></li>)}
              <li><Link href="/info/visitor/events" className="hover:underline">Events</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-bold text-slate-900">Community</p>
            <ul className="mt-2 space-y-1.5 text-slate-600">
              <li><Link href="/info/visitor/alerts" className="hover:underline">Alerts</Link></li>
              <li><Link href="/info/visitor/forum" className="hover:underline">Forum</Link></li>
              <li><Link href="/info/visitor/search?type=blogs" className="hover:underline">Stories</Link></li>
              <li><Link href="/info/community-guidelines" className="hover:underline">Community guidelines</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-bold text-slate-900">About</p>
            <ul className="mt-2 space-y-1.5 text-slate-600">
              <li><Link href="/info/about" className="hover:underline">About {municipality.name}</Link></li>
              <li><Link href="/info/contact" className="hover:underline">Contact</Link></li>
              <li><Link href="/info/legal/privacy-policy" className="hover:underline">Privacy policy</Link></li>
              <li><Link href="/info/legal/terms-and-conditions" className="hover:underline">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100 px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} {settings.tourismOfficeName}</span>
        </div>
      </footer>
    </div>
  )
}
