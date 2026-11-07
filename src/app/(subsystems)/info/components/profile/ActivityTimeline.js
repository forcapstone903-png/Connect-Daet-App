'use client'

export default function ActivityTimeline({ activities = [] }) {
  if (!activities.length) return <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200 text-sm text-gray-500">No recent activity.</div>

  return (
    <div className="space-y-3">
      {activities.map((act) => (
        <div key={act.id} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-700">{(act.type || 'A').charAt(0).toUpperCase()}</div>
            <div className="flex-1 text-sm">
              <div className="font-medium text-gray-800">{act.title || act.type}</div>
              <div className="text-xs text-gray-500">{act.description || ''}</div>
            </div>
            <div className="text-xs text-gray-400">{act.created_at ? new Date(act.created_at).toLocaleString() : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
