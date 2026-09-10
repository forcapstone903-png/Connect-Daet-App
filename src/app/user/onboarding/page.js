'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  Check,
  Compass,
  ImagePlus,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  UserPlus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import MediaUpload from '@/app/components/MediaUpload'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject, updateStoredSession } from '@/lib/authCookies'
import { FALLBACK_PLACES, FALLBACK_TOPICS, getOnboardingStepMeta, getRequiredSelectionCount } from '@/lib/onboardingUtils'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [userId, setUserId] = useState('')
  const [topics, setTopics] = useState([])
  const [places, setPlaces] = useState([])
  const [people, setPeople] = useState([])
  const [selectedTopics, setSelectedTopics] = useState([])
  const [selectedPlaces, setSelectedPlaces] = useState([])
  const [followedPeople, setFollowedPeople] = useState([])
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadOptions = async () => {
      const session = getStoredSessionObject()
      const id = session?.user_id || session?.id || ''
      setUserId(id)
      if (!id) {
        router.replace('/login')
        return
      }

      try {
        const [{ data: categoryRows, error: categoryError }, { data: placeRows, error: placeError }, { data: peopleRows, error: peopleError }] = await Promise.all([
          supabase.from('system_categories').select('id, name, icon_emoji').eq('is_active', true).order('sort_order').limit(12),
          supabase.from('info_tourist_spots').select('id, name, category, location, featured_image').eq('status', 'active').order('rating', { ascending: false }).limit(12),
          supabase.from('info_users').select('id, full_name, profile_image_url, user_type').neq('id', id).eq('status', 'active').limit(8),
        ])

        if (categoryError) console.error('Onboarding categories fetch failed:', categoryError)
        if (placeError) console.error('Onboarding places fetch failed:', placeError)
        if (peopleError) console.error('Onboarding people fetch failed:', peopleError)

        setTopics((categoryRows || []).length ? categoryRows : FALLBACK_TOPICS.map((name) => ({ id: name, name, icon_emoji: '' })))
        setPlaces((placeRows || []).length ? placeRows : FALLBACK_PLACES.map((name) => ({ id: name, name })))
        setPeople((peopleRows || []).filter((person) => person.user_type !== 'admin'))
      } catch (loadError) {
        console.error('Onboarding options load failed:', loadError)
        setError('We could not load your welcome setup. Showing default options instead — you can change these later.')
        setTopics(FALLBACK_TOPICS.map((name) => ({ id: name, name, icon_emoji: '' })))
        setPlaces(FALLBACK_PLACES.map((name) => ({ id: name, name })))
      } finally {
        setLoading(false)
      }
    }

    void loadOptions()
  }, [router])

  const progressLabel = useMemo(() => `Step ${step} of 4`, [step])
  const requiredTopics = getRequiredSelectionCount(topics.length || FALLBACK_TOPICS.length, 3)
  const requiredPlaces = getRequiredSelectionCount(places.length || FALLBACK_PLACES.length, 3)
  const canContinue = step === 1 ? selectedTopics.length >= requiredTopics : step === 2 ? selectedPlaces.length >= requiredPlaces : true
  const stepMeta = getOnboardingStepMeta(step)

  const getPlaceHighlight = (place) => {
    const category = (place.category || place.location || '').toString().toLowerCase()

    if (category.includes('beach') || category.includes('coast') || place.name?.toLowerCase().includes('beach')) {
      return 'Beach escape'
    }

    if (category.includes('food') || category.includes('cuisine') || category.includes('restaurant')) {
      return 'Food trail'
    }

    if (category.includes('heritage') || category.includes('history') || category.includes('museum')) {
      return 'Heritage stop'
    }

    if (category.includes('nature') || category.includes('hike') || category.includes('park')) {
      return 'Nature ride'
    }

    return 'Local favorite'
  }

  const toggleSelection = (value, selected, setSelected, limit) => {
    setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : current.length < limit ? [...current, value] : current)
  }

  const completeOnboarding = async () => {
    setSaving(true)
    setError('')
    try {
      const [{ error: preferenceError }, { error: profileError }, { error: userError }] = await Promise.all([
        supabase.from('user_feed_preferences').upsert({ user_id: userId, preferred_categories: selectedTopics, favorite_places: selectedPlaces, onboarding_completed: true, enabled: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
        supabase.from('profiles').upsert({ user_id: userId, profile_image_url: avatarUrl || null, cover_photo_url: coverUrl || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
        avatarUrl ? supabase.from('info_users').update({ profile_image_url: avatarUrl, onboarding_completed: true, updated_at: new Date().toISOString() }).eq('id', userId) : supabase.from('info_users').update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq('id', userId),
      ])
      if (preferenceError) throw preferenceError
      if (profileError) throw profileError
      if (userError) throw userError

      if (followedPeople.length) {
        const { error: followError } = await supabase.from('user_follows').upsert(followedPeople.map((followingId) => ({ follower_id: userId, following_id: followingId })), { onConflict: 'follower_id,following_id' })
        if (followError) throw followError
      }
      updateStoredSession({
        avatar_url: avatarUrl || '',
        profile_image_url: avatarUrl || '',
        onboarding_completed: true,
      })
      router.replace('/user/dashboard')
    } catch (saveError) {
      console.error('Onboarding save failed:', saveError)
      setError(saveError.message || 'Unable to save your preferences right now.')
    } finally {
      setSaving(false)
    }
  }

  const nextStep = () => {
    if (!canContinue) return
    if (step === 4) {
      void completeOnboarding()
      return
    }
    setStep((current) => current + 1)
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Preparing your welcome setup...</main>

  const accentStyles = {
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }

  const stepAccent = accentStyles[stepMeta.accent] || accentStyles.sky

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_35%,_#f1f5f9_100%)] px-3 py-6 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href="/user/dashboard" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-700">
            <ArrowLeft className="h-4 w-4" />
            Skip setup
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600 shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-sky-600" />
            {progressLabel}
          </div>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_25px_70px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-8">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${stepAccent}`}>
              <Compass className="h-3.5 w-3.5" />
              {stepMeta.kicker}
            </div>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">{stepMeta.title}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {step === 1 && 'Choose the experiences you love so we can shape your Daet community feed.'}
                  {step === 2 && 'Add the destinations you want to revisit, explore, and share with others.'}
                  {step === 3 && 'Follow creators, locals, and travelers who match your interests.'}
                  {step === 4 && 'Finish your profile with a photo so people can recognize you in the community.'}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Bell className="h-4 w-4 text-sky-600" />
                Personalized for you
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            {step === 1 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {topics.map((topic) => {
                    const topicHint = {
                      Beaches: 'Sun-soaked escapes',
                      Food: 'Flavor-filled stops',
                      History: 'Stories from the past',
                      Culture: 'Creative local life',
                      Events: 'Live community moments',
                      Nature: 'Fresh-air adventures',
                    }[topic.name] || 'Tailored for you'

                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => toggleSelection(topic.name, selectedTopics, setSelectedTopics, requiredTopics)}
                        className={`rounded-[1.5rem] border p-4 text-left transition ${selectedTopics.includes(topic.name) ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100' : 'border-slate-200 bg-slate-50 hover:border-sky-300 hover:bg-sky-50/50'}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">{topic.icon_emoji || '✦'}</span>
                          {selectedTopics.includes(topic.name) && <Check className="h-4 w-4 text-sky-700" />}
                        </div>
                        <span className="mt-3 block text-sm font-bold text-slate-800">{topic.name}</span>
                        <span className="mt-1 block text-[11px] text-slate-500">{topicHint}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-4 text-xs text-slate-500">{selectedTopics.length} of {requiredTopics} selected</p>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {places.map((place) => {
                    const highlight = getPlaceHighlight(place)
                    const backgroundImage = place.featured_image || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80'

                    return (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => toggleSelection(place.name, selectedPlaces, setSelectedPlaces, requiredPlaces)}
                        className={`overflow-hidden rounded-[1.5rem] border text-left transition ${selectedPlaces.includes(place.name) ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/50'}`}
                      >
                        <div className="relative h-28 w-full overflow-hidden">
                          <img src={backgroundImage} alt="" className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/15 to-transparent" />
                          <div className="absolute left-3 top-3 inline-flex items-center rounded-full border border-white/30 bg-slate-950/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                            {highlight}
                          </div>
                          {selectedPlaces.includes(place.name) && (
                            <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                              <Check className="h-4 w-4" />
                            </div>
                          )}
                        </div>

                        <div className="flex items-start gap-3 p-3">
                          <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                            <MapPin className="h-4 w-4" />
                          </span>

                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="block text-sm font-bold text-slate-800">{place.name}</span>
                              <Star className="h-4 w-4 text-amber-500" />
                            </div>
                            <span className="mt-1 block text-xs text-slate-500">{place.location || place.category || 'Daet destination'}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-4 text-xs text-slate-500">{selectedPlaces.length} of {requiredPlaces} selected</p>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-3">
                  {people.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => setFollowedPeople((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])}
                      className={`flex w-full items-center gap-3 rounded-[1.5rem] border p-3 text-left transition ${followedPeople.includes(person.id) ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-100' : 'border-slate-200 bg-slate-50 hover:border-amber-300 hover:bg-amber-50/50'}`}
                    >
                      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
                        {person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : person.full_name?.slice(0, 2).toUpperCase()}
                      </span>

                      <span className="flex-1 text-left">
                        <span className="block text-sm font-bold text-slate-800">{person.full_name || 'Community member'}</span>
                        <span className="block text-xs text-slate-500">Local travel insider</span>
                      </span>

                      {followedPeople.includes(person.id) ? <Check className="h-4 w-4 text-amber-700" /> : <UserPlus className="h-4 w-4 text-slate-400" />}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setStep(4)} className="mt-5 text-sm font-bold text-slate-500 hover:text-sky-700">Skip for now</button>
              </>
            )}

            {step === 4 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Camera className="h-4 w-4 text-sky-600" />
                      Profile photo
                    </div>
                    <MediaUpload bucket="profile-media" folder={`users/${userId}`} mediaType="image" existingMediaUrl={avatarUrl} onUploadComplete={setAvatarUrl} onUploadError={setError} buttonText="Add photo" maxSizeMB={5} />
                  </div>

                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
                      <ImagePlus className="h-4 w-4 text-violet-600" />
                      Cover photo
                    </div>
                    <MediaUpload bucket="profile-media" folder={`covers/${userId}`} mediaType="image" existingMediaUrl={coverUrl} previewClassName="h-32 w-full aspect-[3/1]" onUploadComplete={setCoverUrl} onUploadError={setError} buttonText="Add cover" maxSizeMB={8} />
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-[1.25rem] border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-800">
                  <ShieldCheck className="h-4 w-4" />
                  Your profile is private by default until you choose to share more.
                </div>

                <button type="button" onClick={completeOnboarding} className="mt-4 text-sm font-bold text-slate-500 hover:text-sky-700">Skip photos and finish</button>
              </>
            )}

            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1 || saving} className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40">
                Back
              </button>

              <div className="flex items-center gap-2">
                {step < 4 ? (
                  <button type="button" onClick={nextStep} disabled={!canContinue} className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-700 disabled:opacity-40">
                    {stepMeta.nextLabel}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" onClick={completeOnboarding} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-700 disabled:opacity-50">
                    {saving ? 'Saving...' : stepMeta.nextLabel}
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
