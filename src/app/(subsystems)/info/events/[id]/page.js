'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Loader,
  MapPin,
  Share2,
  Ticket,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

function formatDate(dateStr) {
  if (!dateStr) return 'TBA'
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function getCategoryColor(category) {
  const colors = {
    festival: 'bg-purple-100 text-purple-700',
    concert: 'bg-red-100 text-red-700',
    exhibition: 'bg-yellow-100 text-yellow-700',
    workshop: 'bg-blue-100 text-blue-700',
    sports: 'bg-cyan-100 text-cyan-700',
    cultural: 'bg-pink-100 text-pink-700',
  }
  return colors[category] || 'bg-slate-100 text-slate-700'
}

export default function PublicEventDetailPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params?.id
  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState(null)
  const [error, setError] = useState(null)
  const [showShareMenu, setShowShareMenu] = useState(false)

  useEffect(() => {
    let ignore = false

    const fetchEvent = async () => {
      try {
        if (!eventId) return

        const { data, error } = await supabase
          .from('info_events')
          .select('*')
          .eq('id', eventId)
          .eq('status', 'published')
          .single()

        if (error) {
          console.error('Error loading event:', error)
          setError('Event not found or unavailable')
        } else if (data && !ignore) {
          setEvent(data)
        }
      } catch (err) {
        console.error('Event fetch failed:', err)
        setError('Event not found or unavailable')
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    fetchEvent()

    return () => {
      ignore = true
    }
  }, [eventId])

  const handleShare = async (platform) => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = event?.title || 'Check out this event'

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
      }

      if (shareUrls[platform]) {
        window.open(shareUrls[platform], '_blank')
      }
    }

    setShowShareMenu(false)
  }

  const handleRegister = () => {
    router.push('/login')
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Loader className="mx-auto mb-4 animate-spin text-slate-600" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    )
  }

  if (error || !event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9] p-6">
        <div className="w-full max-w-md rounded-[24px] border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-red-600">{error || 'Event not found'}</p>
          <Link href="/visitor" className="mt-4 inline-block rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
            Back to Home
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[900px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/visitor"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-sky-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>

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
                <button type="button" onClick={() => handleShare('email')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><span className="inline-flex items-center gap-2">Email</span></button>
                <button type="button" onClick={() => handleShare('copy')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:rounded-b-[14px]">Copy Link</button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          {event.featured_image ? (
            <div className="relative h-64 w-full md:h-80">
              <img src={event.featured_image} alt={event.title} className="h-full w-full object-cover" />
              {event.is_free && (
                <span className="absolute left-4 top-4 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
                  Free
                </span>
              )}
              <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${getCategoryColor(event.category)}`}>
                {event.category || 'General'}
              </span>
            </div>
          ) : (
            <div className="relative flex h-48 w-full items-center justify-center bg-gradient-to-br from-sky-100 to-emerald-100">
              <CalendarDays className="h-16 w-16 text-sky-400" />
              <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${getCategoryColor(event.category)}`}>
                {event.category || 'General'}
              </span>
            </div>
          )}

          <div className="p-5 md:p-8">
            <h1 className="text-2xl font-black text-slate-900 md:text-3xl">{event.title}</h1>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                <CalendarDays className="h-3.5 w-3.5 text-sky-600" />
                {formatDate(event.start_date)}
                {event.end_date && event.end_date !== event.start_date && ` – ${formatDate(event.end_date)}`}
              </span>
              {event.start_time && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                  <Clock className="h-3.5 w-3.5 text-sky-600" />
                  {event.start_time}
                  {event.end_time && ` – ${event.end_time}`}
                </span>
              )}
              {event.location && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                  <MapPin className="h-3.5 w-3.5 text-sky-600" />
                  {event.location}
                </span>
              )}
            </div>

            {event.description && (
              <div className="mt-6">
                <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-400">About This Event</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700 md:text-base">{event.description}</p>
              </div>
            )}

            {(event.organizer || event.max_attendees) && (
              <div className="mt-6 grid gap-3 rounded-[20px] border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                {event.organizer && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Organizer</p>
                      <p className="text-sm font-semibold text-slate-800">{event.organizer}</p>
                    </div>
                  </div>
                )}
                {event.max_attendees > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Ticket className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Attendance</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {event.current_attendees || 0} / {event.max_attendees} registered
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!event.is_free && event.ticket_price != null && (
              <div className="mt-6 flex items-center justify-between rounded-[20px] bg-gradient-to-r from-sky-600 to-emerald-500 p-4 text-white">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">Ticket Price</p>
                  <p className="text-2xl font-black">₱{Number(event.ticket_price).toLocaleString()}</p>
                </div>
                <button
                  onClick={handleRegister}
                  className="rounded-full bg-white px-4 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-50"
                >
                  Register Now
                </button>
              </div>
            )}

            {event.is_free && (
              <div className="mt-6 flex items-center justify-between rounded-[20px] bg-gradient-to-r from-emerald-600 to-teal-500 p-4 text-white">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">Admission</p>
                  <p className="text-2xl font-black">Free Entry</p>
                </div>
                <button
                  onClick={handleRegister}
                  className="rounded-full bg-white px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50"
                >
                  RSVP Now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}