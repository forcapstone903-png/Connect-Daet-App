'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Heart, Pencil, ThumbsUp, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCacheKey, invalidateCache } from '@/lib/cache'
import { decodeReviewText, encodeReviewText } from '@/lib/reviewText'
import { usePublicSettings } from '@/lib/usePublicSettings'
import MediaUpload from '@/app/(subsystems)/info/components/MediaUpload'

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

function StarRating({ value, onChange, readOnly = false, compact = false }) {
  return (
    <div
      className="flex items-center gap-0.5"
      role={readOnly ? 'img' : 'group'}
      aria-label={readOnly ? `${value} out of 5 hearts` : 'Rate this place'}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange(star)}
          aria-label={`${star} heart${star === 1 ? '' : 's'}`}
          aria-pressed={!readOnly && value === star}
          className={`flex items-center justify-center transition ${
            readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
          } ${compact ? 'h-5 w-5' : 'h-9 w-9'}`}
        >
          <Heart className={`${compact ? 'h-4 w-4' : 'h-6 w-6'} ${
            star <= value ? 'fill-rose-500 text-rose-500' : 'text-slate-300'
          }`} />
        </button>
      ))}
    </div>
  )
}

export default function RatingsReviews({ attractionId, userId, onRatingSummaryChange }) {
  const { settings: publicSettings } = usePublicSettings()
  const [reviews, setReviews] = useState([])
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
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
  const [helpfulVotes, setHelpfulVotes] = useState({})
  const [helpfulCounts, setHelpfulCounts] = useState({})
  const requestId = useRef(0)
  const loadedCount = useRef(0)

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
          .select(columns)
          .eq('attraction_type', 'tourist_spot')
          .eq('attraction_id', attractionId)
        const sortedQuery = sortBy === 'recent'
          ? baseQuery.order('created_at', { ascending: false })
          : baseQuery
            .order('rating', { ascending: sortBy === 'lowest' })
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
      loadedCount.current = offset + rows.length
      setHelpfulCounts((current) => append ? { ...current, ...nextHelpfulCounts } : nextHelpfulCounts)
      setHelpfulVotes((current) => append ? { ...current, ...nextHelpfulVotes } : nextHelpfulVotes)
      setHasMore(loadedCount.current < Number(nextSummary.total_count || 0))
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
    if (!Number.isInteger(userRating) || userRating < 1 || userRating > 5) {
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
          rating: userRating,
          review_text: encodeReviewText(reviewTitle, reviewText),
          pros: myReview?.pros || [],
          cons: myReview?.cons || [],
          photo_url: reviewPhotoUrl || null,
        }, { onConflict: 'user_id,attraction_type,attraction_id' })
        .select('id, rating, review_text, pros, cons, photo_url')
        .single()
      if (error) throw error

      setMyReview(data)
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
    if (!window.confirm('Delete your rating and review for this destination?')) return

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
    <section id="ratings-reviews" className="scroll-mt-24 border-t border-slate-200 pt-5" aria-labelledby="ratings-reviews-title">
      <h2 id="ratings-reviews-title" className="text-lg font-bold text-slate-900">Ratings &amp; reviews</h2>

      {averageRating === null ? (
        <p className="mt-2 text-sm text-slate-500">No ratings yet</p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(12rem,20rem)] sm:items-center">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold leading-none text-slate-900">{averageRating.toFixed(1)}</span>
            <div>
              <StarRating value={Math.round(averageRating)} readOnly compact />
              <p className="mt-1 text-xs text-slate-500">
                out of 5 · {totalCount} {totalCount === 1 ? 'review' : 'reviews'}
              </p>
            </div>
          </div>
          <div className="space-y-1" aria-label="Rating distribution">
            {distribution.map(({ stars, count }) => (
              <div key={stars} className="grid grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 text-xs">
                <span className="flex items-center gap-0.5 text-slate-600">
                  {stars}<Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
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
        <div className="mt-4 rounded-xl bg-slate-50 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {myReview ? 'Edit your review' : 'Rate this place'}
            </h3>
            {myReview && (
              <button
                type="button"
                onClick={handleDeleteRating}
                disabled={deleting || submitting || uploadingPhoto}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />{deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>

          <div className="mb-2 flex items-center gap-2">
            <StarRating value={userRating} onChange={setUserRating} />
            <span className="text-xs text-slate-500">{userRating ? `${userRating} / 5` : 'Select hearts'}</span>
          </div>

          {myReview?.photo_url && reviewPhotoUrl === myReview.photo_url ? (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <img src={myReview.photo_url} alt="Your review photo" className="h-20 w-20 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => setReviewPhotoUrl('')}
                disabled={submitting || deleting || uploadingPhoto}
                className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50"
              >
                Remove current photo
              </button>
            </div>
          ) : null}
          <div className="mb-3">
            <p className="mb-1 text-xs font-medium text-slate-600">Review photo <span className="font-normal text-slate-400">(optional)</span></p>
            <MediaUpload
              key={`${attractionId}-${myReview?.id || 'new'}`}
              bucket="profile-media"
              folder={`reviews/${userId}`}
              mediaType="image"
              maxSizeMB={5}
              buttonText={reviewPhotoUrl && reviewPhotoUrl !== myReview?.photo_url ? 'Change photo' : 'Add a photo'}
              onUploadComplete={(url) => setReviewPhotoUrl(url || '')}
              onUploadError={(message) => setActionError(message)}
              onUploadStateChange={setUploadingPhoto}
            />
          </div>

          <label className="mb-2 block text-xs font-medium text-slate-600">
            Review title <span className="font-normal text-slate-400">(optional)</span>
            <input
              type="text"
              value={reviewTitle}
              onChange={(event) => setReviewTitle(event.target.value)}
              placeholder="Sum up your visit"
              maxLength={120}
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-400"
            />
          </label>

          <label className="mb-3 block text-xs font-medium text-slate-600">
            Your review
            <textarea
              value={reviewText}
              onChange={(event) => setReviewText(event.target.value)}
              placeholder="What should other visitors know?"
              rows={3}
              maxLength={2000}
              required
              className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400"
            />
          </label>

          <button
            type="button"
            onClick={handleSubmitRating}
            disabled={submitting || deleting || uploadingPhoto}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {myReview && <Pencil className="h-3.5 w-3.5" />}
            {submitting ? 'Saving…' : myReview ? 'Save review' : 'Submit review'}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          <Link href="/info/login" className="font-semibold text-sky-700 hover:underline">Sign in</Link>
          {' '}to rate this place.
        </p>
      )}

      {(loadError || actionError) && (
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
        <h3 className="text-sm font-semibold text-slate-900">
          Visitor reviews{totalCount > 0 ? ` (${totalCount})` : ''}
        </h3>
        {totalCount > 0 && (
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
              <article key={review.id} className="py-3 first:pt-0">
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
                      <StarRating value={review.rating} readOnly compact />
                      <span className="text-xs font-medium text-slate-600">{review.rating}.0</span>
                    </div>
                    {reviewContent.title && <h4 className="mt-2 text-sm font-semibold text-slate-900">{reviewContent.title}</h4>}
                    {reviewContent.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{reviewContent.body}</p>}
                    {review.photo_url ? (
                      <img src={review.photo_url} alt="Photo shared with this review" loading="lazy" className="mt-2 max-h-64 w-full rounded-lg object-cover sm:max-w-sm" />
                    ) : null}
                    {review.office_reply ? (
                      <div className="mt-2 rounded-lg border-l-4 border-sky-400 bg-sky-50 px-3 py-2">
                        <p className="text-xs font-semibold text-sky-800">
                          Response from the {publicSettings.tourismOfficeName || 'tourism office'}
                          {review.office_reply_at ? ` · ${new Date(review.office_reply_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{review.office_reply}</p>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleHelpful(review.id)}
                      disabled={!userId || review.user_id === userId}
                      aria-pressed={helpfulVotes[review.id] === true}
                      title={!userId ? 'Sign in to mark this review helpful' : review.user_id === userId ? 'You cannot vote on your own review' : undefined}
                      className={`mt-2 inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        helpfulVotes[review.id] === true ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      Helpful{helpfulCounts[review.id] ? ` · ${helpfulCounts[review.id]}` : ''}
                    </button>
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
          {loadingMore ? 'Loading…' : showAllReviews ? 'Load more reviews' : `View all reviews (${totalCount})`}
        </button>
      )}
    </section>
  )
}
