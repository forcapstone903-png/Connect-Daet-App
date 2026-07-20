'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Camera, MapPin } from 'lucide-react'

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
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <p className="text-sm font-semibold text-slate-900">Edit profile</p>
            <p className="text-sm text-slate-500">Update your traveler details</p>
          </div>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)] md:p-8">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-linear-to-br from-teal-500 to-blue-600 text-lg font-semibold text-white">
              {form.profile_image_url ? (
                <img src={form.profile_image_url} alt={profileName} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
              <Camera size={14} /> Upload photo
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <MapPin size={15} className="text-teal-500" />
              <span>{profileLocation}</span>
            </div>
          </div>

          <div className="space-y-4">
            {feedback ? <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{feedback}</p> : null}

            <label className="block text-sm font-medium text-slate-700">
              Full name
              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleFieldChange}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Bio
              <textarea
                name="bio"
                rows={4}
                value={form.bio}
                onChange={handleFieldChange}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Address
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleFieldChange}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                City
                <input
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={handleFieldChange}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Province
                <input
                  type="text"
                  name="province"
                  value={form.province}
                  onChange={handleFieldChange}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Country
                <input
                  type="text"
                  name="country"
                  value={form.country}
                  onChange={handleFieldChange}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-teal-300"
              >
                {saving ? 'Saving...' : 'Save profile'}
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
