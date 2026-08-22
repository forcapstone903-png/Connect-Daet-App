'use client'

import { useEffect, useState } from 'react'
import AttractionCard from '@/app/dashboard/user/components/attractions/AttractionCard'
import { supabase } from '@/lib/supabase'

export default function FeaturedAttractions() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.from('info_tourist_spots').select('*').eq('featured', true).limit(8)
        setItems(data || [])
      } catch (e) {
        console.error('Error loading featured attractions', e)
      }
    }
    load()
  }, [])

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold mb-3">Featured Attractions</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(a => <AttractionCard key={a.id} attraction={a} />)}
      </div>
    </div>
  )
}
