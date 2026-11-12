'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, CalendarDays, FileText, Loader, MapPin, MessageSquare, MapPinned, Route, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import UserSectionHeader, { SectionTabs } from '@/app/(subsystems)/info/components/user/UserSectionHeader'

const FAVORITES_API = '/info/api/user/favorites'
// item_type in user_favorites -> display type on this page
const DISPLAY_TYPES = { blog: 'blog', event: 'event', forum: 'forum', spot: 'tourist_spot' }
const PLANNABLE = new Set(['tourist_spot', 'event'])

async function callFavorites(method, body) {
  const response = await fetch(method === 'GET' ? `${FAVORITES_API}?pageSize=100` : FAVORITES_API, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (response.status === 401) {
    const error = new Error('signed_out')
    error.signedOut = true
    throw error
  }
  if (!response.ok || !result.success) throw new Error(result.message || 'Request failed.')
  return result
}

function formatPlanDate(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function UserSavedPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [savedItems, setSavedItems] = useState([])
  const [activeType, setActiveType] = useState('all')
  const [planning, setPlanning] = useState(null)
  const [planSaving, setPlanSaving] = useState(false)
  const [notice, setNotice] = useState('')

  async function loadSavedItems() {
    try {
      const { favorites } = await callFavorites('GET')
      const ids = { blog: [], event: [], forum: [], tourist_spot: [] }
      const plans = new Map()
      for (const favorite of favorites || []) {
        const type = DISPLAY_TYPES[favorite.item_type]
        if (!type) continue
        ids[type].push(favorite.item_id)
        plans.set(`${type}-${favorite.item_id}`, {
          favoriteType: favorite.item_type,
          plannedVisitDate: favorite.planned_visit_date || '',
          tripNotes: favorite.trip_notes || '',
        })
      }

      const [blogs, events, forums, spots] = await Promise.all([
        ids.blog.length
          ? supabase.from('info_blogs').select('id, title, excerpt, featured_image, category, published_at').in('id', ids.blog)
            .eq('status', 'published').eq('approval_status', 'approved')
            .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
          : { data: [] },
        ids.event.length
          ? supabase.from('info_events').select('id, title, description, location, featured_image, category, start_date').in('id', ids.event)
            .eq('status', 'published').eq('approval_status', 'approved')
          : { data: [] },
        ids.forum.length
          ? supabase.from('forum_threads').select('id, title, content, reply_count, last_activity_at').in('id', ids.forum).in('status', ['published', 'closed'])
          : { data: [] },
        ids.tourist_spot.length
          ? supabase.from('info_tourist_spots').select('id, name, description, location, featured_image, category, updated_at').in('id', ids.tourist_spot).eq('status', 'active')
          : { data: [] },
      ])

      const withPlan = (item) => ({ ...item, ...plans.get(`${item.type}-${item.id}`) })
      const results = [
        ...(blogs.data || []).map((item) => withPlan({ ...item, type: 'blog', typeLabel: 'Blog', href: `/info/user/blogs/${item.id}` })),
        ...(events.data || []).map((item) => withPlan({ ...item, type: 'event', typeLabel: 'Event', href: `/info/user/events/${item.id}` })),
        ...(forums.data || []).map((item) => withPlan({ ...item, type: 'forum', typeLabel: 'Forum', href: `/info/user/forums/${item.id}` })),
        ...(spots.data || []).map((item) => withPlan({ ...item, title: item.name, excerpt: item.description, type: 'tourist_spot', typeLabel: 'Destination', href: `/info/visitor/tourist-spots/${item.id}` })),
      ].sort((a, b) => new Date(b.published_at || b.start_date || b.last_activity_at || b.updated_at || 0) - new Date(a.published_at || a.start_date || a.last_activity_at || a.updated_at || 0))

      setSavedItems(results)
      setLoadError('')
    } catch (error) {
      if (error.signedOut) {
        router.push('/info/login?message=Please+sign+in+to+see+your+saved+items.&redirect=/info/user/saved')
        return
      }
      console.error('Error loading saved items:', error)
      setLoadError('Your saved items could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadSavedItems)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removeSaved = async (event, item) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      await callFavorites('POST', { action: 'remove', itemType: item.favoriteType, itemId: item.id })
      setSavedItems((previous) => previous.filter((entry) => !(entry.type === item.type && entry.id === item.id)))
    } catch (error) {
      setNotice(error.message || 'Unable to remove this item.')
    }
  }

  const savePlan = async (clear = false) => {
    if (!planning) return
    setPlanSaving(true)
    try {
      const body = {
        itemType: planning.item.favoriteType,
        itemId: planning.item.id,
        plannedVisitDate: clear ? null : planning.date || null,
        tripNotes: clear ? '' : planning.notes,
      }
      const { favorite } = await callFavorites('PATCH', body)
      setSavedItems((previous) => previous.map((entry) => (entry.type === planning.item.type && entry.id === planning.item.id
        ? { ...entry, plannedVisitDate: favorite.planned_visit_date || '', tripNotes: favorite.trip_notes || '' }
        : entry)))
      setNotice(clear ? 'Removed from your trip.' : 'Trip plan saved.')
      setPlanning(null)
    } catch (error) {
      setNotice(error.message || 'Unable to save your trip plan.')
    } finally {
      setPlanSaving(false)
    }
  }

  const getTypeIcon = (type) => {
    if (type === 'blog') return FileText
    if (type === 'event') return CalendarDays
    if (type === 'forum') return MessageSquare
    if (type === 'tourist_spot') return MapPinned
    return Bookmark
  }

  const getTypeColor = (type) => {
    if (type === 'blog') return 'bg-sky-100 text-sky-700'
    if (type === 'event') return 'bg-emerald-100 text-emerald-700'
    if (type === 'forum') return 'bg-violet-100 text-violet-700'
    if (type === 'tourist_spot') return 'bg-amber-100 text-amber-700'
    return 'bg-slate-100 text-slate-700'
  }

  const tripItems = savedItems
    .filter((item) => item.plannedVisitDate || item.tripNotes)
    .sort((a, b) => (a.plannedVisitDate || '9999').localeCompare(b.plannedVisitDate || '9999'))
  const visibleItems = activeType === 'trip'
    ? tripItems
    : activeType === 'all' ? savedItems : savedItems.filter((item) => item.type === activeType)
  const typeFilters = [
    { value: 'all', label: 'All', count: savedItems.length },
    { value: 'trip', label: 'My trip', count: tripItems.length },
    { value: 'tourist_spot', label: 'Destinations', count: savedItems.filter((item) => item.type === 'tourist_spot').length },
    { value: 'event', label: 'Events', count: savedItems.filter((item) => item.type === 'event').length },
    { value: 'blog', label: 'Blogs', count: savedItems.filter((item) => item.type === 'blog').length },
    { value: 'forum', label: 'Forums', count: savedItems.filter((item) => item.type === 'forum').length },
  ]

  return (
    <main className="tourism-shell usr-section-page usr-library min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-4xl px-3 pb-10 pt-2 sm:px-4 lg:px-6">
        <UserSectionHeader
          eyebrow="Your library"
          title="Saved items & trip"
          description="Bookmarks, plus the destinations and events you plan to visit, in date order."
          emoji="🔖"
          hideMobileTitle
        >
          <span className="usr-section-counter">{savedItems.length} saved</span>
          <Link href="/info/visitor/tourist-spots" className="usr-section-secondary">Find places</Link>
        </UserSectionHeader>

        <SectionTabs label="Saved content filters" value={activeType} onChange={setActiveType} options={typeFilters} />

        {notice ? <p role="status" className="mb-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{notice}</p> : null}
        {loadError ? (
          <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {loadError} <button type="button" onClick={() => { setLoading(true); void loadSavedItems() }} className="ml-1 font-semibold underline">Retry</button>
          </div>
        ) : null}

        {loading ? (
          <div className="usr-section-loading">
            <Loader className="usr-spin mx-auto my-6 text-teal-700" />
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="usr-empty-state usr-pop-in">
            {activeType === 'trip' ? <Route className="mx-auto mb-3 h-8 w-8 text-slate-400" /> : <Bookmark className="mx-auto mb-3 h-8 w-8 text-slate-400" />}
            <p className="text-sm font-semibold text-slate-600">{activeType === 'trip' ? 'Your trip is empty' : 'Nothing saved here yet'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {activeType === 'trip'
                ? 'Save destinations or events, then use “Plan visit” to add a date and notes.'
                : 'Bookmark blogs, events, forum threads, or destinations and they will show up here.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/info/visitor/tourist-spots" className="usr-section-primary">Explore places</Link>
            </div>
          </div>
        ) : (
          <div className="usr-stagger space-y-3">
            {visibleItems.map((item) => {
              const TypeIcon = getTypeIcon(item.type)
              const isPlanning = planning?.item.type === item.type && planning?.item.id === item.id
              return (
                <div key={`${item.type}-${item.id}`} className="usr-list-row group flex-col items-stretch">
                  <div className="flex items-center gap-4">
                    <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-4">
                      {item.featured_image ? (
                        <img src={item.featured_image} alt={item.title} className="h-16 w-16 flex-shrink-0 rounded-2xl object-cover" />
                      ) : (
                        <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl ${getTypeColor(item.type)}`}>
                          <TypeIcon className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getTypeColor(item.type)}`}>{item.typeLabel}</span>
                          {item.plannedVisitDate ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">Visit {formatPlanDate(item.plannedVisitDate)}</span> : null}
                          {item.category && <span className="text-xs text-slate-400">{item.category}</span>}
                        </div>
                        <h3 className="mt-1 truncate text-sm font-bold text-slate-900 group-hover:text-teal-700">{item.title}</h3>
                        {item.location && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" /><span className="truncate">{item.location}</span></p>}
                        {item.tripNotes ? <p className="mt-0.5 line-clamp-2 text-xs text-teal-800">Note: {item.tripNotes}</p> : item.excerpt ? <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.excerpt}</p> : null}
                      </div>
                    </Link>
                    {PLANNABLE.has(item.type) ? (
                      <button
                        type="button"
                        onClick={() => setPlanning(isPlanning ? null : { item, date: item.plannedVisitDate || '', notes: item.tripNotes || '' })}
                        className="usr-press flex-shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                      >
                        {item.plannedVisitDate || item.tripNotes ? 'Edit plan' : 'Plan visit'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(event) => void removeSaved(event, item)}
                      className="usr-press flex-shrink-0 rounded-full p-2.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                      title="Remove from saved"
                      aria-label={`Remove ${item.title} from saved`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {isPlanning ? (
                    <form
                      className="mt-3 grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[auto_1fr_auto]"
                      onSubmit={(event) => { event.preventDefault(); void savePlan() }}
                    >
                      <label className="text-xs font-semibold text-slate-600">
                        Visit date
                        <input type="date" value={planning.date} onChange={(event) => setPlanning((current) => ({ ...current, date: event.target.value }))} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">
                        Notes
                        <input value={planning.notes} onChange={(event) => setPlanning((current) => ({ ...current, notes: event.target.value }))} maxLength={500} placeholder="e.g. go early, bring cash for the entrance fee" className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                      </label>
                      <div className="flex items-end gap-2">
                        <button type="submit" disabled={planSaving} className="usr-section-primary">{planSaving ? 'Saving…' : 'Save'}</button>
                        {item.plannedVisitDate || item.tripNotes ? (
                          <button type="button" disabled={planSaving} onClick={() => void savePlan(true)} className="usr-section-secondary">Remove</button>
                        ) : null}
                      </div>
                    </form>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
