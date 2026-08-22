'use client'

export default function PointsBadges({ profile }) {
  const points = profile?.points || 0
  const badges = profile?.badges || []
  const level = profile?.level || 'Explorer'

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Points & Badges</h4>
          <p className="text-xs text-gray-500">Level: <span className="font-medium text-gray-700">{level}</span></p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-gray-900">{points}</div>
          <div className="text-xs text-gray-500">points</div>
        </div>
      </div>

      <div className="mt-4 flex gap-2 flex-wrap">
        {badges.length ? badges.map((b, i) => (
          <div key={i} className="rounded-md bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">{b}</div>
        )) : (
          <div className="text-sm text-gray-500">No badges yet.</div>
        )}
      </div>
    </div>
  )
}
