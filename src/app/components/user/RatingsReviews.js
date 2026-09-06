'use client'

import { useEffect, useState } from 'react'
import { Award, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function StarRating({ value, onChange, readOnly = false }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange(star)}
          className={`${readOnly ? 'cursor-default' : 'cursor-pointer'} transition hover:scale-110`}
        >
          <Star
            className={`h-5 w-5 ${
              star <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export default function RatingsReviews({ attractionType, attractionId, userId }) {
  const [reviews, setReviews] = useState([])
  const [userRating, setUserRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [pros, setPros] = useState('')
  const [cons, setCons] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userHasRated, setUserHasRated] = useState(false)
  const [helpfulVotes, setHelpfulVotes] = useState({})
  const [showUserPolls, setShowUserPolls] = useState(false)
  const [userPolls, setUserPolls] = useState([])

  useEffect(() => {
    loadReviews()
    loadUserPolls()
  }, [attractionType, attractionId])

  const loadReviews = async () => {
    if (!attractionId) return
    try {
      const { data, error } = await supabase
        .from('attraction_ratings')
        .select('*, info_users!attraction_ratings_user_id_fkey(full_name, email, profile_image_url)')
        .eq('attraction_type', attractionType)
        .eq('attraction_id', attractionId)
        .order('created_at', { ascending: false })
      if (error) throw error

      setReviews(data || [])

      if (userId) {
        const myRating = (data || []).find((r) => r.user_id === userId)
        if (myRating) {
          setUserHasRated(true)
          setUserRating(myRating.rating)
          setReviewText(myRating.review_text || '')
          setPros((myRating.pros || []).join(', '))
          setCons((myRating.cons || []).join(', '))
        }

        const reviewIds = (data || []).map((r) => r.id)
        if (reviewIds.length > 0) {
          const { data: helpfulRows } = await supabase
            .from('review_helpfulness')
            .select('review_id, is_helpful')
            .in('review_id', reviewIds)
            .eq('user_id', userId)

          const helpfulMap = {}
          ;(helpfulRows || []).forEach((h) => {
            helpfulMap[h.review_id] = h.is_helpful
          })
          setHelpfulVotes(helpfulMap)
        }
      }
    } catch (err) {
      console.error('Failed to load ratings:', err)
    }
  }

  const loadUserPolls = async () => {
    try {
      const { data, error } = await supabase
        .from('user_polls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3)
      if (error) throw error
      setUserPolls(data || [])
    } catch (err) {
      console.error('Failed to load user polls:', err)
    }
  }

  const handleSubmitRating = async () => {
    if (!userId) {
      alert('Please log in to rate this attraction.')
      return
    }
    if (userHasRated) {
      alert('You have already rated this attraction.')
      return
    }

    setSubmitting(true)
    try {
      const prosArray = pros.split(',').map((s) => s.trim()).filter(Boolean)
      const consArray = cons.split(',').map((s) => s.trim()).filter(Boolean)

      const { error } = await supabase.from('attraction_ratings').upsert({
        user_id: userId,
        attraction_type: attractionType,
        attraction_id: attractionId,
        rating: userRating,
        pros: prosArray,
        cons: consArray,
        review_text: reviewText.trim() || null,
      }, { onConflict: 'user_id,attraction_type,attraction_id' })
      if (error) throw error

      // Update aggregate rating on parent table
      const tableMap = {
        tourist_spot: 'info_tourist_spots',
        event: 'info_events',
      }
      const table = tableMap[attractionType]
      if (table) {
        const { data: allRatings } = await supabase
          .from('attraction_ratings')
          .select('rating')
          .eq('attraction_type', attractionType)
          .eq('attraction_id', attractionId)

        const avg = (allRatings || []).reduce((sum, r) => sum + r.rating, 0) / (allRatings?.length || 1)
        await supabase
          .from(table)
          .update({ rating: Number(avg.toFixed(2)), review_count: (allRatings || []).length })
          .eq('id', attractionId)
      }

      setUserHasRated(true)
      await loadReviews()
    } catch (err) {
      console.error('Rating failed:', err)
      alert('Failed to submit rating. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleHelpfulness = async (reviewId, isHelpful) => {
    if (!userId) {
      alert('Please log in to vote.')
      return
    }
    try {
      if (helpfulVotes[reviewId] !== undefined) {
        // Remove vote
        await supabase
          .from('review_helpfulness')
          .delete()
          .eq('review_type', 'attraction_rating')
          .eq('review_id', reviewId)
          .eq('user_id', userId)
        setHelpfulVotes((prev) => {
          const next = { ...prev }
          delete next[reviewId]
          return next
        })
      } else {
        await supabase.from('review_helpfulness').insert({
          review_type: 'attraction_rating',
          review_id: reviewId,
          user_id: userId,
          is_helpful: isHelpful,
        })
        setHelpfulVotes((prev) => ({ ...prev, [reviewId]: isHelpful }))
      }
    } catch (err) {
      console.error('Helpfulness vote failed:', err)
    }
  }

  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0'

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          Ratings & Reviews
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-slate-900">{averageRating}</span>
          <div>
            <StarRating value={Math.round(Number(averageRating))} readOnly />
            <p className="text-[10px] text-slate-500">{reviews.length} reviews</p>
          </div>
        </div>
      </div>

      {/* Rating submission */}
      {!userHasRated && userId && (
        <div className="mb-4 rounded-[16px] border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-bold text-slate-900">Share your experience</p>
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold text-slate-600">Your rating</p>
            <StarRating value={userRating} onChange={setUserRating} />
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Pros (comma-separated)</label>
              <input
                type="text"
                value={pros}
                onChange={(e) => setPros(e.target.value)}
                placeholder="e.g. Friendly locals, Beautiful views"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Cons (comma-separated)</label>
              <input
                type="text"
                value={cons}
                onChange={(e) => setCons(e.target.value)}
                placeholder="e.g. Crowded on weekends"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Review</label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="What did you like or dislike?"
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmitRating}
            disabled={submitting}
            className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </button>
        </div>
      )}

      {userHasRated && (
        <div className="mb-4 rounded-[16px] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          ✓ You rated this {userRating}-star{reviewText ? ': "' + reviewText + '"' : ''}
        </div>
      )}

      {/* Reviews list */}
      {reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.map((review) => {
            const reviewerName = review.info_users?.full_name || review.info_users?.email?.split('@')[0] || 'Community member'
            const helpfulCount = review.helpful_count || 0
            return (
              <div key={review.id} className="rounded-[16px] border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-[10px] font-bold text-white">
                      {review.info_users?.profile_image_url ? (
                        <img src={review.info_users.profile_image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        reviewerName[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{reviewerName}</p>
                      <div className="flex items-center gap-2">
                        <StarRating value={review.rating} readOnly />
                        <span className="text-[10px] text-slate-500">
                          {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  {review.rating === 5 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      <Award className="h-3 w-3" /> Top Reviewer
                    </span>
                  )}
                </div>

                {(review.pros || []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {review.pros.map((pro, i) => (
                      <span key={i} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        + {pro}
                      </span>
                    ))}
                  </div>
                )}

                {(review.cons || []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {review.cons.map((con, i) => (
                      <span key={i} className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        - {con}
                      </span>
                    ))}
                  </div>
                )}

                {review.review_text && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{review.review_text}</p>
                )}

                <div className="mt-3 flex items-center gap-3 border-t border-slate-200 pt-2">
                  <button
                    type="button"
                    onClick={() => handleHelpfulness(review.id, true)}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold transition ${
                      helpfulVotes[review.id] === true
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    <ThumbsUp className="h-3 w-3" /> Helpful
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHelpfulness(review.id, false)}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold transition ${
                      helpfulVotes[review.id] === false
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    <ThumbsDown className="h-3 w-3" /> Not helpful
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <Star className="mx-auto mb-2 h-7 w-7 text-slate-400" />
          <p className="text-sm text-slate-500">No reviews yet. Be the first to rate this attraction!</p>
        </div>
      )}

      {/* Community Polls */}
      {userPolls.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowUserPolls(!showUserPolls)}
            className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-slate-700"
          >
            <Award className="h-4 w-4 text-amber-500" />
            Community Polls
            <span className="text-slate-400">{showUserPolls ? '▲' : '▼'}</span>
          </button>

          {showUserPolls && (
            <div className="space-y-2">
              {userPolls.map((poll) => (
                <CommunityPoll key={poll.id} poll={poll} userId={userId} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CommunityPoll({ poll, userId }) {
  const [userVote, setUserVote] = useState(null)
  const [votes, setVotes] = useState({})

  useEffect(() => {
    loadVotes()
  }, [poll.id])

  const loadVotes = async () => {
    try {
      const [{ data: voteRows }, { data: myVote }] = await Promise.all([
        supabase.from('user_poll_votes').select('selected_option_index').eq('poll_id', poll.id),
        userId
          ? supabase.from('user_poll_votes').select('selected_option_index').eq('poll_id', poll.id).eq('user_id', userId).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      const counts = {}
      ;(voteRows || []).forEach((v) => {
        counts[v.selected_option_index] = (counts[v.selected_option_index] || 0) + 1
      })
      setVotes(counts)
      setUserVote(myVote?.selected_option_index ?? null)
    } catch (err) {
      console.error('Failed to load poll votes:', err)
    }
  }

  const handleVote = async (optionIndex) => {
    if (!userId) {
      alert('Please log in to vote.')
      return
    }
    if (userVote !== null || poll.is_closed) return

    const { error } = await supabase.from('user_poll_votes').insert({
      poll_id: poll.id,
      user_id: userId,
      selected_option_index: optionIndex,
    })
    if (error) {
      console.error('Poll vote failed:', error)
      return
    }
    await supabase.from('user_polls').update({ total_votes: (poll.total_votes || 0) + 1 }).eq('id', poll.id)
    await loadVotes()
  }

  const total = Object.values(votes).reduce((sum, n) => sum + n, 0) || poll.total_votes || 0

  return (
    <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-sm font-bold text-slate-900">{poll.question}</p>
      <div className="space-y-1.5">
        {(poll.options || []).map((option, idx) => {
          const count = votes[idx] || 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleVote(idx)}
              disabled={userVote !== null || poll.is_closed || !userId}
              className={`relative block w-full overflow-hidden rounded-[10px] border px-3 py-2 text-left text-sm transition ${
                userVote === idx
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 bg-white hover:border-amber-300'
              }`}
            >
              <span className="relative z-10 flex items-center justify-between">
                <span className="font-medium text-slate-700">{option}</span>
                {userVote === idx && <span className="text-[10px] font-bold text-amber-600">✓ You</span>}
              </span>
              {(userVote !== null || poll.is_closed) && (
                <span className="relative z-10 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{count} votes</span>
                  <span className="font-bold">{pct}%</span>
                </span>
              )}
              {(userVote !== null || poll.is_closed) && (
                <span
                  className="absolute inset-y-0 left-0 bg-amber-100/60 transition-all"
                  style={{ width: `${pct}%` }}
                />
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">{total} total votes</p>
    </div>
  )
}