'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function UpcomingEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const now = new Date().toISOString()
        const { data, error } = await supabase.from('info_events').select('*').eq('status', 'published').eq('approval_status', 'approved').gte('start_date', now).order('start_date', { ascending: true }).limit(6)
        if (error) throw error
        setEvents(data || [])
      } catch (e) {
        console.error('Error loading events', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold mb-3">Upcoming Events</h3>
      <ul className="space-y-2 text-sm">
        {loading ? (
          <>
            <li role="status" className="sr-only">Loading upcoming events</li>
            {[1, 2, 3].map((item) => (
              <li key={item} aria-hidden="true" className="flex animate-pulse items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded-full bg-gray-200" />
                  <div className="h-3 w-1/3 rounded-full bg-gray-200" />
                </div>
                <div className="h-3 w-20 rounded-full bg-gray-200" />
              </li>
            ))}
          </>
        ) : events.length ? events.map(ev => (
          <li key={ev.id} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{ev.title}</div>
              <div className="text-xs text-gray-500">{new Date(ev.start_date).toLocaleString()}</div>
            </div>
            <div className="text-xs text-gray-400">{ev.venue || ''}</div>
          </li>
        )) : <li className="text-gray-500">No upcoming events</li>}
      </ul>
    </div>
  )
}
