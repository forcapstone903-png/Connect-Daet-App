'use client'

import { useState } from 'react'
import { AlertCircle, Ban, Clock, ExternalLink, User } from 'lucide-react'
import AdminButton from '@/app/(subsystems)/info/components/admin/AdminButton'
import AdminPanel from '@/app/(subsystems)/info/components/admin/AdminPanel'
import AdminAvatar from '@/app/(subsystems)/info/components/admin/AdminAvatar'

const STATUS_CONFIG = {
  pending: { label: 'Pending review', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approved - lifted', color: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rejected - upheld', color: 'bg-red-100 text-red-800' },
  modified: { label: 'Approved - modified', color: 'bg-blue-100 text-blue-800' },
  needs_information: { label: 'Needs information', color: 'bg-purple-100 text-purple-800' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800' },
}

const DECISION_LABELS = {
  uphold: 'Uphold suspension',
  lift: 'Lift suspension',
  modify: 'Modify suspension',
  request_info: 'Request additional information',
}

function formatDate(value) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString()
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-900">{children || 'Not available'}</dd>
    </div>
  )
}

export default function SuspendedAccountReviewCard({ review, onReview }) {
  const [loading, setLoading] = useState(false)
  const [decision, setDecision] = useState('')
  const [notes, setNotes] = useState('')
  const [newDurationDays, setNewDurationDays] = useState(
    review?.original_duration_days ? Math.max(1, review.original_duration_days - 1) : 7
  )
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const statusConfig = STATUS_CONFIG[review?.status] || STATUS_CONFIG.pending
  const canDecide = ['pending', 'needs_information'].includes(review?.status)
  const canReduceDuration = !review?.original_duration_days || review.original_duration_days > 1
  const accountStatus = ['approved'].includes(review?.status)
    ? 'Active'
    : ['pending', 'needs_information', 'rejected', 'modified'].includes(review?.status)
      ? 'Suspended'
      : review?.user_data?.status

  const submitDecision = async (event) => {
    event.preventDefault()
    if (loading || !decision || !notes.trim()) return

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/info/api/admin/suspension-reviews', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: review.id,
          decision,
          notes: notes.trim(),
          ...(decision === 'modify' ? { newDurationDays: Number(newDurationDays) } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to process the review decision.')
      }

      setSuccess(`Decision saved: ${DECISION_LABELS[decision]}.`)
      setDecision('')
      setNotes('')
      await onReview?.()
    } catch (submitError) {
      setError(submitError.message || 'Failed to submit the review decision.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminPanel
      title={
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      }
      description={`Suspension review · Case ${review?.id || 'unknown'}`}
    >
      <div className="space-y-5">
        <section aria-labelledby={`account-${review.id}`} className="flex items-start gap-4">
          <AdminAvatar user={review?.user_data} size={48} />
          <div className="min-w-0 flex-1">
            <h3 id={`account-${review.id}`} className="font-semibold text-gray-900">
              {review?.user_data?.full_name || 'Unknown user'}
            </h3>
            <p className="break-all text-sm text-gray-600">{review?.user_data?.email || 'Email unavailable'}</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Detail label="Account status">{accountStatus}</Detail>
              <Detail label="Account type">{review?.user_data?.user_type}</Detail>
              <Detail label="Registered">{formatDate(review?.user_data?.created_at)}</Detail>
              <Detail label="Profile image">{review?.user_data?.profile_image_url ? 'Available' : 'Not set'}</Detail>
            </dl>
          </div>
        </section>

        <section className="border-t border-gray-200 pt-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Ban className="h-4 w-4 text-gray-500" aria-hidden="true" /> Suspension details
          </h4>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Ban record user ID">{review?.ban_user_id}</Detail>
            <Detail label="Suspension reason">{review?.reason}</Detail>
            <Detail label="Original duration">
              {review?.original_duration_days ? `${review.original_duration_days} days` : 'Indefinite'}
            </Detail>
            <Detail label="Suspended on">{formatDate(review?.suspended_at)}</Detail>
            <Detail label="Original end date">{formatDate(review?.original_expires_at)}</Detail>
            <Detail label="Initiated by">
              {review?.original_suspending_user?.full_name
                || review?.original_suspending_party?.replaceAll('_', ' ')
                || 'System'}
            </Detail>
          </dl>
        </section>

        {review?.report && (
          <section className="border-t border-gray-200 pt-4">
            <h4 className="mb-3 text-sm font-semibold text-gray-800">Reported content and guideline</h4>
            <div className="space-y-3 rounded-lg bg-gray-50 p-4">
              <Detail label="Report reason">{review.report.reason}</Detail>
              <Detail label="Reported item">
                {review.report.reported_item_table && review.report.reported_item_id
                  ? `${review.report.reported_item_table} · ${review.report.reported_item_id}`
                  : 'No content attached'}
              </Detail>
              {review.report.description && <Detail label="Report details">{review.report.description}</Detail>}
              {review.report.resolution && <Detail label="Original moderation rationale">{review.report.resolution}</Detail>}
              {review.report.reported_content && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {review.report.reported_content.label}
                  </p>
                  {review.report.reported_content.title && (
                    <p className="mt-1 text-sm font-semibold text-gray-900">{review.report.reported_content.title}</p>
                  )}
                  {review.report.reported_content.body && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{review.report.reported_content.body}</p>
                  )}
                  {review.report.reported_content.href && (
                    <a
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
                      href={review.report.reported_content.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open reported content <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}
              <a className="inline-flex text-sm font-medium text-blue-700 hover:text-blue-900" href="/info/admin/moderation">
                Open moderation reports
              </a>
              <a className="ml-4 inline-flex text-sm font-medium text-blue-700 hover:text-blue-900" href="/info/community-guidelines">
                Read community guidelines
              </a>
            </div>
          </section>
        )}

        {review?.appeal && (
          <section className="border-t border-gray-200 pt-4">
            <h4 className="mb-2 text-sm font-semibold text-gray-800">User&apos;s appeal</h4>
            <p className="whitespace-pre-wrap rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-gray-800">
              {review.appeal.reason}
            </p>
            <p className="mt-2 text-xs text-gray-500">Submitted {formatDate(review.appeal.created_at)}</p>
          </section>
        )}

        {review?.previous_warnings?.length > 0 && (
          <section className="border-t border-gray-200 pt-4">
            <h4 className="mb-2 text-sm font-semibold text-gray-800">Previous warnings</h4>
            <ul className="space-y-2">
              {review.previous_warnings.map((warning) => (
                <li key={warning.id} className="rounded-lg bg-amber-50 p-3 text-sm">
                  <p className="text-gray-700">{warning.reason}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDate(warning.created_at)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {review?.previous_reviews?.length > 0 && (
          <section className="border-t border-gray-200 pt-4">
            <h4 className="mb-2 text-sm font-semibold text-gray-800">Previous suspension reviews</h4>
            <ul className="space-y-2">
              {review.previous_reviews.map((previous) => (
                <li key={previous.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                  <span className="font-medium capitalize">{previous.status.replaceAll('_', ' ')}</span>
                  <span className="text-gray-500"> · {formatDate(previous.suspended_at)}</span>
                  <p className="mt-1 text-gray-700">{previous.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {review?.history?.length > 0 && (
          <section className="border-t border-gray-200 pt-4">
            <h4 className="mb-2 text-sm font-semibold text-gray-800">Review history</h4>
            <ul className="space-y-2">
              {review.history.map((entry) => (
                <li key={entry.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="font-medium capitalize">{entry.decision.replaceAll('_', ' ')}</p>
                  <p className="mt-1 whitespace-pre-wrap text-gray-700">{entry.notes}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {entry.reviewer?.full_name || 'Moderator'} · {formatDate(entry.recorded_at)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {review?.reviewed_at && (
          <p className="flex items-center gap-2 border-t border-gray-200 pt-4 text-sm text-gray-600">
            <User className="h-4 w-4" aria-hidden="true" />
            Last reviewed by {review?.reviewing_staff?.full_name || 'Moderator'} on {formatDate(review.reviewed_at)}
          </p>
        )}

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {success && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</p>}

        {canDecide && (
          <section className="space-y-3 border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-800">Moderator decision</h4>
            <div className="flex flex-wrap gap-2">
              <AdminButton variant="secondary" icon="check" onClick={() => setDecision('uphold')} disabled={loading}>
                Uphold suspension
              </AdminButton>
              <AdminButton variant="danger" icon="x" onClick={() => setDecision('lift')} disabled={loading}>
                Lift suspension
              </AdminButton>
              <AdminButton
                variant="secondary"
                icon="rotate-cw"
                onClick={() => setDecision('modify')}
                disabled={loading || !canReduceDuration}
                title={!canReduceDuration ? 'A one-day suspension cannot be reduced to a shorter whole-day duration.' : undefined}
              >
                Modify suspension
              </AdminButton>
              <AdminButton variant="secondary" icon="user" onClick={() => setDecision('request_info')} disabled={loading}>
                Request information
              </AdminButton>
            </div>

            {decision && (
              <form onSubmit={submitDecision} className="space-y-3 rounded-lg bg-gray-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  {decision === 'request_info' ? <AlertCircle className="h-4 w-4" aria-hidden="true" /> : <Clock className="h-4 w-4" aria-hidden="true" />}
                  {DECISION_LABELS[decision]}
                </div>
                {decision === 'modify' && (
                  <label className="block text-sm text-gray-700">
                    New suspension duration (days)
                    <input
                      type="number"
                      min="1"
                      max={review?.original_duration_days ? Math.min(365, review.original_duration_days - 1) : 365}
                      value={newDurationDays}
                      onChange={(event) => setNewDurationDays(event.target.value)}
                      required
                      className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                    />
                  </label>
                )}
                <label className="block text-sm text-gray-700">
                  Review note (required)
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    required
                    maxLength={2000}
                    rows={4}
                    className="mt-1 block w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2"
                    placeholder="Explain what evidence you considered and why you reached this decision."
                  />
                </label>
                <p className="text-xs text-gray-500">{notes.length}/2,000 characters · Saved to the case audit history.</p>
                <div className="flex flex-wrap gap-2">
                  <AdminButton type="submit" variant={decision === 'lift' ? 'danger' : 'success'} disabled={loading || !notes.trim()}>
                    {loading ? 'Submitting...' : 'Submit review decision'}
                  </AdminButton>
                  <AdminButton onClick={() => setDecision('')} disabled={loading}>Cancel</AdminButton>
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </AdminPanel>
  )
}
