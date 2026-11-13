'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { CalendarDays, Clock3, LoaderCircle, MapPin, RefreshCw, TicketCheck } from 'lucide-react'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import UserSectionHeader from '@/app/(subsystems)/info/components/user/UserSectionHeader'
import { eventCoversCalendarDate, normalizeCalendarDate, toCalendarSchedule } from '@/lib/eventCalendar'

function formatEventDate(value) {
  const normalized = normalizeCalendarDate(value)
  if (!normalized) return 'Date to be announced'
  return new Date(`${normalized}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function UserEventCalendarPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestedEventId, setRequestedEventId] = useState('')
  const [selectedDateOverride, setSelectedDateOverride] = useState('')
  const [selectedEventOverride, setSelectedEventOverride] = useState(null)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let active = true
    const loadEvents = async () => {
      try {
        const response = await fetch('/info/api/user/events/calendar', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load your registered events.')
        if (!active) return
        setEvents(Array.isArray(result.events) ? result.events : [])
        setRequestedEventId(new URLSearchParams(window.location.search).get('event') || '')
        setError('')
      } catch (loadError) {
        if (!active) return
        console.error('Registered event calendar load failed:', loadError)
        setError(loadError.message || 'Unable to load your registered events.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadEvents()
    return () => { active = false }
  }, [retryToken])

  const requestedEvent = events.find((event) => String(event.id) === requestedEventId)
  const selectedEventId = selectedEventOverride === null
    ? (requestedEvent ? String(requestedEvent.id) : '')
    : selectedEventOverride
  const initialDate = normalizeCalendarDate(requestedEvent?.start_date) || normalizeCalendarDate(new Date())
  const selectedDate = selectedDateOverride || initialDate

  const calendarEvents = useMemo(() => events
    .filter((event) => normalizeCalendarDate(event.start_date))
    .map((event) => ({
      id: String(event.id),
      title: event.title || 'Registered event',
      ...toCalendarSchedule(event),
      classNames: String(event.id) === requestedEventId ? ['event-calendar-focused'] : [],
      backgroundColor: event.status === 'cancelled' ? '#b91c1c' : '#0f766e',
      borderColor: event.status === 'cancelled' ? '#b91c1c' : '#0f766e',
      extendedProps: { event },
    })), [events, requestedEventId])

  const eventsForSelectedDate = useMemo(() => events.filter((event) => (
    eventCoversCalendarDate(event.start_date, event.end_date, selectedDate)
  )), [events, selectedDate])
  const selectedEvent = events.find((event) => String(event.id) === selectedEventId)

  const selectDate = (date) => {
    const normalized = normalizeCalendarDate(date)
    if (!normalized) return
    setSelectedDateOverride(normalized)
    setSelectedEventOverride('')
  }

  const handleEventClick = (info) => {
    info.jsEvent.preventDefault()
    const event = info.event.extendedProps.event
    const normalized = normalizeCalendarDate(event.start_date)
    if (normalized) setSelectedDateOverride(normalized)
    setSelectedEventOverride(String(event.id))
  }

  const retryLoading = () => {
    setLoading(true)
    setError('')
    setRetryToken((token) => token + 1)
  }

  return (
    <div className="usr-event-calendar-page usr-section-page">
      <UserTopHeader spacer={false} />
      <main className="usr-event-calendar-content mx-auto w-full max-w-[1180px] px-3 pb-8 sm:px-5 lg:px-7">
        <UserSectionHeader
          eyebrow="Your upcoming plans"
          title="Event Calendar"
          description="See the dates of events you have registered for. Select a highlighted date to review its events."
          emoji="🎉"
          hideMobileTitle
        >
          <Link href="/info/visitor/events" className="usr-section-secondary">
            Browse events
          </Link>
        </UserSectionHeader>

        <section className="usr-event-calendar-panel usr-card p-3 sm:p-5" aria-labelledby="registered-events-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="registered-events-heading" className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Registered events</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {events.length ? `${events.length} event${events.length === 1 ? '' : 's'} on your calendar` : 'Your confirmed registrations will appear here.'}
              </p>
            </div>
            <button type="button" onClick={retryLoading} disabled={loading} className="usr-section-secondary min-h-10 px-3 py-2">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Refresh
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p>{error}</p>
              <button type="button" onClick={retryLoading} className="font-bold underline underline-offset-2">Try again</button>
            </div>
          )}

          {loading && (
            <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-semibold text-slate-500" role="status" aria-live="polite">
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              Loading your registered events…
            </div>
          )}

          {!loading && !error && !events.length && (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <CalendarDays className="h-9 w-9 text-slate-400" aria-hidden="true" />
              <h3 className="mt-3 text-base font-bold text-slate-800 dark:text-slate-100">No registered events yet</h3>
              <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">Register for an event and its date will appear highlighted on this calendar.</p>
              <Link href="/info/visitor/events" className="usr-section-primary mt-4">Explore events</Link>
            </div>
          )}

          {!loading && events.length > 0 && (
            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.75fr)]">
              <div className="usr-event-calendar min-w-0" aria-label="Registered events calendar">
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  initialDate={initialDate}
                  height="auto"
                  headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth' }}
                  events={calendarEvents}
                  dayCellClassNames={(info) => (
                    events.some((event) => eventCoversCalendarDate(event.start_date, event.end_date, info.date))
                      ? ['event-calendar-day-registered']
                      : []
                  )}
                  dateClick={(info) => selectDate(info.date)}
                  eventClick={handleEventClick}
                  eventDisplay="block"
                  dayMaxEvents
                  fixedWeekCount={false}
                />
              </div>

              <aside className="usr-event-calendar-details rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50" aria-live="polite">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                    <CalendarDays className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">Selected date</p>
                    <h3 className="mt-1 break-words text-base font-extrabold text-slate-900 dark:text-slate-100">{formatEventDate(selectedDate)}</h3>
                  </div>
                </div>

                {selectedEvent && (
                  <p className="mt-3 rounded-lg bg-teal-100 px-3 py-2 text-xs font-bold text-teal-900 dark:bg-teal-950/60 dark:text-teal-200">
                    Your registered event is highlighted on this date.
                  </p>
                )}

                <div className="mt-4 space-y-3">
                  {eventsForSelectedDate.map((event) => (
                    <Link
                      key={event.id}
                      href={`/info/user/events/${encodeURIComponent(event.id)}`}
                      className={`block rounded-xl border bg-white p-3 transition hover:border-teal-400 hover:shadow-sm dark:bg-slate-950 ${String(event.id) === selectedEventId ? 'border-teal-500 ring-2 ring-teal-100 dark:ring-teal-950' : 'border-slate-200 dark:border-slate-700'}`}
                    >
                      <span className="flex items-start gap-2">
                        <TicketCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-bold text-slate-900 dark:text-slate-100">{event.title || 'Registered event'}</span>
                          {event.status === 'cancelled' && <span className="mt-1 inline-block text-xs font-bold text-red-700 dark:text-red-300">Cancelled</span>}
                          {(event.start_time || event.location || event.venue) && (
                            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                              {event.start_time && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{event.start_time.slice(0, 5)}</span>}
                              {(event.location || event.venue) && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{event.location || event.venue}</span>}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  ))}

                  {!eventsForSelectedDate.length && (
                    <p className="rounded-xl border border-dashed border-slate-300 px-3 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      No registered events on this date. Select a highlighted date to see its events.
                    </p>
                  )}
                </div>
              </aside>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
