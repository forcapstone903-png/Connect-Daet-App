'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronRight,
  Clock,
  Heart,
  MapPin,
  Search,
  Star,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCacheKey, getPersistentCache, setPersistentCache } from '@/lib/cache'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import RealtimeStatus from '@/app/(subsystems)/info/components/user/RealtimeStatus'
import { DAET_BARANGAYS, LISTINGS_CACHE_VERSION, LISTING_TYPES, getListingTypeLabel } from '@/lib/listings.mjs'

const defaultSpotImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80'
// Public data only (active listings). Invalidated by the admin page after
// every successful write; realtime refresh keeps open tabs current.
const SPOTS_CACHE_KEY = getCacheKey('places', 'public', 'all', LISTINGS_CACHE_VERSION)
const SPOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const RATING_FILTERS = [
  { value: 0, label: 'Any rating' },
  { value: 3, label: '3★ & up' },
  { value: 4, label: '4★ & up' },
  { value: 4.5, label: '4.5★ & up' },
]

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'reviews', label: 'Most reviewed' },
  { value: 'name', label: 'Name (A–Z)' },
]

const HERO_COPY = {
  all: { title: 'Explore Daet', subtitle: 'Attractions, places to stay, food, and local shops across Daet, Camarines Norte' },
  attraction: { title: 'See & Do in Daet', subtitle: 'Beaches, landmarks, and hidden gems across Camarines Norte' },
  accommodation: { title: 'Where to Stay', subtitle: 'Hotels, resorts, inns, and homestays in Daet' },
  restaurant: { title: 'Eat & Drink', subtitle: 'Local favourites, seafood, cafés, and Bicolano cooking' },
  business: { title: 'Shops & Services', subtitle: 'Pasalubong, surf schools, tour operators, and more' },
}

function getImageUrl(value, fallback) {
  if (Array.isArray(value) && value.length > 0) return value[0]
  if (typeof value === 'string' && value.trim()) return value
  if (value?.gallery_images?.length) return value.gallery_images[0]
  return fallback
}

export default function TouristSpotsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f3f5f9]" />}>
      <PlacesDirectory />
    </Suspense>
  )
}

function PlacesDirectory() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type')
  const listingType = LISTING_TYPES.some((type) => type.value === typeParam) ? typeParam : 'all'
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [barangay, setBarangay] = useState('all')
  const [minRating, setMinRating] = useState(0)
  const [sortBy, setSortBy] = useState('recommended')
  const [favorites, setFavorites] = useState(new Set())

  // The listing type lives in the URL (?type=restaurant) so tabs are shareable.
  const selectListingType = (value) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') params.delete('type')
    else params.set('type', value)
    setCategory('all')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }
  const refreshSpotsRef = useRef(null)
  const realtime = useRealtimeRefresh({
    channelName: 'visitor-tourist-spots-index',
    tables: ['info_tourist_spots'],
  })
  const { setRefreshCallback } = realtime

  useEffect(() => {
    let ignore = false

    const loadSpots = async (silent = false) => {
      try {
        const cachedSpots = getPersistentCache(SPOTS_CACHE_KEY)?.data
        if (!silent && Array.isArray(cachedSpots)) {
          setSpots(cachedSpots)
          setLoading(false)
        }

        const [{ data, error }, { data: sessionData }] = await Promise.all([
          supabase
          .from('info_tourist_spots')
          .select('*')
          .eq('status', 'active')
          .order('rating', { ascending: false }),
          supabase.auth.getSession(),
        ])

        const userId = sessionData?.session?.user?.id
        const { data: favoriteRows } = userId
          ? await supabase.from('user_favorites').select('item_id').eq('user_id', userId).eq('item_type', 'spot')
          : { data: [] }

        if (error) {
          console.error('Error loading tourist spots:', error)
          if (!ignore) setLoading(false)
          return false
        }

        if (!ignore) {
          setSpots(data || [])
          setPersistentCache(SPOTS_CACHE_KEY, data || [], SPOTS_CACHE_TTL_MS)
          setFavorites(new Set((favoriteRows || []).map((favorite) => favorite.item_id)))
          setLoading(false)
        }
        return true
      } catch (error) {
        console.error('Tourist spots fetch failed:', error)
        if (!ignore) setLoading(false)
        return false
      }
    }

    refreshSpotsRef.current = () => loadSpots(true)
    void loadSpots()

    return () => {
      ignore = true
      refreshSpotsRef.current = null
    }
  }, [])

  useEffect(() => {
    setRefreshCallback(() => refreshSpotsRef.current?.() ?? false)
  }, [setRefreshCallback])

  const spotsOfType = useMemo(
    () => (listingType === 'all' ? spots : spots.filter((s) => (s.listing_type || 'attraction') === listingType)),
    [spots, listingType]
  )

  const typeCounts = useMemo(() => spots.reduce((counts, spot) => {
    const type = spot.listing_type || 'attraction'
    counts[type] = (counts[type] || 0) + 1
    return counts
  }, {}), [spots])

  const categories = useMemo(() => {
    const set = new Set(spotsOfType.filter((s) => s.category).map((s) => s.category))
    return ['all', ...set]
  }, [spotsOfType])

  // Only offer barangays that actually have listings.
  const barangays = useMemo(() => {
    const used = new Set(spots.map((s) => s.barangay).filter(Boolean))
    return DAET_BARANGAYS.filter((name) => used.has(name))
  }, [spots])

  const filteredSpots = useMemo(() => {
    let result = spotsOfType

    if (category !== 'all') {
      result = result.filter((s) => (s.category || '').toLowerCase() === category.toLowerCase())
    }
    if (barangay !== 'all') {
      result = result.filter((s) => s.barangay === barangay)
    }
    if (minRating > 0) {
      result = result.filter((s) => Number(s.rating) >= minRating && Number(s.review_count) > 0)
    }

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter((s) => {
        const haystack = [s.name, s.location, s.barangay, s.category, s.description, ...(s.tags || [])]
          .filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }

    const sorted = [...result]
    if (sortBy === 'rating') sorted.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
    else if (sortBy === 'reviews') sorted.sort((a, b) => Number(b.review_count || 0) - Number(a.review_count || 0))
    else if (sortBy === 'name') sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    else sorted.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || Number(b.rating || 0) - Number(a.rating || 0))
    return sorted
  }, [spotsOfType, category, barangay, minRating, search, sortBy])

  const hasActiveFilters = category !== 'all' || barangay !== 'all' || minRating > 0 || search.trim()
  const clearFilters = () => {
    setSearch('')
    setCategory('all')
    setBarangay('all')
    setMinRating(0)
  }
  const heroCopy = HERO_COPY[listingType] || HERO_COPY.all

  const toggleFavorite = async (event, spotId) => {
    event.preventDefault()
    event.stopPropagation()

    const sessionResult = await supabase.auth.getSession()
    const userId = sessionResult?.data?.session?.user?.id
    if (!userId) {
      // Guests are asked to sign in before saving favourites.
      const next = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
      router.push(`/info/login?message=${encodeURIComponent('Sign in to save places to your favourites.')}&redirect=${encodeURIComponent(next)}`)
      return
    }

    const isFavorite = favorites.has(spotId)
    const result = isFavorite
      ? await supabase.from('user_favorites').delete().eq('user_id', userId).eq('item_type', 'spot').eq('item_id', spotId)
      : await supabase.from('user_favorites').upsert({ user_id: userId, item_type: 'spot', item_id: spotId }, { onConflict: 'user_id,item_type,item_id' })

    if (!result.error) {
      setFavorites((previous) => {
        const next = new Set(previous)
        if (isFavorite) next.delete(spotId)
        else next.add(spotId)
        return next
      })
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[1200px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} className="mb-3" />
        {/* Header */}
        <header className="visitor-local-header sticky top-3 z-30 mb-6 rounded-[20px] border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur md:px-5 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/info/visitor" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5 p-1 shadow-sm ring-1 ring-slate-200">
                <img src="/logo.png" alt="Daet tourism logo" className="h-full w-full rounded-lg object-cover" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Daet</p>
                <p className="text-base font-bold text-slate-800">Connect</p>
              </div>
            </Link>

            <label className="hidden flex-1 items-center justify-center lg:flex">
              <div className="w-full max-w-xl rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 shadow-inner">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search places, tags, barangays..."
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </label>

            <Link
              href="/info/visitor"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              ← Back
            </Link>
          </div>

          <div className="mt-3 lg:hidden">
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search places, tags, barangays..."
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </header>

        <div className="mb-6 hidden items-center justify-between gap-4 lg:flex">
          <Link
            href="/info/visitor"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            ← Back
          </Link>
          <label className="flex w-full max-w-xl items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm">
            <Search className="h-4 w-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search places, tags, barangays..."
              className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>

        {/* Hero */}
        <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white">
          <div className="relative h-40 bg-emerald-600 sm:h-48">
            <div className="absolute inset-0 bg-slate-950/25" />
            <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
              <div>
                <h1 className="text-2xl font-bold text-white sm:text-4xl">{heroCopy.title}</h1>
                <p className="mt-2 text-sm text-cyan-50/90 sm:text-base">
                  {heroCopy.subtitle}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-50">
                  <MapPin className="h-3.5 w-3.5" />
                  {filteredSpots.length} {filteredSpots.length === 1 ? 'place' : 'places'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Listing type tabs */}
        <div className="mb-4 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="What are you looking for?">
          {[{ value: 'all', publicLabel: 'All places' }, ...LISTING_TYPES].map((type) => {
            const selected = listingType === type.value
            const count = type.value === 'all' ? spots.length : (typeCounts[type.value] || 0)
            return (
              <button
                key={type.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectListingType(type.value)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
                  selected ? 'bg-slate-900 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {type.publicLabel}
                <span className={`text-xs tabular-nums ${selected ? 'text-white/70' : 'text-slate-400'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Location, rating and sort */}
        <div className="mb-4 grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Barangay
            <select value={barangay} onChange={(event) => setBarangay(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700">
              <option value="all">All of Daet</option>
              {barangays.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Rating
            <select value={minRating} onChange={(event) => setMinRating(Number(event.target.value))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700">
              {RATING_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Sort by
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-700">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        {/* Category Filters */}
        {categories.length > 1 && (
          <div className="mb-6 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  category === cat
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-700'
                }`}
              >
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Results Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-3">
                <div className="h-44 rounded-xl bg-slate-200" />
                <div className="mt-3 h-4 w-2/3 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : filteredSpots.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {filteredSpots.map((spot) => (
              <Link
                key={spot.id}
                href={`/info/visitor/tourist-spots/${spot.id}`}
                className="group rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md hover:border-sky-200"
              >
                {/* Image */}
                <div className="relative overflow-hidden rounded-xl">
                  <img
                    src={getImageUrl(spot.featured_image || spot.images, defaultSpotImage)}
                    alt={spot.name}
                    className="aspect-[16/10] h-auto w-full object-cover transition group-hover:scale-105 sm:aspect-auto sm:h-44"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={(event) => toggleFavorite(event, spot.id)}
                    className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-red-500 shadow-sm transition hover:bg-white sm:h-8 sm:w-8"
                    aria-label={favorites.has(spot.id) ? `Remove ${spot.name} from favourites` : `Save ${spot.name} to favourites`}
                    aria-pressed={favorites.has(spot.id)}
                  >
                    <Heart className={`h-4 w-4 ${favorites.has(spot.id) ? 'fill-current' : ''}`} />
                  </button>
                  <div className="absolute left-2 top-2 rounded-lg bg-slate-900/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                    {listingType === 'all' ? getListingTypeLabel(spot.listing_type) : (spot.category || 'Destination')}
                  </div>
                  {spot.featured && (
                    <div className="absolute right-2 bottom-2 rounded-lg bg-amber-500/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                      Featured
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="mt-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-bold text-slate-800">{spot.name}</h3>
                    {Number(spot.review_count) > 0 ? (
                      <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" aria-label={`Rated ${Number(spot.rating).toFixed(1)} out of 5 from ${spot.review_count} reviews`}>
                        <Star className="h-3 w-3 fill-current" />
                        {Number(spot.rating).toFixed(1)}
                        <span className="font-normal text-amber-600/80">({spot.review_count})</span>
                      </div>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">New</span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-1">{spot.barangay ? `${spot.barangay} · ` : ''}{spot.location || 'Daet, Camarines Norte'}</span>
                    {spot.price_range ? <span className="ml-auto shrink-0 font-semibold text-slate-600" aria-label={`Price range ${spot.price_range.length} of 4`}>{spot.price_range}</span> : null}
                  </div>

                  {spot.description && (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{spot.description}</p>
                  )}

                  {spot.opening_hours && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="line-clamp-1">{spot.opening_hours}</span>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-sky-600">
                    View Details <ChevronRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <MapPin className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <p className="text-sm text-slate-500">No places found</p>
            <p className="mt-1 text-xs text-slate-400">
              {hasActiveFilters ? 'Try adjusting your search or filters' : 'Listings for this section are coming soon'}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-xs font-semibold text-sky-600 hover:underline"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        )}
      </div>
    </main>
  )
}