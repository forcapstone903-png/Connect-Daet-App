'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronRight,
  Clock,
  Compass,
  Heart,
  MapPin,
  Search,
  Star,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const defaultSpotImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80'

function getImageUrl(value, fallback) {
  if (Array.isArray(value) && value.length > 0) return value[0]
  if (typeof value === 'string' && value.trim()) return value
  if (value?.gallery_images?.length) return value.gallery_images[0]
  return fallback
}

export default function TouristSpotsPage() {
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [favorites, setFavorites] = useState(new Set())

  useEffect(() => {
    let ignore = false

    const loadSpots = async () => {
      try {
        const { data, error } = await supabase
          .from('info_tourist_spots')
          .select('*')
          .eq('status', 'active')
          .order('rating', { ascending: false })

        if (!ignore) {
          if (error) {
            console.error('Error loading tourist spots:', error)
            setSpots([])
          } else {
            setSpots(data || [])
          }
          setLoading(false)
        }
      } catch (error) {
        console.error('Tourist spots fetch failed:', error)
        if (!ignore) setLoading(false)
      }
    }

    loadSpots()

    return () => {
      ignore = true
    }
  }, [])

  const categories = useMemo(() => {
    const set = new Set(spots.filter((s) => s.category).map((s) => s.category))
    return ['all', ...set]
  }, [spots])

  const filteredSpots = useMemo(() => {
    let result = spots

    if (category !== 'all') {
      result = result.filter((s) => (s.category || '').toLowerCase() === category.toLowerCase())
    }

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter((s) => {
        const haystack = [s.name, s.location, s.category, s.description].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }

    return result
  }, [spots, category, search])

  const toggleFavorite = (spotId) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(spotId)) {
        next.delete(spotId)
      } else {
        next.add(spotId)
      }
      return next
    })
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[1200px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        {/* Header */}
        <header className="sticky top-3 z-30 mb-6 rounded-[20px] border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur md:px-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/visitor" className="flex items-center gap-3">
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
                    placeholder="Search destinations..."
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </label>

            <Link
              href="/visitor"
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
                placeholder="Search destinations..."
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </header>

        {/* Hero */}
        <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white">
          <div className="relative h-40 bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-600 sm:h-48">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),_transparent_30%),linear-gradient(135deg,_rgba(2,6,23,0.1),_rgba(15,23,42,0.45))]" />
            <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
              <div>
                <h1 className="text-2xl font-bold text-white sm:text-4xl">Explore Daet</h1>
                <p className="mt-2 text-sm text-cyan-50/90 sm:text-base">
                  Discover beaches, landmarks, and hidden gems across Camarines Norte
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-50">
                  <Compass className="h-3.5 w-3.5" />
                  {filteredSpots.length} destinations
                </span>
              </div>
            </div>
          </div>
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
                href={`/tourist-spots/${spot.id}`}
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
                    onClick={(e) => {
                      e.preventDefault()
                      toggleFavorite(spot.id)
                    }}
                    className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-red-500 shadow-sm transition hover:bg-white sm:h-8 sm:w-8"
                    aria-label="Toggle favorite"
                  >
                    <Heart className={`h-4 w-4 ${favorites.has(spot.id) ? 'fill-current' : ''}`} />
                  </button>
                  <div className="absolute left-2 top-2 rounded-lg bg-slate-900/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                    {spot.category || 'Destination'}
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
                    <div className="flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 flex-shrink-0">
                      <Star className="h-3 w-3 fill-current" />
                      {Number(spot.rating || 0).toFixed(1)}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="line-clamp-1">{spot.location || 'Daet, Camarines Norte'}</span>
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
            <Compass className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <p className="text-sm text-slate-500">No destinations found</p>
            <p className="mt-1 text-xs text-slate-400">Try adjusting your search or filters</p>
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setCategory('all')
              }}
              className="mt-3 text-xs font-semibold text-sky-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </main>
  )
}