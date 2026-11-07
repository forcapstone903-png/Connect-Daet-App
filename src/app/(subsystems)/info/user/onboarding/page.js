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
  Mic,
  MapPin,
  ShieldCheck,
  Star,
  UserPlus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import UserSectionHeader from '@/app/components/user/UserSectionHeader'
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
  const [permissions, setPermissions] = useState({ location: 'not-requested', camera: 'not-requested', microphone: 'not-requested', notifications: 'not-requested' })
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

  const skipOnboarding = async (event) => {
    event?.preventDefault()
    if (!userId || saving) return

    setSaving(true)
    setError('')
    try {
      const [{ error: preferenceError }, { error: userError }] = await Promise.all([
        supabase
          .from('user_feed_preferences')
          .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq('user_id', userId),
        supabase
          .from('info_users')
          .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq('id', userId),
      ])

      if (preferenceError) throw preferenceError
      if (userError) throw userError

      updateStoredSession({ onboarding_completed: true })
      router.replace('/user/dashboard')
    } catch (skipError) {
      console.error('Onboarding skip save failed:', skipError)
      setError(skipError.message || 'Unable to save your onboarding choice right now.')
      setSaving(false)
    }
  }

  const requestLocationPermission = () => {
    if (!navigator.geolocation) {
      setPermissions((current) => ({ ...current, location: 'unsupported' }))
      return
    }

    navigator.geolocation.getCurrentPosition(
      () => setPermissions((current) => ({ ...current, location: 'allowed' })),
      (error) => setPermissions((current) => ({
        ...current,
        location: error.code === error.PERMISSION_DENIED ? 'blocked' : 'unavailable',
      })),
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    )
  }

  const requestCameraPermission = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissions((current) => ({ ...current, camera: 'unsupported' }))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((track) => track.stop())
      setPermissions((current) => ({ ...current, camera: 'allowed' }))
    } catch (permissionError) {
      console.warn('Camera permission was not granted:', permissionError)
      setPermissions((current) => ({
        ...current,
        camera: permissionError?.name === 'NotAllowedError' ? 'blocked' : 'unavailable',
      }))
    }
  }

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setPermissions((current) => ({ ...current, notifications: 'unsupported' }))
      return
    }

    const permission = await Notification.requestPermission()
    setPermissions((current) => ({
      ...current,
      notifications: permission === 'granted' ? 'allowed' : permission === 'denied' ? 'blocked' : 'dismissed',
    }))
  }

  const requestMicrophonePermission = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissions((current) => ({ ...current, microphone: 'unsupported' }))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setPermissions((current) => ({ ...current, microphone: 'allowed' }))
    } catch (permissionError) {
      console.warn('Microphone permission was not granted:', permissionError)
      setPermissions((current) => ({
        ...current,
        microphone: permissionError?.name === 'NotAllowedError' ? 'blocked' : 'unavailable',
      }))
    }
  }

  const permissionLabel = (status) => ({
    allowed: 'Allowed',
    blocked: 'Blocked in browser settings',
    dismissed: 'Not allowed',
    unsupported: 'Not supported on this device',
    unavailable: 'Unavailable right now',
    'not-requested': 'Allow',
  }[status] || 'Allow')

  const nextStep = () => {
    if (!canContinue) return
    if (step === 4) {
      void completeOnboarding()
      return
    }
    setStep((current) => current + 1)
  }

  if (loading) {
    return (
      <main className="tourism-shell usr-section-page usr-onboarding min-h-screen text-slate-900">
        <div className="usr-section-container mx-auto max-w-5xl px-3 pb-28 pt-2 sm:px-4 lg:px-6 lg:pb-16">
          <div className="usr-section-loading">
            {[0, 1, 2].map((item) => (
              <div key={item} className="usr-card p-5">
                <div className="usr-section-skeleton h-4 w-1/3 rounded-full" />
                <div className="usr-section-skeleton mt-3 h-3 w-4/5 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  const accentStyles = {
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }

  const stepAccent = accentStyles[stepMeta.accent] || accentStyles.sky

  return (
    <main className="tourism-shell usr-section-page usr-onboarding min-h-screen text-slate-900">
      <div className="usr-section-container mx-auto max-w-5xl px-3 pb-28 pt-2 sm:px-4 lg:px-6 lg:pb-16">
        <UserSectionHeader
          eyebrow="Welcome aboard"
          title="Set up your experience"
          description="A few quick choices so your Daet community feed, places, and people match your interests."
          emoji="🧭"
          backHref="/user/dashboard"
          backLabel="Skip setup"
        >
          <span className="usr-section-counter">{progressLabel}</span>
          <button
            type="button"
            onClick={skipOnboarding}
            disabled={saving}
            className="usr-section-secondary disabled:opacity-60"
          >
            <ArrowLeft className="h-4 w-4" />
            Skip setup
          </button>
        </UserSectionHeader>

        <section className="usr-surface usr-enter overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-8">
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
                <div className="mb-5 rounded-[1.5rem] border border-sky-200 bg-sky-50/70 p-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Choose what CONNECT-Daet can use</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-600">These permissions are optional and can be changed later in your phone or browser settings.</p>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { key: 'location', label: 'Location', icon: MapPin, onClick: requestLocationPermission },
                      { key: 'camera', label: 'Camera', icon: Camera, onClick: requestCameraPermission },
                      { key: 'microphone', label: 'Microphone', icon: Mic, onClick: requestMicrophonePermission },
                      { key: 'notifications', label: 'Notifications', icon: Bell, onClick: requestNotificationPermission },
                    ].map(({ key, label, icon: Icon, onClick }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={onClick}
                        disabled={permissions[key] === 'allowed'}
                        className="flex items-center gap-3 rounded-xl border border-white bg-white px-3 py-3 text-left shadow-sm transition hover:border-sky-300 disabled:cursor-default disabled:opacity-80"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-sky-600" />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-800">{label}</span>
                          <span className={`mt-0.5 block text-[10px] ${permissions[key] === 'blocked' ? 'text-red-600' : permissions[key] === 'allowed' ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {permissionLabel(permissions[key])}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-slate-500">
                    Photos and files are selected through the upload buttons below. Calendar events use your phone&apos;s share or download tools and do not require calendar access.
                  </p>
                </div>

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
                    <MediaUpload bucket="profile-media" folder={`covers/${userId}`} mediaType="image" trimLetterbox existingMediaUrl={coverUrl} previewClassName="h-32 w-full aspect-[3/1]" onUploadComplete={setCoverUrl} onUploadError={setError} buttonText="Add cover" maxSizeMB={8} />
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-[1.25rem] border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-800">
                  <ShieldCheck className="h-4 w-4" />
                  Your profile is private by default until you choose to share more.
                </div>

                <button type="button" onClick={completeOnboarding} disabled={saving} className="usr-section-secondary mt-4 disabled:opacity-60">Skip photos and finish</button>
              </>
            )}

            {error && <p className="usr-inline-note usr-inline-note-error mt-4">{error}</p>}

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1 || saving} className="usr-section-secondary disabled:opacity-40">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>

              <div className="flex items-center gap-2">
                {step < 4 ? (
                  <button type="button" onClick={nextStep} disabled={!canContinue} className="usr-section-primary disabled:opacity-40">
                    {stepMeta.nextLabel}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" onClick={completeOnboarding} disabled={saving} className="usr-section-primary disabled:opacity-50">
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
