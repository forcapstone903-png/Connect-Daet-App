'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, CalendarDays, Clock, Loader, MapPin, Ticket, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'

export default function EventDetailPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params.id
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState(null)
  const [error, setError] = useState(null)

  async function fetchEvent() {
    try {
      const { data, error } = await supabase
        .from('info_events')
        .select('*')
        .eq('id', eventId)
        .eq('status', 'published')
        .single()

      if (error) throw error
      setEvent(data)
    } catch (err) {
      console.error('Error loading event:', err)
      setError('Event not found or unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const cookieSession = getAuthCookieFromDocument()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const activeSession = session || (cookieSession?.logged_in ? { user: { id: cookieSession.user_id } } : null)

        if (!activeSession?.user) {
          router.push('/login')
          return
        }

        setAuthChecking(false)
        await fetchEvent()
      } catch (err) {
        console.error('Auth error:', err)
        router.push('/login')
      }
    }

    checkAuth()
  }, [router, eventId])

  const getMediaUrl = (value, fallback = null) => {
    if (Array.isArray(value) && value.length > 0 && value[0]) return value[0]
    if (typeof value === 'string' && value.trim()) return value
    return fallback
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBA'
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (timeStr) => {
    if (!timeStr) return ''
    return timeStr
  }

  const getCategoryColor = (category) => {
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

  if (authChecking || loading) {
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
          <Link href="/user/events" className="mt-4 inline-block rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
            Back to Events
          </Link>
        </div>
      </main>
    )
  }

  const firstImage = getMediaUrl(event.featured_image || event.images)
  const firstVideo = getMediaUrl(event.videos || event.video_url)
  const primaryMedia = firstVideo || firstImage

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[900px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        <Link href="/user/events" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-sky-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Events
        </Link>

        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          {primaryMedia ? (
            <div className="relative h-64 w-full md:h-80">
              {firstVideo ? (
                <video src={firstVideo} className="h-full w-full object-cover" controls preload="metadata" />
              ) : (
                <img src={firstImage} alt={event.title} className="h-full w-full object-cover" />
              )}
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
            <div className="flex h-48 w-full items-center justify-center bg-gradient-to-br from-sky-100 to-emerald-100">
              <CalendarDays className="h-16 w-16 text-sky-400" />
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
                  {formatTime(event.start_time)}
                  {event.end_time && ` – ${formatTime(event.end_time)}`}
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
                <button className="rounded-full bg-white px-4 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-50">
                  Register Now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}