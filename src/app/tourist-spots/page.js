'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, MapPin, Star } from 'lucide-react'

export default function TouristSpotsPage() {
  const router = useRouter()
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadSpots = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('info_tourist_spots')
        .select('*')
        .eq('status', 'published')
        .order('rating', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        setError(error.message)
        setSpots([])
      } else {
        setSpots(data || [])
      }
      setLoading(false)
    }

    loadSpots()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Tourist spots</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Explore all public tourist spots</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">Browse every published tourist spot in one place, with location, rating, and short descriptions.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to dashboard
          </button>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">All tourist spots</h2>
              <p className="mt-2 text-sm text-slate-500">Click any spot card to learn more and plan your next visit.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm text-slate-600">
              <MapPin size={16} className="text-teal-500" />
              {spots.length} spots available
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 h-44 rounded-3xl bg-slate-200" />
                <div className="h-4 w-3/4 rounded-full bg-slate-200" />
                <div className="mt-3 h-3 w-1/2 rounded-full bg-slate-200" />
                <div className="mt-5 space-y-3">
                  <div className="h-3 rounded-full bg-slate-200" />
                  <div className="h-3 rounded-full bg-slate-200" />
                </div>
              </div>
            ))
          ) : error ? (
            <div className="col-span-full rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
              <p className="font-semibold">Unable to load tourist spots</p>
              <p className="mt-2 text-sm">{error}</p>
            </div>
          ) : spots.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
              No tourist spot entries are available yet.
            </div>
          ) : (
            spots.map((spot) => (
              <div key={spot.id} className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-teal-300">
                <div className="h-52 bg-linear-to-br from-teal-400 to-blue-500" />
                <div className="p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">{spot.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">{spot.location}</p>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      <Star size={14} className="text-amber-500" />
                      {spot.rating || '—'}
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-slate-600">{spot.description?.slice(0, 140) || 'No description available.'}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span className="rounded-full bg-slate-50 px-3 py-2">{spot.category || 'General'}</span>
                    <span className="rounded-full bg-slate-50 px-3 py-2">{spot.status || 'Published'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
