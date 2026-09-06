'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ChevronRight,
  Clock,
  Heart,
  MapPin,
  Menu,
  PhoneIcon,
  Search,
  Star,
  X,
  Globe,
  DollarSign,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const amenityCategories = [
  { value: 'all', label: 'All Amenities' },
  { value: 'hotel', label: 'Hotels & Resorts' },
  { value: 'restaurant', label: 'Restaurants & Cafes' },
  { value: 'transport', label: 'Transport & Tours' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'wellness', label: 'Wellness & Spa' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'services', label: 'Services' },
]

const priceRangeColors = {
  '$': 'text-green-600 bg-green-50',
  '$$': 'text-blue-600 bg-blue-50',
  '$$$': 'text-purple-600 bg-purple-50',
  '$$$$': 'text-amber-600 bg-amber-50',
}

function getImageUrl(value, fallback) {
  if (Array.isArray(value) && value.length > 0) return value[0]
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

function getPriceRangeDisplay(priceRange) {
  if (!priceRange) return null
  const clean = priceRange.trim()
  return clean.length > 0 ? clean : null
}

export default function AmenitiesPage() {
  const [amenities, setAmenities] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sortBy, setSortBy] = useState('rating')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [favorites, setFavorites] = useState(new Set())
  const [userName, setUserName] = useState('Traveler')

  useEffect(() => {
    let ignore = false

    const loadAmenities = async () => {
      try {
        const sessionResult = await supabase.auth.getSession()
        const session = sessionResult?.data?.session
        if (session) {
          const fullName = session.user?.user_metadata?.full_name || session.user?.email || 'Traveler'
          setUserName(fullName.split(' ')[0] || fullName)
        }

        const query = supabase
          .from('info_amenities')
          .select('*')
          .or('status.eq.active,status.eq.published')

        const { data, error } = await query

        if (!ignore) {
          if (error) {
            console.error('Error loading amenities:', error)
            setAmenities([])
          } else {
            setAmenities(data || [])
          }
          setLoading(false)
        }
      } catch (error) {
        console.error('Amenities fetch failed:', error)
        if (!ignore) setLoading(false)
      }
    }

    loadAmenities()

    return () => {
      ignore = true
    }
  }, [])

  const filteredAmenities = useMemo(() => {
    let result = amenities

    // Category filter
    if (category !== 'all') {
      result = result.filter((a) => (a.type || '').toLowerCase() === category.toLowerCase())
    }

    // Search filter
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter((a) => {
        const haystack = [a.name, a.location, a.type, a.description].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }

    // Sort
    if (sortBy === 'rating') {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    } else if (sortBy === 'name') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    } else if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    }

    return result
  }, [amenities, category, search, sortBy])

  const toggleFavorite = (amenityId) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(amenityId)) {
        next.delete(amenityId)
      } else {
        next.add(amenityId)
      }
      return next
    })
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[1400px] px-3 pb-8 pt-3 sm:px-4 lg:px-6">
        {/* Header */}
        <header className="sticky top-3 z-30 mb-6 rounded-[20px] border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur md:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 lg:hidden"
                onClick={() => setMobileMenuOpen((value) => !value)}
                aria-label="Toggle menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <Link href="/user/dashboard" className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5 p-1 shadow-sm ring-1 ring-slate-200">
                  <img src="/logo.png" alt="Daet tourism logo" className="h-full w-full rounded-lg object-cover" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Daet</p>
                  <p className="text-base font-bold text-slate-800">Connect</p>
                </div>
              </Link>
            </div>

            <label className="hidden flex-1 items-center justify-center lg:flex">
              <div className="w-full max-w-xl rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 shadow-inner">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search amenities, name, location..."
                    className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </label>

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 self-end sm:self-auto">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-sm font-bold text-white">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">welcome</p>
                <p className="text-sm font-semibold text-slate-800">{userName}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 lg:hidden">
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search amenities..."
                className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Sidebar */}
          <aside
            className={`fixed inset-0 top-20 z-20 bg-white p-4 lg:static lg:inset-auto lg:top-auto lg:z-auto lg:bg-transparent lg:p-0 ${
              mobileMenuOpen ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm lg:border lg:bg-white">
              <div className="mb-4 flex items-center justify-between lg:hidden">
                <h3 className="text-sm font-bold text-slate-800">Filters</h3>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Category Filter */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Category</p>
                  <div className="space-y-1.5">
                    {amenityCategories.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCategory(value)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                          category === value
                            ? 'bg-sky-100 text-sky-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                        {category === value && <ChevronRight className="h-4 w-4" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort */}
                <div className="border-t border-slate-200 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sort By</p>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none"
                  >
                    <option value="rating">Highest Rated</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="newest">Newest</option>
                  </select>
                </div>

                {/* Stats */}
                <div className="border-t border-slate-200 pt-4">
                  <div className="rounded-xl bg-sky-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Results</p>
                    <p className="mt-2 text-2xl font-bold text-sky-700">{filteredAmenities.length}</p>
                    <p className="text-xs text-slate-600">amenities found</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <section>
            {/* Hero */}
            <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white">
              <div className="relative h-40 bg-gradient-to-r from-sky-600 via-cyan-500 to-emerald-500 sm:h-48">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),_transparent_30%),linear-gradient(135deg,_rgba(2,6,23,0.1),_rgba(15,23,42,0.45))]" />
                <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
                  <div>
                    <h1 className="text-2xl font-bold text-white sm:text-4xl">Amenities Directory</h1>
                    <p className="mt-2 text-sm text-cyan-50/90 sm:text-base">
                      Hotels, restaurants, transport, and local services all in one place
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-50">
                      📍 {filteredAmenities.length} places
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Grid */}
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((item) => (
                  <div key={item} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-3">
                    <div className="h-40 rounded-xl bg-slate-200" />
                    <div className="mt-3 h-4 w-2/3 rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : filteredAmenities.length > 0 ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {filteredAmenities.map((amenity) => (
                  <Link
                    key={amenity.id}
                    href={`/user/amenities/${amenity.id}`}
                    className="group rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md hover:border-sky-200"
                  >
                    {/* Image */}
                    <div className="relative overflow-hidden rounded-xl">
                      <img
                        src={getImageUrl(
                          amenity.featured_image || amenity.images,
                          'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=500&q=60'
                        )}
                        alt={amenity.name}
                        className="h-40 w-full object-cover transition group-hover:scale-105"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          toggleFavorite(amenity.id)
                        }}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-500 shadow-sm transition hover:bg-white"
                      >
                        <Heart className={`h-4 w-4 ${favorites.has(amenity.id) ? 'fill-current' : ''}`} />
                      </button>
                      <div className="absolute right-2 bottom-2 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                        {amenity.type || 'Service'}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="mt-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-bold text-slate-800">{amenity.name}</h3>
                        <div className="flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 flex-shrink-0">
                          <Star className="h-3 w-3 fill-current" />
                          {(amenity.rating || 0).toFixed(1)}
                        </div>
                      </div>

                      {/* Location */}
                      <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="line-clamp-1">{amenity.location || 'Daet, Camarines Norte'}</span>
                      </div>

                      {/* Price Range */}
                      {getPriceRangeDisplay(amenity.price_range) && (
                        <div className="mt-2 flex items-center gap-1 text-xs">
                          <DollarSign className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          <span className={`font-semibold ${priceRangeColors[getPriceRangeDisplay(amenity.price_range)] || 'text-slate-600'}`}>
                            {getPriceRangeDisplay(amenity.price_range)}
                          </span>
                        </div>
                      )}

                      {/* Contact */}
                      {amenity.contact_number && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                          <PhoneIcon className="h-3.5 w-3.5 flex-shrink-0" />
                          <a href={`tel:${amenity.contact_number}`} onClick={(e) => e.preventDefault()} className="hover:text-sky-600">
                            {amenity.contact_number}
                          </a>
                        </div>
                      )}

                      {/* Hours */}
                      {amenity.opening_hours && (
                        <div className="mt-2 flex items-start gap-1 text-xs text-slate-500">
                          <Clock className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{amenity.opening_hours}</span>
                        </div>
                      )}

                      {/* Services */}
                      {amenity.amenities && amenity.amenities.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {amenity.amenities.slice(0, 3).map((service, idx) => (
                            <span key={idx} className="inline-block rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-semibold text-sky-700">
                              {service}
                            </span>
                          ))}
                          {amenity.amenities.length > 3 && (
                            <span className="inline-block text-[9px] font-semibold text-slate-500">+{amenity.amenities.length - 3}</span>
                          )}
                        </div>
                      )}

                      {/* CTA */}
                      <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-sky-600">
                        View Details <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-sm text-slate-500">No amenities match your search.</p>
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
          </section>
        </div>
      </div>
    </main>
  )
}
