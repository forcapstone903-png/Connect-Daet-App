'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileText, MapPin, Save, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject, updateStoredSession } from '@/lib/authCookies'
import MediaUpload from '@/app/components/MediaUpload'
import UserSectionHeader from '@/app/components/user/UserSectionHeader'

export default function EditProfilePage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [form, setForm] = useState({ full_name: '', bio: '', location: '', avatar_url: '', cover_photo_url: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const loadProfile = async () => {
      const stored = getStoredSessionObject()
      const id = stored?.user_id || stored?.id || ''
      setUserId(id)
      if (!id) {
        router.replace('/login')
        setLoading(false)
        return
      }

      const [{ data: userData }, { data: profileData }] = await Promise.all([
        supabase.from('info_users').select('full_name, bio, city, country, profile_image_url').eq('id', id).maybeSingle(),
        supabase.from('profiles').select('full_name, bio, city, country, location, profile_image_url, cover_photo_url').eq('user_id', id).maybeSingle(),
      ])
      setForm({
        full_name: profileData?.full_name || userData?.full_name || '',
        bio: profileData?.bio || userData?.bio || '',
        location: profileData?.location || [profileData?.city, profileData?.country].filter(Boolean).join(', ') || [userData?.city, userData?.country].filter(Boolean).join(', ') || 'Daet, Camarines Norte',
        avatar_url: userData?.profile_image_url || profileData?.profile_image_url || '',
        cover_photo_url: profileData?.cover_photo_url || '',
      })
      setLoading(false)
    }

    void loadProfile()
  }, [])

  const saveProfile = async () => {
    if (!userId) {
      setNotice('Please log in to update your profile.')
      return
    }

    setSaving(true)
    setNotice('')
    const trimmedLocation = form.location.trim()
    const locationParts = trimmedLocation ? trimmedLocation.split(',').map((part) => part.trim()).filter(Boolean) : []
    const city = locationParts[0] || ''
    const country = locationParts.slice(1).join(', ')

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.full_name,
          bio: form.bio,
          location: trimmedLocation,
          avatarUrl: form.avatar_url,
          coverPhotoUrl: form.cover_photo_url,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update your profile.')

      updateStoredSession({
        full_name: form.full_name,
        avatar_url: form.avatar_url,
        profile_image_url: form.avatar_url,
        city,
        country,
      })
      setNotice('Profile updated successfully.')
      window.setTimeout(() => {
        window.location.assign('/user/profile')
      }, 300)
    } catch (error) {
      setNotice(error?.message || 'Unable to update your profile.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <main className="tourism-shell usr-section-page usr-profile flex min-h-screen items-center justify-center p-6">
      <div className="usr-card usr-pop-in p-6 text-center">
        <span className="usr-spin mx-auto mb-3 flex h-6 w-6 rounded-full border-2 border-teal-700 border-t-transparent" />
        <p className="text-sm font-semibold text-slate-600">Loading profile...</p>
      </div>
    </main>
  )

  return (
    <main className="tourism-shell usr-section-page usr-profile min-h-screen w-full overflow-x-clip text-slate-900">
      <div className="usr-section-container mx-auto w-full max-w-4xl px-3 pb-24 pt-2 sm:px-5 lg:px-6 lg:pb-10">
        <UserSectionHeader
          eyebrow="Public profile"
          title="Edit profile"
          description="Update how the Daet community sees you across stories, forums, and events."
          emoji="✏️"
          backHref="/user/profile"
          backLabel="Your profile"
        >
          <span className="usr-section-counter">{form.full_name ? form.full_name.split(' ')[0] : 'Traveler'}</span>
        </UserSectionHeader>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
          <aside className="usr-card usr-enter p-5 text-center">
            <div className="usr-profile-avatar mx-auto flex items-center justify-center overflow-hidden">{form.avatar_url ? <img src={form.avatar_url} alt="Profile preview" className="h-full w-full object-cover" /> : <UserRound className="h-8 w-8" />}</div>
            <p className="mt-3 truncate text-lg font-black text-slate-900">{form.full_name || 'Your name'}</p>
            <p className="mt-1 text-xs text-slate-500">This information appears on your public profile.</p>
            <div className="mt-5 space-y-2 text-left text-xs text-slate-600"><div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5"><MapPin className="h-4 w-4 text-teal-700" />{form.location || 'Add your location'}</div><div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5"><FileText className="h-4 w-4 text-teal-700" />Your community bio</div></div>
          </aside>

          <section className="usr-card usr-enter p-4 sm:p-6">
            <div className="mb-6"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">Public profile</p><h2 className="mt-1 text-2xl font-black text-slate-900">Tell people about you</h2><p className="mt-2 text-sm leading-6 text-slate-500">Keep your profile clear and personal so the Daet community knows what you enjoy.</p></div>
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <div><div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Profile photo</span>{form.avatar_url && <span className="text-[11px] font-medium text-emerald-600">Added</span>}</div><MediaUpload bucket="profile-media" folder={`users/${userId}`} mediaType="image" existingMediaUrl={form.avatar_url} buttonText="Add / change photo" maxSizeMB={5} onUploadComplete={(url) => setForm((previous) => ({ ...previous, avatar_url: url || '' }))} onUploadError={setNotice} /></div>
                <div><div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Cover photo</span>{form.cover_photo_url && <span className="text-[11px] font-medium text-emerald-600">Added</span>}</div><MediaUpload bucket="profile-media" folder={`covers/${userId}`} mediaType="image" trimLetterbox existingMediaUrl={form.cover_photo_url} previewClassName="h-32 w-full aspect-[3/1]" buttonText="Add / change cover" maxSizeMB={8} onUploadComplete={(url) => setForm((previous) => ({ ...previous, cover_photo_url: url || '' }))} onUploadError={setNotice} /></div>
              </div>
              <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Display name</span><input value={form.full_name} onChange={(event) => setForm((previous) => ({ ...previous, full_name: event.target.value }))} placeholder="Your name" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Location</span><input value={form.location} onChange={(event) => setForm((previous) => ({ ...previous, location: event.target.value }))} placeholder="Daet, Camarines Norte, Philippines" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Bio</span><textarea rows={6} value={form.bio} onChange={(event) => setForm((previous) => ({ ...previous, bio: event.target.value }))} placeholder="Share what kind of places, stories, or experiences you love." className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100" /><span className="mt-1 block text-right text-[11px] text-slate-400">{form.bio.length} characters</span></label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><Link href="/user/profile" className="text-center text-sm font-semibold text-slate-500 hover:text-teal-700">Cancel</Link><div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">{notice && <p className={`usr-inline-note inline-flex items-center justify-center gap-1.5 ${notice.includes('successfully') ? 'usr-inline-note-success' : 'usr-inline-note-error'}`}><CheckCircle2 className="h-4 w-4" />{notice}</p>}<button type="button" onClick={saveProfile} disabled={saving} className="usr-section-primary"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save changes'}</button></div></div>
          </section>
        </div>
      </div>
    </main>
  )
}
