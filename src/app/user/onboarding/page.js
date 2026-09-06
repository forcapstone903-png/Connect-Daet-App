'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, ImagePlus, MapPin, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import MediaUpload from '@/app/components/MediaUpload'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject, updateStoredSession } from '@/lib/authCookies'

const FALLBACK_TOPICS = ['Beaches', 'Food', 'History', 'Culture', 'Events', 'Nature']
const FALLBACK_PLACES = ['Bagasbas Beach', 'Daet Elevated Town Plaza', 'First Rizal Monument', 'Morga House', 'Vinzons Watersports']

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
  const requiredTopics = Math.min(3, topics.length || 3)
  const requiredPlaces = Math.min(3, places.length || 3)
  const canContinue = step === 1 ? selectedTopics.length >= requiredTopics : step === 2 ? selectedPlaces.length >= requiredPlaces : true

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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_35%,_#f1f5f9_100%)] px-3 py-6 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5 flex items-center justify-between"><Link href="/user/dashboard" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-700"><ArrowLeft className="h-4 w-4" />Skip setup</Link><span className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">{progressLabel}</span></header>
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
          {step === 1 && <><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Make your feed yours</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Choose {requiredTopics} favorite topic{requiredTopics === 1 ? '' : 's'}</h1><p className="mt-2 text-sm leading-6 text-slate-500">We’ll use these to shape your Daet community feed.</p><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{topics.map((topic) => <button key={topic.id} type="button" onClick={() => toggleSelection(topic.name, selectedTopics, setSelectedTopics, requiredTopics)} className={`rounded-2xl border p-4 text-left transition ${selectedTopics.includes(topic.name) ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100' : 'border-slate-200 bg-slate-50 hover:border-sky-300'}`}><span className="text-xl">{topic.icon_emoji || '✦'}</span><span className="mt-2 block text-sm font-bold">{topic.name}</span>{selectedTopics.includes(topic.name) && <Check className="mt-2 h-4 w-4 text-sky-700" />}</button>)}</div><p className="mt-4 text-xs text-slate-500">{selectedTopics.length} of {requiredTopics} selected</p></>}
          {step === 2 && <><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Discover local favorites</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Choose {requiredPlaces} place{requiredPlaces === 1 ? '' : 's'} in Daet</h1><p className="mt-2 text-sm leading-6 text-slate-500">Pick the places you want to see more often.</p><div className="mt-6 space-y-2">{places.map((place) => <button key={place.id} type="button" onClick={() => toggleSelection(place.name, selectedPlaces, setSelectedPlaces, requiredPlaces)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedPlaces.includes(place.name) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-emerald-300'}`}><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-emerald-100 text-emerald-700">{place.featured_image ? <img src={place.featured_image} alt="" className="h-full w-full object-cover" /> : <MapPin className="h-4 w-4" />}</span><span className="flex-1"><span className="block text-sm font-bold">{place.name}</span><span className="block text-xs text-slate-500">{place.location || place.category || 'Daet destination'}</span></span>{selectedPlaces.includes(place.name) && <Check className="h-4 w-4 text-emerald-700" />}</button>)}</div><p className="mt-4 text-xs text-slate-500">{selectedPlaces.length} of {requiredPlaces} selected</p></>}
          {step === 3 && <><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Find your people</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">People you may want to follow</h1><p className="mt-2 text-sm leading-6 text-slate-500">Follow local voices and community members. You can skip this.</p><div className="mt-6 space-y-2">{people.map((person) => <button key={person.id} type="button" onClick={() => setFollowedPeople((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${followedPeople.includes(person.id) ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-amber-500 text-xs font-bold text-white">{person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : person.full_name?.slice(0, 2).toUpperCase()}</span><span className="flex-1 text-sm font-bold">{person.full_name || 'Community member'}</span>{followedPeople.includes(person.id) ? <Check className="h-4 w-4 text-amber-700" /> : <UserPlus className="h-4 w-4 text-slate-400" />}</button>)}</div><button type="button" onClick={() => setStep(4)} className="mt-4 text-sm font-bold text-slate-500 hover:text-sky-700">Skip for now</button></>}
          {step === 4 && <><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700">Make it yours</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Add a profile photo and cover</h1><p className="mt-2 text-sm leading-6 text-slate-500">Both are optional. You can add them later from Edit profile.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-bold"><ImagePlus className="h-4 w-4 text-sky-600" />Profile photo</div><MediaUpload bucket="profile-media" folder={`users/${userId}`} mediaType="image" existingMediaUrl={avatarUrl} onUploadComplete={setAvatarUrl} onUploadError={setError} buttonText="Add photo" maxSizeMB={5} /></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-bold"><ImagePlus className="h-4 w-4 text-emerald-600" />Cover photo</div><MediaUpload bucket="profile-media" folder={`covers/${userId}`} mediaType="image" existingMediaUrl={coverUrl} previewClassName="h-32 w-full aspect-[3/1]" onUploadComplete={setCoverUrl} onUploadError={setError} buttonText="Add cover" maxSizeMB={8} /></div></div><button type="button" onClick={completeOnboarding} className="mt-4 text-sm font-bold text-slate-500 hover:text-sky-700">Skip photos and finish</button></>}
          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="mt-8 flex justify-end gap-2 border-t border-slate-100 pt-5"><button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1 || saving} className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-40">Back</button>{step < 4 && <button type="button" onClick={nextStep} disabled={!canContinue} className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{step === 3 ? 'Continue' : 'Next'}<ArrowRight className="h-4 w-4" /></button>}{step === 4 && <button type="button" onClick={completeOnboarding} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Finish setup'}<Check className="h-4 w-4" /></button>}</div>
        </section>
      </div>
    </main>
  )
}
