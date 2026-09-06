'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, FileText, MapPin, Save, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject, updateStoredSession } from '@/lib/authCookies'
import MediaUpload from '@/app/components/MediaUpload'

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
    const updatedAt = new Date().toISOString()

    try {
      const [{ error: userError }, { error: profileError }] = await Promise.all([
        supabase.from('info_users').update({ full_name: form.full_name, bio: form.bio, city, country, profile_image_url: form.avatar_url || null, updated_at: updatedAt }).eq('id', userId),
        supabase.from('profiles').upsert({ user_id: userId, full_name: form.full_name, bio: form.bio, city, country, location: trimmedLocation || null, profile_image_url: form.avatar_url || null, cover_photo_url: form.cover_photo_url || null, updated_at: updatedAt }, { onConflict: 'user_id' }),
      ])

      if (userError || profileError) {
        throw userError || profileError
      }

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

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_35%,_#f1f5f9_100%)] text-sm text-slate-500">Loading profile...</main>

  return (
    <main className="min-h-screen w-full overflow-x-clip bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] text-slate-900">
      <div className="mx-auto w-full max-w-[1000px] px-3 pb-24 pt-0 sm:px-5 sm:pt-3 lg:px-8 lg:pb-10">
        <header className="sticky top-0 z-30 mb-4 rounded-[22px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_12px_35px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:top-2 sm:p-4">
          <div className="flex items-center gap-3">
            <Link href="/user/profile" aria-label="Back to profile" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-sky-50 hover:text-sky-700"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Daet Connect</p><h1 className="truncate text-lg font-black text-slate-900">Edit profile</h1></div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
          <aside className="rounded-[22px] border border-slate-200 bg-white p-5 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xl font-black text-sky-700">{form.avatar_url ? <img src={form.avatar_url} alt="Profile preview" className="h-full w-full object-cover" /> : <UserRound className="h-8 w-8" />}</div>
            <p className="mt-3 truncate text-lg font-black text-slate-900">{form.full_name || 'Your name'}</p>
            <p className="mt-1 text-xs text-slate-500">This information appears on your public profile.</p>
            <div className="mt-5 space-y-2 text-left text-xs text-slate-600"><div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><MapPin className="h-4 w-4 text-sky-600" />{form.location || 'Add your location'}</div><div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><FileText className="h-4 w-4 text-sky-600" />Your community bio</div></div>
          </aside>

          <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Public profile</p><h2 className="mt-1 text-2xl font-black text-slate-900">Tell people about you</h2><p className="mt-2 text-sm leading-6 text-slate-500">Keep your profile clear and personal so the Daet community knows what you enjoy.</p></div>
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <div><div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Profile photo</span>{form.avatar_url && <span className="text-[11px] font-medium text-emerald-600">Added</span>}</div><MediaUpload bucket="profile-media" folder={`users/${userId}`} mediaType="image" existingMediaUrl={form.avatar_url} buttonText="Add / change photo" maxSizeMB={5} onUploadComplete={(url) => setForm((previous) => ({ ...previous, avatar_url: url || '' }))} onUploadError={setNotice} /></div>
                <div><div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Cover photo</span>{form.cover_photo_url && <span className="text-[11px] font-medium text-emerald-600">Added</span>}</div><MediaUpload bucket="profile-media" folder={`covers/${userId}`} mediaType="image" existingMediaUrl={form.cover_photo_url} previewClassName="h-32 w-full aspect-[3/1]" buttonText="Add / change cover" maxSizeMB={8} onUploadComplete={(url) => setForm((previous) => ({ ...previous, cover_photo_url: url || '' }))} onUploadError={setNotice} /></div>
              </div>
              <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Display name</span><input value={form.full_name} onChange={(event) => setForm((previous) => ({ ...previous, full_name: event.target.value }))} placeholder="Your name" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Location</span><input value={form.location} onChange={(event) => setForm((previous) => ({ ...previous, location: event.target.value }))} placeholder="Daet, Camarines Norte, Philippines" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Bio</span><textarea rows={6} value={form.bio} onChange={(event) => setForm((previous) => ({ ...previous, bio: event.target.value }))} placeholder="Share what kind of places, stories, or experiences you love." className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100" /><span className="mt-1 block text-right text-[11px] text-slate-400">{form.bio.length} characters</span></label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><Link href="/user/profile" className="text-center text-sm font-semibold text-slate-500 hover:text-slate-700">Cancel</Link><div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">{notice && <p className={`inline-flex items-center justify-center gap-1.5 text-sm ${notice.includes('successfully') ? 'text-emerald-600' : 'text-red-600'}`}><CheckCircle2 className="h-4 w-4" />{notice}</p>}<button type="button" onClick={saveProfile} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save changes'}</button></div></div>
          </section>
        </div>
      </div>
    </main>
  )
}
