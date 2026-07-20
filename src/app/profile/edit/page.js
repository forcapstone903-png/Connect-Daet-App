'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Camera, Compass, Mail, MapPin, Phone } from 'lucide-react'

export default function EditProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [form, setForm] = useState({
    full_name: '',
    bio: '',
    address: '',
    city: '',
    province: '',
    country: '',
    phone_number: '',
    profile_image_url: '',
  })

  useEffect(() => {
    const loadProfile = async () => {
      const sessionData = sessionStorage.getItem('user_session')
      if (!sessionData) {
        router.push('/login')
        return
      }

      const parsedSession = JSON.parse(sessionData)
      setUser(parsedSession)

      const { data, error } = await supabase
        .from('info_users')
        .select('*')
        .eq('id', parsedSession.user_id)
        .single()

      if (!error && data) {
        setProfile(data)
        setForm({
          full_name: data.full_name || '',
          bio: data.bio || '',
          address: data.address || '',
          city: data.city || '',
          province: data.province || '',
          country: data.country || '',
          phone_number: data.phone_number || '',
          profile_image_url: data.profile_image_url || '',
        })
      }

      setLoading(false)
    }

    loadProfile()
  }, [router])

  const handleFieldChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const sessionData = sessionStorage.getItem('user_session')
    if (!sessionData) return

    const parsedSession = JSON.parse(sessionData)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('bucket', 'avatars')
    formData.append('folder', `profiles/${parsedSession.user_id}`)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Image upload failed')
      }

      setForm((prev) => ({ ...prev, profile_image_url: data.url }))
      setFeedback('Photo attached. Save the profile to keep it.')
    } catch (error) {
      console.error('Profile image upload failed:', error)
      setFeedback(error.message || 'Profile image upload failed.')
    }
  }

  const handleSave = async () => {
    const sessionData = sessionStorage.getItem('user_session')
    if (!sessionData) return

    const parsedSession = JSON.parse(sessionData)
    setSaving(true)
    setFeedback('')

    const payload = {
      full_name: form.full_name?.trim() || profile?.full_name || user?.user_name || user?.email?.split('@')[0] || '',
      bio: form.bio?.trim() || '',
      address: form.address?.trim() || '',
      city: form.city?.trim() || '',
      province: form.province?.trim() || '',
      country: form.country?.trim() || '',
      phone_number: form.phone_number?.trim() || '',
      profile_image_url: form.profile_image_url?.trim() || '',
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('info_users')
      .update(payload)
      .eq('id', parsedSession.user_id)
      .select('*')
      .single()

    if (error) {
      setFeedback('Could not save the profile right now.')
      setSaving(false)
      return
    }

    setProfile(data)
    setForm({
      full_name: data.full_name || '',
      bio: data.bio || '',
      address: data.address || '',
      city: data.city || '',
      province: data.province || '',
      country: data.country || '',
      phone_number: data.phone_number || '',
      profile_image_url: data.profile_image_url || '',
    })
    setFeedback('Profile updated successfully.')
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white px-8 py-6 shadow-sm">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="text-sm text-slate-600">Loading your profile...</p>
        </div>
      </div>
    )
  }

  const profileName = profile?.full_name || user?.user_name || user?.email?.split('@')[0] || ''
  const profileLocation = [form.city, form.province, form.country].filter(Boolean).join(', ')
  const initials = profileName
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-sm">
        <div className="relative h-44 bg-linear-to-r from-teal-500 via-cyan-500 to-blue-600 sm:h-56">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_45%)]" />
          <div className="absolute left-4 right-4 top-4 flex items-center justify-between sm:left-6 sm:right-6">
            <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition hover:bg-white">
              <ArrowLeft size={16} /> Back
            </button>
            <button onClick={handleSave} disabled={saving} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-teal-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div className="absolute bottom-0 left-6 translate-y-1/2 sm:left-8">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-linear-to-br from-teal-500 to-blue-600 text-xl font-semibold text-white shadow-lg sm:h-28 sm:w-28">
              {form.profile_image_url ? (
                <img src={form.profile_image_url} alt={profileName} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 pt-16 sm:px-8 sm:pt-20">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{profileName || 'Traveler profile'}</h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <MapPin size={15} className="text-teal-500" />
                {profileLocation || 'Add your city and country'}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <Compass size={15} className="text-teal-500" />
                Tourist • Exploring new places
              </p>
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
              <Camera size={15} /> Change photo
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              {feedback ? <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{feedback}</p> : null}

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <Compass size={16} className="text-teal-500" />
                  <h2 className="text-lg font-semibold text-slate-900">About you</h2>
                </div>
                <div className="mt-4 space-y-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Full name
                    <input
                      type="text"
                      name="full_name"
                      value={form.full_name}
                      onChange={handleFieldChange}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                      placeholder="Enter your full name"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Bio
                    <textarea
                      name="bio"
                      rows={4}
                      value={form.bio}
                      onChange={handleFieldChange}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                      placeholder="Tell other travelers about your favorite places, travel style, or what you love to explore."
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Phone number
                    <div className="mt-1 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                      <Phone size={15} className="text-slate-400" />
                      <input
                        type="text"
                        name="phone_number"
                        value={form.phone_number}
                        onChange={handleFieldChange}
                        className="w-full bg-transparent text-sm text-slate-700 outline-none"
                        placeholder="Add your contact number"
                      />
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-teal-500" />
                  <h2 className="text-lg font-semibold text-slate-900">Travel details</h2>
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Address
                    <input
                      type="text"
                      name="address"
                      value={form.address}
                      onChange={handleFieldChange}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                      placeholder="Home address or current stay"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    City
                    <input
                      type="text"
                      name="city"
                      value={form.city}
                      onChange={handleFieldChange}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                      placeholder="Current city"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Province
                    <input
                      type="text"
                      name="province"
                      value={form.province}
                      onChange={handleFieldChange}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                      placeholder="Province"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Country
                    <input
                      type="text"
                      name="country"
                      value={form.country}
                      onChange={handleFieldChange}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                      placeholder="Country"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-teal-500" />
                  <h2 className="text-lg font-semibold text-slate-900">Account info</h2>
                </div>
                <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">Email</p>
                  <p className="mt-1">{user?.email || profile?.email || 'No email available'}</p>
                </div>
                <div className="mt-3 text-sm text-slate-500">
                  <p>Tip: a complete tourist profile helps other travelers recognize and connect with you easily.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <button onClick={handleSave} disabled={saving} className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-teal-300">
              {saving ? 'Saving...' : 'Save profile'}
            </button>
            <button onClick={() => router.push('/dashboard')} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
