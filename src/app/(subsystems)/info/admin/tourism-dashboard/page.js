'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import '@/app/(subsystems)/info/components/admin/AdminCalendar.css'
import AdminShell from '@/app/(subsystems)/info/components/admin/AdminShell'
import AdminPanel from '@/app/(subsystems)/info/components/admin/AdminPanel'
import AdminStatCard, { AdminStatGrid } from '@/app/(subsystems)/info/components/admin/AdminStatCard'
import AdminButton from '@/app/(subsystems)/info/components/admin/AdminButton'
import MediaUpload from '@/app/(subsystems)/info/components/MediaUpload'
import { supabase } from '@/lib/supabase'
import { fromCalendarSchedule, toCalendarSchedule } from '@/lib/eventCalendar'
import { getStoredSession } from '@/lib/authCookies'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

const EVENT_COLORS = {
  festival: '#8b5cf6',
  concert: '#ef4444',
  exhibition: '#f59e0b',
  workshop: '#3b82f6',
  sports: '#06b6d4',
  cultural: '#ec4899',
}
const EVENT_CATEGORIES = ['festival', 'concert', 'exhibition', 'workshop', 'sports', 'cultural']
const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'completed']
const EMPTY_EVENT_FORM = {
  id: '',
  title: '',
  description: '',
  location: '',
  start_date: '',
  end_date: '',
  start_time: '',
  end_time: '',
  category: 'festival',
  status: 'draft',
  imageUrl: '',
  videoUrl: '',
  images: [],
  videos: [],
}

async function readAnalytics() {
  const response = await fetch('/info/api/admin/analytics?days=30', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success || !result.analytics?.summary) {
    throw new Error(result.message || 'Unable to load tourism analytics.')
  }
  return result.analytics
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—'
}

export default function TourismOfficerDashboard() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarError, setCalendarError] = useState('')
  const [eventForm, setEventForm] = useState(EMPTY_EVENT_FORM)
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [eventSaving, setEventSaving] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [videoUploading, setVideoUploading] = useState(false)
  const [eventActionError, setEventActionError] = useState('')
  const [eventActionWarning, setEventActionWarning] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const calendarRef = useRef(null)
  const calendarRequestRef = useRef(0)
  const realtime = useRealtimeRefresh({
    channelName: 'tourism-officer-event-calendar',
    tables: ['info_events'],
  })
  const { setRefreshCallback } = realtime

  const refreshCalendar = useCallback(() => {
    const calendar = calendarRef.current?.getApi()
    if (!calendar) return false
    calendar.refetchEvents()
    return true
  }, [])

  useEffect(() => {
    setRefreshCallback(refreshCalendar)
  }, [refreshCalendar, setRefreshCallback])

  const loadCalendarEvents = useCallback(async (fetchInfo, successCallback, failureCallback) => {
    const requestId = ++calendarRequestRef.current
    setCalendarLoading(true)
    setCalendarError('')

    try {
      if (!supabase) throw new Error('The event calendar is not configured.')

      const startDate = fetchInfo.startStr.slice(0, 10)
      const endDate = fetchInfo.endStr.slice(0, 10)
      let query = supabase
        .from('info_events')
        .select('id, title, description, start_date, end_date, start_time, end_time, category, location, status, featured_image, images, videos')
        .eq('approval_status', 'approved')
      if (startDate && endDate) {
        query = query.or(
          `and(start_date.gte.${startDate},start_date.lt.${endDate}),and(start_date.lt.${startDate},end_date.gte.${startDate}),and(start_date.lt.${startDate},end_date.is.null)`
        )
      }
      const { data, error: queryError } = await query.order('start_date', { ascending: true })

      if (queryError) throw queryError

      const events = (data || []).filter((event) => event.status !== 'cancelled').map((event) => ({
        id: event.id,
        title: event.title,
        ...toCalendarSchedule(event),
        backgroundColor: EVENT_COLORS[event.category] || '#2563eb',
        borderColor: EVENT_COLORS[event.category] || '#2563eb',
        textColor: '#ffffff',
        editable: true,
        extendedProps: {
          category: event.category,
          location: event.location,
          description: event.description,
          status: event.status,
          start_date: event.start_date,
          end_date: event.end_date || event.start_date,
          start_time: event.start_time || '',
          end_time: event.end_time || '',
          featured_image: event.featured_image || '',
          images: Array.isArray(event.images) ? event.images : [],
          videos: Array.isArray(event.videos) ? event.videos : [],
        },
      }))

      successCallback(events)
    } catch (loadError) {
      console.error('Tourism dashboard calendar load failed:', loadError)
      if (requestId === calendarRequestRef.current) {
        setCalendarError(loadError.message || 'Unable to load calendar events.')
      }
      failureCallback(loadError)
    } finally {
      if (requestId === calendarRequestRef.current) {
        setCalendarLoading(false)
      }
    }
  }, [])

  const openNewEvent = useCallback((startStr, endStr, allDay = true) => {
    const defaultDate = calendarRef.current?.getApi().getDate() || new Date()
    const schedule = startStr
      ? fromCalendarSchedule(startStr, endStr, allDay)
      : fromCalendarSchedule(defaultDate, null, true)
    setEventForm({ ...EMPTY_EVENT_FORM, ...schedule })
    setEventActionError('')
    setConfirmDelete(false)
    setEventModalOpen(true)
    calendarRef.current?.getApi().unselect()
  }, [])

  const openEditEvent = useCallback((event) => {
    const schedule = fromCalendarSchedule(event.startStr, event.endStr, event.allDay)
    setEventForm({
      ...EMPTY_EVENT_FORM,
      ...schedule,
      id: event.id,
      title: event.title,
      description: event.extendedProps.description || '',
      location: event.extendedProps.location || '',
      category: event.extendedProps.category || 'festival',
      status: event.extendedProps.status || 'draft',
      imageUrl: event.extendedProps.featured_image || event.extendedProps.images[0] || '',
      videoUrl: event.extendedProps.videos[0] || '',
      images: event.extendedProps.images,
      videos: event.extendedProps.videos,
    })
    setEventActionError('')
    setConfirmDelete(false)
    setEventModalOpen(true)
  }, [])

  const updateEventMedia = useCallback((field, url) => {
    const collection = field === 'imageUrl' ? 'images' : 'videos'
    setEventForm((current) => {
      const currentUrl = current[field]
      const existingMedia = Array.isArray(current[collection]) ? current[collection] : []
      const retainedMedia = existingMedia.filter((mediaUrl) => mediaUrl !== currentUrl && mediaUrl !== url)
      const nextUrl = url || ''
      return {
        ...current,
        [field]: nextUrl,
        [collection]: nextUrl ? [nextUrl, ...retainedMedia] : retainedMedia,
      }
    })
    setEventActionError('')
  }, [])

  const saveEvent = useCallback(async (submitEvent) => {
    if (!supabase) {
      setEventActionError('The event service is not configured.')
      return
    }
    if (imageUploading || videoUploading) {
      setEventActionError('Wait for the media uploads to finish before saving.')
      return
    }

    const title = submitEvent.title.trim()
    if (!title || !submitEvent.start_date || !submitEvent.category) {
      setEventActionError('Enter an event title, category, and start date.')
      return
    }
    if (submitEvent.end_date && submitEvent.end_date < submitEvent.start_date) {
      setEventActionError('The end date must be on or after the start date.')
      return
    }
    if (!EVENT_CATEGORIES.includes(submitEvent.category) || !EVENT_STATUSES.includes(submitEvent.status)) {
      setEventActionError('Choose a valid event category and status.')
      return
    }

    setEventSaving(true)
    setEventActionError('')
    try {
      const payload = {
        title,
        description: submitEvent.description.trim(),
        location: submitEvent.location.trim(),
        start_date: submitEvent.start_date,
        end_date: submitEvent.end_date || submitEvent.start_date,
        start_time: submitEvent.start_time || null,
        end_time: submitEvent.end_time || null,
        category: submitEvent.category,
        status: submitEvent.status,
        featured_image: submitEvent.imageUrl || null,
        images: submitEvent.images,
        videos: submitEvent.videos,
      }

      let writeQuery
      if (submitEvent.id) {
        writeQuery = supabase
          .from('info_events')
          .update(payload)
          .eq('id', submitEvent.id)
          .eq('approval_status', 'approved')
      } else {
        let sessionUserId
        try {
          const storedSession = getStoredSession()
          const session = storedSession ? JSON.parse(storedSession) : null
          sessionUserId = session?.user_id || session?.id
        } catch (sessionError) {
          console.error('Unable to read staff session for event creation:', sessionError)
          throw new Error('Your staff session could not be verified. Please sign in again.')
        }
        if (!sessionUserId) throw new Error('Your staff session could not be verified. Please sign in again.')

        writeQuery = supabase
          .from('info_events')
          .insert({ ...payload, created_by: sessionUserId })
      }

      const { data: savedEvent, error: saveError } = await writeQuery.select('id').maybeSingle()
      if (saveError) throw saveError
      if (!savedEvent) throw new Error('The event could not be found or you do not have permission to change it.')

      setEventModalOpen(false)
      setConfirmDelete(false)
      setEventForm(EMPTY_EVENT_FORM)
      calendarRef.current?.getApi().refetchEvents()
    } catch (saveError) {
      console.error('Tourism dashboard event save failed:', saveError)
      setEventActionError(saveError.message || 'Unable to save the event.')
    } finally {
      setEventSaving(false)
    }
  }, [imageUploading, videoUploading])

  const deleteEvent = useCallback(async () => {
    if (!supabase || !eventForm.id) return

    setEventSaving(true)
    setEventActionError('')
    setEventActionWarning('')
    try {
      const response = await fetch('/info/api/admin/events', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [eventForm.id] }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success || !result.deleted) {
        throw new Error(result.message || 'The event could not be found or you do not have permission to delete it.')
      }

      setEventModalOpen(false)
      setConfirmDelete(false)
      setEventForm(EMPTY_EVENT_FORM)
      calendarRef.current?.getApi().refetchEvents()
      setEventActionWarning(result.notificationWarning || '')
    } catch (deleteError) {
      console.error('Tourism dashboard event delete failed:', deleteError)
      setEventActionError(deleteError.message || 'Unable to delete the event.')
    } finally {
      setEventSaving(false)
    }
  }, [eventForm.id])

  const updateEventSchedule = useCallback(async (info) => {
    if (!supabase) {
      info.revert()
      setCalendarError('The event service is not configured.')
      return
    }

    const schedule = fromCalendarSchedule(info.event.startStr, info.event.endStr, info.event.allDay)
    if (!schedule.start_date) {
      info.revert()
      setCalendarError('The event date is invalid.')
      return
    }

    try {
      const { data: updatedEvent, error: updateError } = await supabase
        .from('info_events')
        .update({
          ...schedule,
          start_time: schedule.start_time || null,
          end_time: schedule.end_time || null,
        })
        .eq('id', info.event.id)
        .eq('approval_status', 'approved')
        .select('id')
        .maybeSingle()

      if (updateError) throw updateError
      if (!updatedEvent) throw new Error('The event could not be found or you do not have permission to reschedule it.')

      setCalendarError('')
      calendarRef.current?.getApi().refetchEvents()
    } catch (updateError) {
      console.error('Tourism dashboard event reschedule failed:', updateError)
      info.revert()
      setCalendarError(updateError.message || 'Unable to reschedule the event.')
    }
  }, [])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setReport(await readAnalytics())
    } catch (loadError) {
      console.error('Tourism officer dashboard load failed:', loadError)
      setError(loadError.message || 'Unable to load the tourism dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    readAnalytics()
      .then((nextReport) => {
        if (active) setReport(nextReport)
      })
      .catch((loadError) => {
        console.error('Tourism officer dashboard load failed:', loadError)
        if (active) setError(loadError.message || 'Unable to load the tourism dashboard.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const summary = report?.summary || {}
  const traffic = Array.isArray(report?.traffic) ? report.traffic.slice(-7) : []
  const popularDestinations = Array.isArray(report?.popularDestinations)
    ? report.popularDestinations.slice(0, 5)
    : []

  return (
    <AdminShell
      roleLabel="Tourism Officer"
      eyebrow="Tourism Operations"
      title="Tourism Officer Dashboard"
      description="Manage local destinations, events, public alerts, and tourism performance."
      headerIcon="attractions"
      actions={(
        <div className="flex items-center gap-2">
          <AdminButton
            href="/info/admin/alerts"
            icon="notifications"
            size="icon"
            aria-label="Notifications"
            title="Notifications"
          />
          <AdminButton href="/info/admin/settings/general" icon="settings">
            Settings
          </AdminButton>
          <AdminButton icon="refresh" onClick={() => void loadReport()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </AdminButton>
        </div>
      )}
    >
      <div className="space-y-6">
        {error ? (
          <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadReport()} className="shrink-0 font-semibold underline">
              Try again
            </button>
          </div>
        ) : null}

        <AdminStatGrid>
          <AdminStatCard label="Active places" value={formatNumber(summary.totalPlaces)} icon="attractions" tone="brand" loading={loading} href="/info/admin/tourist-spots" />
          <AdminStatCard label="Published events" value={formatNumber(summary.totalEvents)} icon="events" tone="violet" loading={loading} href="/info/admin/events" />
          <AdminStatCard label="Unique visitors" value={formatNumber(summary.uniqueVisitors)} meta="Last 30 days" icon="users" tone="info" loading={loading} href="/info/admin/analytics" />
          <AdminStatCard label="Alerts sent" value={formatNumber(summary.sentAlerts)} meta={`${formatNumber(summary.alertsDelivered)} inbox deliveries`} icon="warning" tone="warning" loading={loading} href="/info/admin/alerts" />
        </AdminStatGrid>

        <AdminPanel
          title="Event calendar"
          description="Browse published tourism events by date."
          actions={(
            <>
              <AdminButton icon="plus" onClick={() => openNewEvent()}>Create event</AdminButton>
              <AdminButton
                icon="refresh"
                onClick={() => calendarRef.current?.getApi().refetchEvents()}
                disabled={calendarLoading}
              >
                {calendarLoading ? 'Loading…' : 'Refresh'}
              </AdminButton>
            </>
          )}
        >
          <div className="admin-events-calendar admin-tourism-calendar min-w-0">
            {calendarError ? (
              <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {calendarError}
              </p>
            ) : null}
            {eventActionWarning ? (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
                {eventActionWarning}
              </p>
            ) : null}
            <div className="admin-events-calendar-scroll" role="region" aria-label="Tourism events calendar" tabIndex={0}>
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
                buttonText={{ today: 'Today', month: 'Month', week: 'Week' }}
                events={loadCalendarEvents}
                height={620}
                fixedWeekCount
                dayMaxEvents={3}
                eventDisplay="block"
                selectable
                editable
                eventStartEditable
                eventDurationEditable
                eventResizableFromStart
                selectMirror
                nowIndicator
                weekends
                slotDuration="00:30:00"
                slotLabelInterval="01:00:00"
                scrollTime="07:00:00"
                slotEventOverlap={false}
                eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
                noEventsContent="No events scheduled for this month."
                select={(info) => openNewEvent(info.startStr, info.endStr, info.allDay)}
                eventClick={(info) => openEditEvent(info.event)}
                eventDrop={updateEventSchedule}
                eventResize={updateEventSchedule}
                eventDidMount={(info) => {
                  const { category, location } = info.event.extendedProps
                  info.el.title = [info.event.title, category, location].filter(Boolean).join(' · ')
                }}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Event categories">
              {EVENT_CATEGORIES.map((category) => (
                <span key={category} className="inline-flex items-center gap-1.5 capitalize">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EVENT_COLORS[category] }} aria-hidden="true" />
                  {category}
                </span>
              ))}
            </div>
          </div>
        </AdminPanel>

        <div className="grid gap-6 xl:grid-cols-2">
          <AdminPanel title="Visitor traffic" description="Daily page views and estimated unique visitors over the last 30 days.">
            {loading ? (
              <div className="space-y-3" aria-label="Loading visitor traffic">
                {[0, 1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
              </div>
            ) : traffic.length ? (
              <div className="divide-y divide-slate-100">
                {traffic.map((day) => (
                  <div key={day.date} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <time dateTime={day.date} className="font-medium text-slate-700">{day.date}</time>
                    <span className="text-right text-slate-600">
                      {formatNumber(day.pageViews)} views · {formatNumber(day.uniqueVisitors)} visitors
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{error ? 'Traffic data is unavailable.' : 'No visitor traffic is recorded for this period.'}</p>
            )}
          </AdminPanel>

          <AdminPanel title="Most-viewed places" description="Top destinations by recorded views in the selected reporting period.">
            {loading ? (
              <div className="space-y-3" aria-label="Loading popular places">
                {[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
              </div>
            ) : popularDestinations.length ? (
              <div className="divide-y divide-slate-100">
                {popularDestinations.map((place, index) => (
                  <div key={`${place.id || place.name}-${index}`} className="flex items-center justify-between gap-4 py-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{place.name || 'Unnamed place'}</span>
                    <span className="shrink-0 text-sm text-slate-500">{formatNumber(place.pageViews)} views</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{error ? 'Popular destination data is unavailable.' : 'No destination views are recorded for this period.'}</p>
            )}
          </AdminPanel>
        </div>
      </div>

      {eventModalOpen ? (
        <div className="admin-event-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !eventSaving && !imageUploading && !videoUploading) setEventModalOpen(false)
        }}>
          <section
            className="admin-event-modal w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
            style={{ maxHeight: 'min(90vh, 760px)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tourism-event-modal-title"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id="tourism-event-modal-title" className="text-lg font-bold text-slate-900">
                {eventForm.id ? 'Edit event' : 'Create event'}
              </h2>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setEventModalOpen(false)}
                disabled={eventSaving || imageUploading || videoUploading}
                aria-label="Close event form"
              >
                ×
              </button>
            </div>

            {eventActionError ? (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {eventActionError}
              </p>
            ) : null}

            <form onSubmit={(event) => { event.preventDefault(); void saveEvent(eventForm) }} className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Event title *
                <input
                  autoFocus
                  required
                  maxLength={160}
                  value={eventForm.title}
                  onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Enter event title"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Category *
                  <select
                    required
                    value={eventForm.category}
                    onChange={(event) => setEventForm((current) => ({ ...current, category: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {EVENT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Status
                  <select
                    value={eventForm.status}
                    onChange={(event) => setEventForm((current) => ({ ...current, status: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {EVENT_STATUSES.map((status) => (
                      <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Start date *
                  <input
                    required
                    type="date"
                    value={eventForm.start_date}
                    onChange={(event) => setEventForm((current) => ({ ...current, start_date: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  End date
                  <input
                    type="date"
                    min={eventForm.start_date || undefined}
                    value={eventForm.end_date}
                    onChange={(event) => setEventForm((current) => ({ ...current, end_date: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Start time
                  <input
                    type="time"
                    value={eventForm.start_time}
                    onChange={(event) => setEventForm((current) => ({ ...current, start_time: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  End time
                  <input
                    type="time"
                    value={eventForm.end_time}
                    onChange={(event) => setEventForm((current) => ({ ...current, end_time: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-700">
                Location / venue
                <input
                  maxLength={200}
                  value={eventForm.location}
                  onChange={(event) => setEventForm((current) => ({ ...current, location: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Enter location"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Description
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={eventForm.description}
                  onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Describe the event"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Featured image</p>
                  <MediaUpload
                    bucket="events"
                    folder="featured"
                    mediaType="image"
                    existingMediaUrl={eventForm.imageUrl}
                    onUploadComplete={(url) => updateEventMedia('imageUrl', url)}
                    onUploadError={setEventActionError}
                    onUploadStateChange={setImageUploading}
                    buttonText="Upload featured image"
                    maxSizeMB={5}
                    previewClassName="h-28 w-full max-w-xs"
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Promotional video</p>
                  <MediaUpload
                    bucket="events"
                    folder="videos"
                    mediaType="video"
                    existingMediaUrl={eventForm.videoUrl}
                    onUploadComplete={(url) => updateEventMedia('videoUrl', url)}
                    onUploadError={setEventActionError}
                    onUploadStateChange={setVideoUploading}
                    buttonText="Upload promo video"
                    maxSizeMB={20}
                    maxVideoDuration={30}
                    previewClassName="h-28 w-full max-w-xs"
                  />
                </div>
              </div>

              {confirmDelete ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">Delete this event? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <AdminButton onClick={() => setConfirmDelete(false)} disabled={eventSaving || imageUploading || videoUploading}>Keep event</AdminButton>
                    <AdminButton variant="danger" onClick={() => void deleteEvent()} disabled={eventSaving || imageUploading || videoUploading}>
                      {eventSaving ? 'Deleting…' : 'Delete event'}
                    </AdminButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4">
                  {eventForm.id ? (
                    <AdminButton variant="danger" onClick={() => setConfirmDelete(true)} disabled={eventSaving || imageUploading || videoUploading}>
                      Delete
                    </AdminButton>
                  ) : <span />}
                  <div className="flex gap-2">
                    <AdminButton onClick={() => setEventModalOpen(false)} disabled={eventSaving || imageUploading || videoUploading}>Cancel</AdminButton>
                    <AdminButton variant="primary" type="submit" disabled={eventSaving || imageUploading || videoUploading}>
                      {eventSaving ? 'Saving…' : eventForm.id ? 'Save changes' : 'Create event'}
                    </AdminButton>
                  </div>
                </div>
              )}
            </form>
          </section>
        </div>
      ) : null}
    </AdminShell>
  )
}
