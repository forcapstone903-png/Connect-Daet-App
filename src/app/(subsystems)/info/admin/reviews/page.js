'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/app/(subsystems)/info/components/admin/AdminShell'
import AdminButton from '@/app/(subsystems)/info/components/admin/AdminButton'
import AdminStatCard, { AdminStatGrid } from '@/app/(subsystems)/info/components/admin/AdminStatCard'
import { notifyToast } from '@/lib/toast.mjs'

const API = '/info/api/admin/reviews'

function Stars({ value }) {
  return (
    <span className="text-amber-500" aria-label={`${value} out of 5 stars`}>
      {'★'.repeat(value)}<span className="text-slate-300">{'★'.repeat(5 - value)}</span>
    </span>
  )
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { dateStyle: 'medium' })
}

export default function AdminReviewsPage() {
  const [filters, setFilters] = useState({ spotId: '', rating: '', reply: 'unanswered', page: 1 })
  const [data, setData] = useState({ reviews: [], listings: [], pagination: { page: 1, pages: 0, total: 0 }, unansweredCount: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState({})
  const [editing, setEditing] = useState(null)
  const [savingId, setSavingId] = useState('')
  const [exporting, setExporting] = useState('')
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, isError = false) => {
    setToast(null)
    notifyToast(message, isError ? 'error' : undefined)
  }, [])

  const query = useCallback((extra = {}) => {
    const params = new URLSearchParams()
    if (filters.spotId) params.set('spotId', filters.spotId)
    if (filters.rating) params.set('rating', filters.rating)
    if (filters.reply !== 'all') params.set('reply', filters.reply)
    for (const [key, value] of Object.entries(extra)) params.set(key, String(value))
    return params.toString()
  }, [filters])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}?${query({ page: filters.page })}`, { credentials: 'same-origin', cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load reviews.')
      setData(result)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [filters.page, query])

  useEffect(() => {
    let active = true
    fetch(`${API}?${query({ page: filters.page })}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load reviews.')
        if (active) { setData(result); setError('') }
      })
      .catch((loadError) => { if (active) setError(loadError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters.page, query])

  const saveReply = async (review, reply) => {
    setSavingId(review.id)
    try {
      const response = await fetch(API, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: review.id, reply }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save the reply.')
      showToast(reply ? 'Reply published under the review.' : 'Reply removed.')
      setDrafts((current) => ({ ...current, [review.id]: '' }))
      setEditing(null)
      await load()
    } catch (saveError) {
      showToast(saveError.message, true)
    } finally {
      setSavingId('')
    }
  }

  const exportSummary = async (format) => {
    setExporting(format)
    try {
      const response = await fetch(`${API}?${query({ format })}`, { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.message || 'Export failed.')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `connect-daet-feedback-summary-${new Date().toISOString().slice(0, 10)}.${format}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (exportError) {
      showToast(exportError.message, true)
    } finally {
      setExporting('')
    }
  }

  const setFilter = (key, value) => {
    setLoading(true)
    setFilters((current) => ({ ...current, [key]: value, page: 1 }))
  }

  return (
    <AdminShell
      roleLabel="Tourism Office"
      eyebrow="Tourism Management"
      title="Reviews"
      description="Read visitor reviews for each listing and reply publicly as the tourism office."
      headerIcon="feedback"
      headerClassName="mx-4 sm:mx-6 lg:mx-8"
      actions={(
        <>
          <AdminButton disabled={Boolean(exporting)} onClick={() => void exportSummary('pdf')}>
            {exporting === 'pdf' ? 'Preparing PDF…' : 'Summary PDF'}
          </AdminButton>
          <AdminButton variant="primary" icon="downloads" disabled={Boolean(exporting)} onClick={() => void exportSummary('xlsx')}>
            {exporting === 'xlsx' ? 'Preparing Excel…' : 'Summary Excel'}
          </AdminButton>
        </>
      )}
    >
      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <AdminStatGrid>
          <AdminStatCard label="Matching reviews" value={data.pagination.total} icon="feedback" tone="brand" loading={loading} />
          <AdminStatCard label="Awaiting a reply" value={data.unansweredCount} icon="warning" tone="warning" loading={loading} meta="All listings" />
        </AdminStatGrid>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <label className="flex min-w-[200px] flex-1 flex-col text-xs font-semibold text-slate-600">
            Listing
            <select value={filters.spotId} onChange={(event) => setFilter('spotId', event.target.value)} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal">
              <option value="">All listings</option>
              {data.listings.map((spot) => <option key={spot.id} value={spot.id}>{spot.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            Rating
            <select value={filters.rating} onChange={(event) => setFilter('rating', event.target.value)} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal">
              <option value="">Any</option>
              {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs font-semibold text-slate-600">
            Reply
            <select value={filters.reply} onChange={(event) => setFilter('reply', event.target.value)} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal">
              <option value="unanswered">Awaiting reply</option>
              <option value="answered">Answered</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error} <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">Retry</button>
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">Loading reviews…</p> : null}
        {!loading && !error && !data.reviews.length ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No reviews match these filters.</p>
        ) : null}

        <div className="space-y-3">
          {data.reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{review.spotName}</p>
                  <p className="mt-1 text-sm"><Stars value={review.rating} /> <span className="ml-1 text-slate-500">by {review.reviewer} · {formatDate(review.createdAt)}</span></p>
                </div>
              </div>
              {review.title ? <h3 className="mt-2 font-semibold text-slate-900">{review.title}</h3> : null}
              {review.body ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{review.body}</p> : null}

              {review.officeReply && editing !== review.id ? (
                <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm">
                  <p className="text-xs font-semibold text-sky-800">Tourism office reply · {formatDate(review.officeReplyAt)}{review.officeReplyBy ? ` · ${review.officeReplyBy}` : ''}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{review.officeReply}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => { setEditing(review.id); setDrafts((current) => ({ ...current, [review.id]: review.officeReply })) }} className="text-xs font-semibold text-sky-700 underline">Edit</button>
                    <button type="button" disabled={savingId === review.id} onClick={() => { if (window.confirm('Remove this reply?')) void saveReply(review, '') }} className="text-xs font-semibold text-red-600 underline">Remove</button>
                  </div>
                </div>
              ) : (
                <form
                  className="mt-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const reply = (drafts[review.id] || '').trim()
                    if (!reply) { showToast('Write a reply first.', true); return }
                    void saveReply(review, reply)
                  }}
                >
                  <label className="block text-xs font-semibold text-slate-600" htmlFor={`reply-${review.id}`}>Reply as the tourism office (public)</label>
                  <textarea
                    id={`reply-${review.id}`}
                    value={drafts[review.id] || ''}
                    onChange={(event) => setDrafts((current) => ({ ...current, [review.id]: event.target.value }))}
                    maxLength={2000}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <AdminButton type="submit" variant="primary" disabled={savingId === review.id}>{savingId === review.id ? 'Saving…' : 'Publish reply'}</AdminButton>
                    {editing === review.id ? <AdminButton type="button" onClick={() => setEditing(null)}>Cancel</AdminButton> : null}
                  </div>
                </form>
              )}
            </article>
          ))}
        </div>

        {data.pagination.pages > 1 ? (
          <div className="flex items-center justify-center gap-3 text-sm">
            <AdminButton disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</AdminButton>
            <span>Page {data.pagination.page} of {data.pagination.pages}</span>
            <AdminButton disabled={filters.page >= data.pagination.pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</AdminButton>
          </div>
        ) : null}
      </div>

      {toast ? (
        <div role={toast.isError ? 'alert' : 'status'} aria-live={toast.isError ? 'assertive' : 'polite'} className={`admin-toast ${toast.isError ? 'admin-toast-error' : 'admin-toast-success'}`}>{toast.message}</div>
      ) : null}
    </AdminShell>
  )
}
