'use client'

export default function QuickStats({ stats = {} }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
      <div className="grid grid-cols-2 gap-4 text-center">
        <div>
          <div className="text-sm text-gray-500">Attractions</div>
          <div className="text-lg font-bold">{stats.attractions || 0}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Events</div>
          <div className="text-lg font-bold">{stats.events || 0}</div>
        </div>
      </div>
    </div>
  )
}
