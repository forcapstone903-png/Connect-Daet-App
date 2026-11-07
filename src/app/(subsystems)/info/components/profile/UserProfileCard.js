'use client'

import Image from 'next/image'

export default function UserProfileCard({ user, profile }) {
  const name = profile?.full_name || user?.user_name || user?.email?.split('@')[0] || 'Traveler'
  const joinDate = profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center text-xl font-semibold text-gray-700">
          {profile?.profile_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.profile_image_url} alt={name} className="h-full w-full object-cover" />
          ) : (
            name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
              <p className="text-sm text-gray-500">{profile?.email || user?.email || '—'}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-600">{profile?.bio || 'No bio yet. Tell people about yourself.'}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <div>Joined: <span className="font-medium text-gray-800">{joinDate}</span></div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-sm font-bold text-gray-900">{profile?.points || 0}</div>
            <div className="text-xs text-gray-500">Points</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-900">{profile?.badges?.length || 0}</div>
            <div className="text-xs text-gray-500">Badges</div>
          </div>
        </div>
      </div>
    </div>
  )
}
