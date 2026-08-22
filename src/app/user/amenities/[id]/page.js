'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  Globe,
  Heart,
  MapPin,
  PhoneIcon,
  Star,
  Mail,
  Share2,
  Navigation,
  Check,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

function getImageUrl(value, fallback) {
  if (Array.isArray(value) && value.length > 0) return value[0]
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

function getPriceRangeDisplay(priceRange) {
  if (!priceRange) return null
  const clean = priceRange.trim()
  return clean.length > 0 ? clean : null
}

const priceRangeDescriptions = {
  '$': 'Budget-friendly',
  '$$': 'Moderate',
  '$$$': 'Upscale',
  '$$$$': 'Luxury',
}

export default function AmenityDetailPage() {
  const params = useParams()
  const amenityId = params?.id
  const [amenity, setAmenity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [reviews, setReviews] = useState([])
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({ rating: 5, text: '' })
  const [submittingReview, setSubmittingReview] = useState(false)
  const [userName, setUserName] = useState('Guest')
  const [isOpen, setIsOpen] = useState(null)

  useEffect(() => {
    let ignore = false

    const loadData = async () => {
      try {
        // Get session
        const sessionResult = await supabase.auth.getSession()
        const session = sessionResult?.data?.session
        if (session) {
          const fullName = session.user?.user_metadata?.full_name || session.user?.email || 'Guest'
          setUserName(fullName.split(' ')[0] || fullName)
        }

        // Get amenity
        if (!amenityId) return
        const { data, error } = await supabase
          .from('info_amenities')
          .select('*')
          .eq('id', amenityId)
          .single()

        if (!ignore) {
          if (error) {
            console.error('Error loading amenity:', error)
          } else if (data) {
            setAmenity(data)
          }
          setLoading(false)
        }
      } catch (error) {
        console.error('Amenity fetch failed:', error)
        if (!ignore) setLoading(false)
      }
    }

    loadData()

    return () => {
      ignore = true
    }
  }, [amenityId])

  // Check if amenity is open (simplified logic)
  useEffect(() => {
    if (amenity?.opening_hours) {
      // Very basic check - would need proper parsing for production
      const now = new Date()
      const hour = now.getHours()
      setIsOpen(hour >= 9 && hour < 18)
    }
  }, [amenity])

  const handleSubmitReview = async () => {
    if (!reviewForm.text.trim()) return

    setSubmittingReview(true)
    try {
      const newReview = {
        id: Math.random().toString(36).substr(2, 9),
        author: userName,
        rating: reviewForm.rating,
        text: reviewForm.text,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      }

      setReviews((prev) => [newReview, ...prev])
      setReviewForm({ rating: 5, text: '' })
      setShowReviewForm(false)
    } catch (error) {
      console.error('Error submitting review:', error)
    } finally {
      setSubmittingReview(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 h-64 animate-pulse rounded-[20px] bg-slate-200" />
          <div className="space-y-3">
            <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      </main>
    )
  }

  if (!amenity) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">Amenity not found.</p>
          <Link href="/user/amenities" className="mt-3 text-xs font-semibold text-sky-600 hover:underline">
            Back to amenities
          </Link>
        </div>
      </main>
    )
  }

  const priceDisplay = getPriceRangeDisplay(amenity.price_range)

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4 lg:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/user/amenities"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFavorite(!isFavorite)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-red-500 transition hover:bg-red-50"
            >
              <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <Share2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Image Gallery */}
        <div className="mb-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white">
          <img
            src={getImageUrl(
              amenity.featured_image || amenity.images,
              'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=900&q=80'
            )}
            alt={amenity.name}
            className="h-96 w-full object-cover"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title and Rating */}
            <div className="rounded-[20px] border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{amenity.type || 'Amenity'}</p>
                  <h1 className="mt-2 text-3xl font-bold text-slate-900">{amenity.name}</h1>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5">
                    <Star className="h-5 w-5 fill-current text-amber-500" />
                    <span className="text-lg font-bold text-amber-700">{(amenity.rating || 4.5).toFixed(1)}</span>
                  </div>
                  <span className="text-xs text-slate-500">({reviews.length} reviews)</span>
                </div>
              </div>

              {/* Location */}
              {amenity.location && (
                <div className="mt-4 flex items-start gap-2 text-sm text-slate-600">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-400" />
                  <p>{amenity.location}</p>
                </div>
              )}

              {/* Description */}
              {amenity.description && (
                <div className="mt-4 text-sm text-slate-700 leading-relaxed">
                  {amenity.description}
                </div>
              )}
            </div>

            {/* Contact & Hours */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Contact Info */}
              <div className="rounded-[20px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contact</p>

                <div className="mt-4 space-y-3">
                  {amenity.contact_number && (
                    <a
                      href={`tel:${amenity.contact_number}`}
                      className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 transition hover:bg-sky-50"
                    >
                      <PhoneIcon className="h-4 w-4 text-sky-600 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500">Phone</p>
                        <p className="text-sm font-semibold text-slate-900">{amenity.contact_number}</p>
                      </div>
                    </a>
                  )}

                  {amenity.email && (
                    <a
                      href={`mailto:${amenity.email}`}
                      className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 transition hover:bg-sky-50"
                    >
                      <Mail className="h-4 w-4 text-sky-600 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500">Email</p>
                        <p className="text-sm font-semibold text-slate-900">{amenity.email}</p>
                      </div>
                    </a>
                  )}

                  {amenity.website && (
                    <a
                      href={amenity.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 transition hover:bg-sky-50"
                    >
                      <Globe className="h-4 w-4 text-sky-600 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500">Website</p>
                        <p className="truncate text-sm font-semibold text-slate-900">{new URL(amenity.website).hostname}</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>

              {/* Hours & Status */}
              <div className="rounded-[20px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hours</p>

                <div className="mt-4 space-y-3">
                  {amenity.opening_hours ? (
                    <>
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                        <div className="flex items-center gap-3">
                          <Clock className="h-4 w-4 text-sky-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-slate-500">Status</p>
                            <p className={`text-sm font-semibold ${isOpen ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {isOpen ? '🟢 Open' : '🔴 Closed'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Operating Hours</p>
                        <p className="mt-1 text-sm text-slate-900">{amenity.opening_hours}</p>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-xs text-slate-500">Hours not specified</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Services & Amenities */}
            {amenity.amenities && amenity.amenities.length > 0 && (
              <div className="rounded-[20px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Amenities & Services</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {amenity.amenities.map((service, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      {service}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            <div className="rounded-[20px] border border-slate-200 bg-white p-5">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Reviews</h2>
                {!showReviewForm && (
                  <button
                    type="button"
                    onClick={() => setShowReviewForm(true)}
                    className="text-xs font-semibold text-sky-600 hover:underline"
                  >
                    Add review
                  </button>
                )}
              </div>

              {/* Review Form */}
              {showReviewForm && (
                <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-slate-700">Rating</label>
                    <div className="mt-2 flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewForm((prev) => ({ ...prev, rating: star }))}
                          className="text-2xl hover:scale-110"
                        >
                          {star <= reviewForm.rating ? '⭐' : '☆'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="text-xs font-semibold text-slate-700">Your review</label>
                    <textarea
                      value={reviewForm.text}
                      onChange={(e) => setReviewForm((prev) => ({ ...prev, text: e.target.value }))}
                      placeholder="Share your experience..."
                      rows={4}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSubmitReview}
                      disabled={submittingReview || !reviewForm.text.trim()}
                      className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {submittingReview ? 'Posting...' : 'Post Review'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReviewForm(false)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Review List */}
              {reviews.length > 0 ? (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{review.author}</p>
                          <p className="text-xs text-slate-500">{review.date}</p>
                        </div>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <span key={i} className="text-sm">
                              {i < review.rating ? '⭐' : '☆'}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{review.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-sm text-slate-500">No reviews yet. Be the first to review!</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            {/* Price Range */}
            {priceDisplay && (
              <div className="rounded-[20px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Price Range</p>
                <div className="mt-4">
                  <div className="inline-flex rounded-lg bg-blue-50 px-4 py-2">
                    <span className="text-lg font-bold text-blue-700">{priceDisplay}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{priceRangeDescriptions[priceDisplay]}</p>
                </div>
              </div>
            )}

            {/* Map */}
            {amenity.latitude && amenity.longitude && (
              <div className="rounded-[20px] border border-slate-200 bg-white overflow-hidden">
                <div className="bg-gradient-to-b from-sky-100 to-sky-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Location</p>
                  <div className="mt-4 rounded-lg bg-sky-100 p-8 text-center">
                    <MapPin className="mx-auto mb-2 h-8 w-8 text-sky-600" />
                    <p className="text-xs text-slate-600">📍 {amenity.latitude.toFixed(4)}, {amenity.longitude.toFixed(4)}</p>
                    <a
                      href={`https://maps.google.com/?q=${amenity.latitude},${amenity.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Open in Maps
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Booking Link */}
            {amenity.website && (
              <div className="rounded-[20px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Book Now</p>
                <a
                  href={amenity.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 block w-full rounded-lg bg-sky-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-sky-700 transition"
                >
                  Visit Website
                </a>
              </div>
            )}

            {/* Share Card */}
            <div className="rounded-[20px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Share</p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href)
                    alert('Link copied!')
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Copy Link
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
