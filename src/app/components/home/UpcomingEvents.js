'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function UpcomingEvents() {
  const [events, setEvents] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const now = new Date().toISOString()
        const { data } = await supabase.from('info_events').select('*').gte('start_date', now).order('start_date', { ascending: true }).limit(6)
        setEvents(data || [])
      } catch (e) {
        console.error('Error loading events', e)
      }
    }
    load()
  }, [])

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold mb-3">Upcoming Events</h3>
      <ul className="space-y-2 text-sm">
        {events.length ? events.map(ev => (
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
