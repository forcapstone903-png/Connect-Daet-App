'use client'

import { useEffect, useState } from 'react'
import AttractionCard from '@/app/(subsystems)/info/components/attractions/AttractionCard'
import { supabase } from '@/lib/supabase'

export default function FeaturedAttractions() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.from('info_tourist_spots').select('*').eq('featured', true).limit(8)
        setItems(data || [])
      } catch (e) {
        console.error('Error loading featured attractions', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold mb-3">Featured Attractions</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <>
            <span role="status" className="sr-only">Loading featured attractions</span>
            {[1, 2, 3].map((item) => (
              <div key={item} aria-hidden="true" className="animate-pulse overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="h-40 bg-gray-200" />
                <div className="space-y-2 p-3">
                  <div className="h-4 w-3/4 rounded-full bg-gray-200" />
                  <div className="h-3 w-1/2 rounded-full bg-gray-200" />
                </div>
              </div>
            ))}
          </>
        ) : items.map(a => <AttractionCard key={a.id} attraction={a} />)}
      </div>
    </div>
  )
}
