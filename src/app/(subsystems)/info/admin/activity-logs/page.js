'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AdminEmptyState, AdminPanel, AdminShell, AdminTable } from '@/app/(subsystems)/info/components/admin'

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AdminActivityLogsPage() {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchActivities = useCallback(async () => {
    const response = await fetch('/info/api/activity/track?scope=recent&limit=100', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Unable to load activity logs.')
    }
    return result.activities || []
  }, [])

  const loadActivities = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setActivities(await fetchActivities())
    } catch (loadError) {
      console.error('Admin activity log load failed:', loadError)
      setError(loadError.message || 'Unable to load activity logs.')
    } finally {
      setLoading(false)
    }
  }, [fetchActivities])

  useEffect(() => {
    let active = true
    fetchActivities()
      .then((items) => { if (active) setActivities(items) })
      .catch((loadError) => {
        console.error('Admin activity log load failed:', loadError)
        if (active) setError(loadError.message || 'Unable to load activity logs.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchActivities])

  return (
    <AdminShell
      title="Activity logs"
      eyebrow="Administration"
      description="Review recent community activity and content interactions."
      headerIcon="analytics"
    >
      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <AdminPanel
          title="Recent activity"
          description="Latest 100 recorded account and content actions."
          bodyClassName="!p-0"
          actions={(
            <button type="button" onClick={() => void loadActivities()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
            </button>
          )}
        >
          {error ? <p role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          {loading ? (
            <div className="space-y-3 p-5" aria-label="Loading activity logs">
              {[0, 1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : activities.length ? (
            <AdminTable wrapClassName="border-0 shadow-none">
              <thead>
                <tr><th scope="col">User</th><th scope="col">Activity</th><th scope="col">Details</th><th scope="col">Date</th></tr>
              </thead>
              <tbody>
                {activities.map((item) => (
                  <tr key={item.id}>
                    <td className="min-w-[160px] font-semibold text-slate-800">{item.info_users?.full_name || item.info_users?.email || 'User'}</td>
                    <td className="min-w-[130px] capitalize">{String(item.activity_type || 'activity').replace(/[_-]/g, ' ')}</td>
                    <td className="min-w-[240px] whitespace-normal">{item.description || `${item.entity_type || 'Content'} interaction`}</td>
                    <td className="min-w-[170px]">{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          ) : (
            <div className="p-8"><AdminEmptyState icon="analytics" title="No activity recorded yet" description="New account and content actions will appear here." /></div>
          )}
        </AdminPanel>
      </div>
    </AdminShell>
  )
}
