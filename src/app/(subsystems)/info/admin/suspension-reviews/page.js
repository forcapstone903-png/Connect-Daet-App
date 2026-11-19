'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell, AdminPanel } from '@/app/(subsystems)/info/components/admin'
import AdminButton from '@/app/(subsystems)/info/components/admin/AdminButton'
import SuspendedAccountReviewCard from '@/app/(subsystems)/info/components/SuspendedAccountReviewCard'

export default function AdminSuspensionReviewsPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const loadReviews = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/info/api/admin/suspension-reviews', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load suspension reviews.')
      }
      setReviews(Array.isArray(result.reviews) ? result.reviews : [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load suspension reviews.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReviews()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadReviews])

  const stats = useMemo(() => ({
    total: reviews.length,
    pending: reviews.filter((review) => review.status === 'pending').length,
    approved: reviews.filter((review) => review.status === 'approved').length,
    rejected: reviews.filter((review) => review.status === 'rejected').length,
    modified: reviews.filter((review) => review.status === 'modified').length,
    needsInformation: reviews.filter((review) => review.status === 'needs_information').length,
  }), [reviews])

  const visibleReviews = filterStatus === 'all'
    ? reviews
    : reviews.filter((review) => review.status === filterStatus)

  return (
    <AdminShell
      roleLabel="Moderator"
      title="Account Suspension Reviews"
      description="Investigate suspension appeals and record an evidence-based decision."
      headerIcon="shield-check"
      actions={
        <AdminButton icon="refresh" onClick={loadReviews} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </AdminButton>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <AdminPanel title="Total cases" description="All review statuses">
          <div className="text-2xl font-bold">{stats.total}</div>
        </AdminPanel>
        <AdminPanel title="Pending" description="Awaiting review">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
        </AdminPanel>
        <AdminPanel title="Approved" description="Lifted suspensions">
          <div className="text-2xl font-bold text-emerald-600">{stats.approved}</div>
        </AdminPanel>
        <AdminPanel title="Rejected" description="Suspension upheld">
          <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
        </AdminPanel>
        <AdminPanel title="Modified" description="Reduced suspensions">
          <div className="text-2xl font-bold text-blue-600">{stats.modified}</div>
        </AdminPanel>
        <AdminPanel title="Needs information" description="Waiting for user response">
          <div className="text-2xl font-bold text-purple-600">{stats.needsInformation}</div>
        </AdminPanel>
      </div>

      <AdminPanel
        title="Review queue"
        description="Review the account, appeal, report, and relevant history before deciding."
        actions={
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span className="sr-only">Filter cases by status</span>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="needs_information">Needs information</option>
              <option value="approved">Approved</option>
              <option value="modified">Modified</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        }
      >
        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <span>{error}</span>
            <AdminButton size="sm" onClick={loadReviews} disabled={loading}>Retry</AdminButton>
          </div>
        )}
        {loading && reviews.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Loading suspension review cases...</p>
        ) : visibleReviews.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">
            {reviews.length ? 'No cases match this status.' : 'No suspension review cases are available.'}
          </p>
        ) : (
          <div className="space-y-4">
            {visibleReviews.map((review) => (
              <SuspendedAccountReviewCard
                key={review.id}
                review={review}
                onReview={loadReviews}
              />
            ))}
          </div>
        )}
      </AdminPanel>
    </AdminShell>
  )
}
