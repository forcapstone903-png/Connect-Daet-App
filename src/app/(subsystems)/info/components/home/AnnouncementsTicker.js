'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AnnouncementsTicker() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.from('info_announcements').select('*').order('created_at', { ascending: false }).limit(5)
        setItems(data || [])
      } catch (e) {
        console.error('Error loading announcements', e)
      }
    }
    load()
  }, [])

  if (!items.length) return null

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-200">
      <div className="text-sm text-gray-600 font-semibold mb-2">Latest Announcements</div>
      <div className="space-y-1 text-sm text-gray-700">
        {items.map(a => (<div key={a.id}>{a.title}</div>))}
      </div>
    </div>
  )
}
