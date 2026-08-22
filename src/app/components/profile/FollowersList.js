'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function FollowersList({ userId }) {
  const [followers, setFollowers] = useState([])

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      try {
        const { data } = await supabase.from('follows').select('follower:info_users(id, full_name, profile_image_url)').eq('following_id', userId).limit(50)
        setFollowers((data || []).map(r => r.follower))
      } catch (e) {
        console.error('Error loading followers', e)
      }
    }
    load()
  }, [userId])

  if (!followers.length) return null

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Followers</h4>
      <div className="flex flex-wrap gap-3">
        {followers.map(f => (
          <div key={f.id} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full overflow-hidden bg-gray-100">
              {f.profile_image_url ? <img src={f.profile_image_url} alt={f.full_name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-xs">{(f.full_name || 'U').charAt(0)}</div>}
            </div>
            <div className="text-sm text-gray-700">{f.full_name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
