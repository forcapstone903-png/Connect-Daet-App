'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { Pencil, Star as StarIcon, ThumbsUp, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCacheKey, invalidateCache } from '@/lib/cache'
import { decodeReviewText, encodeReviewText } from '@/lib/reviewText'
import { isOptionalRating, isValidRating } from '@/lib/ratings.mjs'
import { usePublicSettings } from '@/lib/usePublicSettings'
import MediaUpload from '@/app/(subsystems)/info/components/MediaUpload'
import StarRating from '@/app/(subsystems)/info/components/user/StarRating'

const PAGE_SIZE = 3

const EMPTY_SUMMARY = {
  total_count: 0,
  average_rating: null,
  five_star_count: 0,
  four_star_count: 0,
  three_star_count: 0,
  two_star_count: 0,
  one_star_count: 0,
}

export default function RatingsReviews({ attractionId, userId, onRatingSummaryChange, onOpenPhoto }) {
  const { settings: publicSettings } = usePublicSettings()
  const [reviews, setReviews] = useState([])
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [reviewCount, setReviewCount] = useState(0)
  const [myReview, setMyReview] = useState(null)
  const [userRating, setUserRating] = useState(0)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [reviewPhotoUrl, setReviewPhotoUrl] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingReviews, setLoadingReviews] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const modalOpen = reviewModalOpen || deleteConfirmOpen
  const [helpfulVotes, setHelpfulVotes] = useState({})
  const [helpfulCounts, setHelpfulCounts] = useState({})
  const requestId = useRef(0)
  const loadedCount = useRef(0)
  const reviewTriggerRef = useRef(null)

  useEffect(() => {
    if (!modalOpen) return undefined

    const trigger = reviewTriggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setReviewModalOpen(false)
        setDeleteConfirmOpen(false)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
      trigger?.focus()
    }
  }, [modalOpen])

  const removeReviewPhoto = async (url) => {
    const response = await fetch('/info/api/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ bucket: 'profile-media', url }),
    })
    const result = await response.json()
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Unable to remove the review photo.')
    }
  }

  const loadReviews = useCallback(async (append = false) => {
    if (!attractionId) return

    const request = ++requestId.current
    const offset = append ? loadedCount.current : 0
    if (append) setLoadingMore(true)
    else {
      loadedCount.current = 0
      setLoadingReviews(true)
      setLoadError('')
    }

    try {
      const reviewPage = (columns) => {
        const baseQuery = supabase
          .from('attraction_ratings')
          .select(columns, { count: 'exact' })
          .eq('attraction_type', 'tourist_spot')
          .eq('attraction_id', attractionId)
        const sortedQuery = sortBy === 'recent'
          ? baseQuery.order('created_at', { ascending: false })
          : baseQuery
            .order('rating', { ascending: sortBy === 'lowest', nullsFirst: false })
            .order('created_at', { ascending: false })
        return sortedQuery.order('id', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
      }

      const [summaryResult, firstReviewsResult] = await Promise.all([
        supabase.rpc('get_tourist_spot_rating_summary', { p_attraction_id: attractionId }),
        reviewPage('id, user_id, rating, review_text, pros, cons, photo_url, created_at, office_reply, office_reply_at'),
      ])
      if (summaryResult.error) throw summaryResult.error
      // Office replies need migration 102; without it, load reviews alone.
      const reviewsResult = firstReviewsResult.error?.code === '42703'
        ? await reviewPage('id, user_id, rating, review_text, pros, cons, photo_url, created_at')
        : firstReviewsResult
      if (reviewsResult.error) throw reviewsResult.error

      const rows = reviewsResult.data || []
      const reviewIds = rows.map((review) => review.id)
      const userIds = [...new Set(rows.map((review) => review.user_id))]

      const [profilesResult, helpfulResult, votesResult] = await Promise.all([
        userIds.length
          ? supabase.from('profiles').select('user_id, full_name, profile_image_url').in('user_id', userIds)
          : Promise.resolve({ data: [], error: null }),
        reviewIds.length
          ? supabase
            .from('review_helpfulness')
            .select('review_id')
            .eq('review_type', 'attraction_rating')
            .eq('is_helpful', true)
            .in('review_id', reviewIds)
          : Promise.resolve({ data: [], error: null }),
        userId && reviewIds.length
          ? supabase
            .from('review_helpfulness')
            .select('review_id, is_helpful')
            .eq('review_type', 'attraction_rating')
            .eq('user_id', userId)
            .in('review_id', reviewIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (profilesResult.error) throw profilesResult.error
      if (helpfulResult.error) throw helpfulResult.error
      if (votesResult.error) throw votesResult.error

      const nextSummary = summaryResult.data?.[0] || EMPTY_SUMMARY
      const profileById = Object.fromEntries(
        (profilesResult.data || []).map((profile) => [profile.user_id, profile]),
      )
      const nextReviews = rows.map((review) => ({
        ...review,
        profile: profileById[review.user_id] || null,
      }))
      const nextHelpfulCounts = {}
      ;(helpfulResult.data || []).forEach(({ review_id }) => {
        nextHelpfulCounts[review_id] = (nextHelpfulCounts[review_id] || 0) + 1
      })
      const nextHelpfulVotes = {}
      ;(votesResult.data || []).forEach(({ review_id, is_helpful }) => {
        nextHelpfulVotes[review_id] = is_helpful
      })

      if (request !== requestId.current) return

      setSummary(nextSummary)
      setReviews((current) => append ? [...current, ...nextReviews] : nextReviews)
      setReviewCount(Number(reviewsResult.count || 0))
      loadedCount.current = offset + rows.length
      setHelpfulCounts((current) => append ? { ...current, ...nextHelpfulCounts } : nextHelpfulCounts)
      setHelpfulVotes((current) => append ? { ...current, ...nextHelpfulVotes } : nextHelpfulVotes)
      setHasMore(loadedCount.current < Number(reviewsResult.count || 0))
      onRatingSummaryChange?.({
        average_rating: nextSummary.average_rating,
        total_count: Number(nextSummary.total_count || 0),
      })
    } catch (error) {
      console.error('Failed to load tourist spot reviews:', error)
      if (request === requestId.current) setLoadError('Reviews could not be loaded. Please try again.')
    } finally {
      if (request === requestId.current) {
        setLoadingReviews(false)
        setLoadingMore(false)
      }
    }
  }, [attractionId, onRatingSummaryChange, sortBy, userId])

  useEffect(() => {
    // Load the current rating page and summary from Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReviews()
    return () => {
      requestId.current += 1
    }
  }, [loadReviews])

  useEffect(() => {
    let active = true

    const loadMyReview = async () => {
      if (!userId || !attractionId) {
        setMyReview(null)
        setUserRating(0)
        setReviewTitle('')
        setReviewText('')
        setReviewPhotoUrl('')
        return
      }

      const { data, error } = await supabase
        .from('attraction_ratings')
        .select('id, rating, review_text, pros, cons, photo_url')
        .eq('attraction_type', 'tourist_spot')
        .eq('attraction_id', attractionId)
        .eq('user_id', userId)
        .maybeSingle()

      if (!active) return
      if (error) {
        console.error('Failed to load your tourist spot review:', error)
        setActionError('Your review could not be loaded. Please refresh and try again.')
        return
      }

      const text = decodeReviewText(data?.review_text || '')
      setMyReview(data || null)
      setUserRating(data?.rating || 0)
      setReviewTitle(text.title)
      setReviewText(text.body)
      setReviewPhotoUrl(data?.photo_url || '')
    }

    loadMyReview()
    return () => {
      active = false
    }
  }, [attractionId, userId])

  const handleSubmitRating = async () => {
    setActionError('')

    if (!userId) {
      setActionError('Please sign in to submit a review.')
      return
    }
    if (!isOptionalRating(userRating)) {
      setActionError('Choose a rating from 1 to 5 stars.')
      return
    }
    if (!reviewText.trim()) {
      setActionError('Write a review before submitting.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('attraction_ratings')
        .upsert({
          user_id: userId,
          attraction_type: 'tourist_spot',
          attraction_id: attractionId,
          rating: isValidRating(userRating) ? userRating : null,
          review_text: encodeReviewText(reviewTitle, reviewText),
          pros: myReview?.pros || [],
          cons: myReview?.cons || [],
          photo_url: reviewPhotoUrl || null,
        }, { onConflict: 'user_id,attraction_type,attraction_id' })
        .select('id, rating, review_text, pros, cons, photo_url')
        .single()
      if (error) throw error

      setMyReview(data)
      setReviewModalOpen(false)
      if (myReview?.photo_url && myReview.photo_url !== data.photo_url) {
        try {
          await removeReviewPhoto(myReview.photo_url)
        } catch (cleanupError) {
          console.error('Previous review photo cleanup failed:', cleanupError)
          setActionError('Your review was saved, but the previous photo could not be removed.')
        }
      }
      invalidateCache(getCacheKey('visitor', 'public', 'reviews'))
      await loadReviews()
    } catch (error) {
      console.error('Tourist spot review submission failed:', error)
      setActionError('Your review could not be saved. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRating = async () => {
    if (!userId || !myReview) return

    const photosToRemove = [...new Set([myReview.photo_url, reviewPhotoUrl].filter(Boolean))]
    setActionError('')
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('attraction_ratings')
        .delete()
        .eq('id', myReview.id)
        .eq('user_id', userId)
        .eq('attraction_type', 'tourist_spot')
        .eq('attraction_id', attractionId)
      if (error) throw error

      invalidateCache(getCacheKey('visitor', 'public', 'reviews'))
      setMyReview(null)
      setUserRating(0)
      setReviewTitle('')
      setReviewText('')
      setReviewPhotoUrl('')
      setReviewModalOpen(false)
      setDeleteConfirmOpen(false)
      await loadReviews()
      for (const photoUrl of photosToRemove) {
        try {
          await removeReviewPhoto(photoUrl)
        } catch (cleanupError) {
          console.error('Deleted review photo cleanup failed:', cleanupError)
          setActionError('Your review was deleted, but a photo could not be removed.')
          break
        }
      }
    } catch (error) {
      console.error('Tourist spot review deletion failed:', error)
      setActionError('Your review could not be deleted. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const handleHelpful = async (reviewId) => {
    if (!userId) return

    setActionError('')
    try {
      if (helpfulVotes[reviewId] === true) {
        const { error } = await supabase
          .from('review_helpfulness')
          .delete()
          .eq('review_type', 'attraction_rating')
          .eq('review_id', reviewId)
          .eq('user_id', userId)
        if (error) throw error
        setHelpfulVotes((current) => {
          const next = { ...current }
          delete next[reviewId]
          return next
        })
        setHelpfulCounts((current) => ({
          ...current,
          [reviewId]: Math.max(0, (current[reviewId] || 0) - 1),
        }))
        return
      }

      const { error } = await supabase
        .from('review_helpfulness')
        .upsert({
          review_type: 'attraction_rating',
          review_id: reviewId,
          user_id: userId,
          is_helpful: true,
        }, { onConflict: 'review_type,review_id,user_id' })
      if (error) throw error

      setHelpfulVotes((current) => ({ ...current, [reviewId]: true }))
      setHelpfulCounts((current) => ({
        ...current,
        [reviewId]: (current[reviewId] || 0) + (helpfulVotes[reviewId] === true ? 0 : 1),
      }))
    } catch (error) {
      console.error('Review helpfulness vote failed:', error)
      setActionError('Your helpful vote could not be saved. Please try again.')
    }
  }

  const totalCount = Number(summary.total_count || 0)
  const averageRating = totalCount > 0 ? Number(summary.average_rating) : null
  const distribution = [
    { stars: 5, count: Number(summary.five_star_count || 0) },
    { stars: 4, count: Number(summary.four_star_count || 0) },
    { stars: 3, count: Number(summary.three_star_count || 0) },
    { stars: 2, count: Number(summary.two_star_count || 0) },
    { stars: 1, count: Number(summary.one_star_count || 0) },
  ]

  return (
    <section id="ratings-reviews" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-[white] p-4 shadow-sm sm:p-5" aria-labelledby="ratings-reviews-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ratings-reviews-title" className="text-lg font-bold text-slate-900">Ratings &amp; Reviews</h2>
        {reviewCount > 0 && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
          </span>
        )}
      </div>

      {averageRating === null ? (
        <p className="mt-3 text-sm text-slate-500">No ratings yet</p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(12rem,20rem)] sm:items-center">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold leading-none text-slate-900">{averageRating.toFixed(1)}</span>
            <div>
              <StarRating value={Math.round(averageRating)} readOnly compact />
              <p className="mt-1 text-xs text-slate-500">
                out of 5 · {totalCount} {totalCount === 1 ? 'rating' : 'ratings'}
              </p>
            </div>
          </div>
          <div className="space-y-1" aria-label="Rating distribution">
            {distribution.map(({ stars, count }) => (
              <div key={stars} className="grid grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 text-xs">
                <span className="flex items-center gap-0.5 text-slate-600">
                  {stars}<StarIcon aria-hidden="true" className="h-3 w-3 fill-amber-400 text-amber-500" />
                </span>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${(count / totalCount) * 100}%` }} />
                </div>
                <span className="text-right text-slate-500">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {userId ? (
        <button
          ref={reviewTriggerRef}
          type="button"
          onClick={() => setReviewModalOpen(true)}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          Write a review
        </button>
      ) : (
        <>
          <Link href="/info/login" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700">
            Write a review
          </Link>
          <p className="mt-3 text-sm text-slate-600">
            <Link href="/info/login" className="font-semibold text-blue-700 hover:underline">Sign in</Link>
            {' '}to rate this place.
          </p>
        </>
      )}

      {reviewModalOpen && userId && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReviewModalOpen(false)
          }}
        >
          <section
            className="max-h-[88dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-200 bg-[white] p-4 shadow-2xl sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tourist-review-modal-title"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id="tourist-review-modal-title" className="text-lg font-bold text-slate-900">Write a Review</h3>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                aria-label="Close review form"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-1.5 text-sm font-medium text-slate-700">How would you rate this place?</p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StarRating value={userRating} onChange={setUserRating} label="Rate this place" />
              <span aria-live="polite" className="text-xs text-slate-500">
                {userRating ? `${userRating} / 5 stars` : 'Rating optional'}
              </span>
            </div>

            <label className="mb-3 block text-sm font-medium text-slate-700">
              Share your experience
              <textarea
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
                placeholder="Write your review here... What did you like or dislike? How was your visit?"
                rows={4}
                maxLength={2000}
                required
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <div className="mb-3">
              <p className="mb-2 text-sm font-medium text-slate-700">Add photos <span className="font-normal text-slate-400">(optional)</span></p>
              <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 [&>div:first-child]:justify-center">
                <MediaUpload
                  key={`${attractionId}-${myReview?.id || 'new'}`}
                  bucket="profile-media"
                  folder={`reviews/${userId}`}
                  mediaType="image"
                  maxSizeMB={5}
                  buttonText="Upload photos"
                  onUploadComplete={(url) => setReviewPhotoUrl(url || '')}
                  onUploadError={(message) => setActionError(message)}
                  onUploadStateChange={setUploadingPhoto}
                />
              </div>
              {myReview?.photo_url && reviewPhotoUrl === myReview.photo_url ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenPhoto?.(myReview.photo_url, 'Your review photo')}
                    aria-label="Preview your review photo"
                    className="h-20 w-20 overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    <img src={myReview.photo_url} alt="Your review photo" className="h-full w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewPhotoUrl('')}
                    disabled={submitting || deleting || uploadingPhoto}
                    className="min-h-11 rounded-full bg-rose-50 px-4 text-sm font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                  >
                    Remove current photo
                  </button>
                </div>
              ) : null}
            </div>

            <details className="mb-4 rounded-lg border border-slate-200 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-600">Review title (optional)</summary>
              <input
                type="text"
                value={reviewTitle}
                onChange={(event) => setReviewTitle(event.target.value)}
                placeholder="Sum up your visit"
                maxLength={120}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </details>

            {actionError && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                disabled={submitting || deleting || uploadingPhoto}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitRating}
                disabled={submitting || deleting || uploadingPhoto}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {deleteConfirmOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) setDeleteConfirmOpen(false)
          }}
        >
          <section
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-review-title"
            aria-describedby="delete-review-description"
          >
            <h3 id="delete-review-title" className="text-base font-bold text-slate-900">Delete your review?</h3>
            <p id="delete-review-description" className="mt-2 text-sm leading-6 text-slate-600">
              This will permanently remove your rating and review for this destination.
            </p>
            {actionError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setActionError('')
                  setDeleteConfirmOpen(false)
                }}
                disabled={deleting}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRating}
                disabled={deleting}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete review'}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {(loadError || (actionError && !reviewModalOpen && !deleteConfirmOpen)) && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError || actionError}
          {loadError && (
            <button type="button" onClick={() => loadReviews()} className="ml-2 font-semibold underline">
              Try again
            </button>
          )}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Visitor ratings &amp; reviews</h3>
        {reviewCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Sort
            <select
              value={sortBy}
              onChange={(event) => {
                setShowAllReviews(false)
                setSortBy(event.target.value)
              }}
              className="min-h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
            >
              <option value="recent">Most recent</option>
              <option value="highest">Highest rated</option>
              <option value="lowest">Lowest rated</option>
            </select>
          </label>
        )}
      </div>

      {loadingReviews ? (
        <p className="py-5 text-center text-sm text-slate-500">Loading reviews…</p>
      ) : reviews.length > 0 ? (
        <div className="mt-3 divide-y divide-slate-100">
          {reviews.map((review) => {
            const reviewerName = review.profile?.full_name?.trim() || 'Community member'
            const profileHref = `/info/user/profile/${review.user_id}`
            const reviewContent = decodeReviewText(review.review_text)
            return (
              <article key={review.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 sm:p-4">
                <div className="flex items-start gap-3">
                  <Link href={profileHref} aria-label={`View ${reviewerName}'s profile`} className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-sm font-semibold text-amber-800">
                    {review.profile?.profile_image_url ? (
                      <img src={review.profile.profile_image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : reviewerName[0]?.toUpperCase()}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <Link href={profileHref} className="text-sm font-semibold text-slate-900 hover:text-sky-700">{reviewerName}</Link>
                      <time dateTime={review.created_at} className="text-xs text-slate-500">
                        {new Date(review.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </time>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      {review.rating ? (
                        <>
                          <StarRating value={review.rating} readOnly compact />
                          <span className="text-xs font-medium text-slate-600">{review.rating}.0</span>
                        </>
                      ) : <span className="text-xs text-slate-500">No rating</span>}
                    </div>
                    <div className="mt-3 flex min-w-0 items-start gap-3">
                      <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                        {reviewContent.title && <h4 className="text-sm font-semibold text-slate-900">{reviewContent.title}</h4>}
                        {reviewContent.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{reviewContent.body}</p>}
                      </div>
                      {review.photo_url && (
                        <button
                          type="button"
                          onClick={() => onOpenPhoto?.(review.photo_url, 'Photo shared with this review')}
                          aria-label="Open photo shared with this review"
                          className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 sm:h-24 sm:w-24"
                        >
                          <img src={review.photo_url} alt="Photo shared with this review" loading="lazy" className="h-full w-full object-cover" />
                        </button>
                      )}
                    </div>
                    {review.office_reply ? (
                      <div className="mt-2 rounded-lg border-l-4 border-sky-400 bg-sky-50 px-3 py-2">
                        <p className="text-xs font-semibold text-sky-800">
                          Response from the {publicSettings.tourismOfficeName || 'tourism office'}
                          {review.office_reply_at ? ` · ${new Date(review.office_reply_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{review.office_reply}</p>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleHelpful(review.id)}
                        disabled={!userId || review.user_id === userId}
                        aria-pressed={helpfulVotes[review.id] === true}
                        title={!userId ? 'Sign in to mark this review helpful' : review.user_id === userId ? 'You cannot vote on your own review' : undefined}
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-[white] px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          helpfulVotes[review.id] === true ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        {helpfulCounts[review.id] ? `${helpfulCounts[review.id]} Helpful` : 'Helpful'}
                      </button>
                      {myReview?.id === review.id && review.user_id === userId && (
                        <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setReviewModalOpen(true)}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionError('')
                            setDeleteConfirmOpen(true)
                          }}
                          disabled={deleting || submitting || uploadingPhoto}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />{deleting ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="py-4 text-sm text-slate-500">No reviews yet. Be the first to share your experience.</p>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => {
            setShowAllReviews(true)
            loadReviews(true)
          }}
          disabled={loadingMore || loadingReviews}
          className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : showAllReviews ? 'Load more reviews' : `View all reviews (${reviewCount})`}
        </button>
      )}
    </section>
  )
}
