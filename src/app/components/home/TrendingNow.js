'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TrendingNow() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.from('info_tourist_spots').select('*').order('view_count', { ascending: false }).limit(5)
        setItems(data || [])
      } catch (e) {
        console.error('Error loading trending', e)
      }
    }
    load()
  }, [])

  if (!items.length) return null

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-200">
      <div className="text-sm font-semibold text-gray-700 mb-2">Trending Now</div>
      <ol className="text-sm text-gray-600 space-y-2">
        {items.map(i => (<li key={i.id}>{i.name}</li>))}
      </ol>
    </div>
  )
}
