'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'

const initialForm = {
  title: '',
  excerpt: '',
  content: '',
  category: 'travel_guides',
}

const categories = [
  { value: 'travel_guides', label: 'Travel Guides' },
  { value: 'cultural_insights', label: 'Cultural Insights' },
  { value: 'food', label: 'Food' },
  { value: 'history', label: 'History' },
  { value: 'events', label: 'Events' },
  { value: 'announcement', label: 'Announcements' },
]

export default function EditBlogPage() {
  const { id } = useParams()
  const router = useRouter()
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadDraft = async () => {
      const session = getStoredSessionObject()
      const userId = session?.user_id || session?.id || session?.sub || session?.userId

      if (!userId || !id) {
        setError('This draft is unavailable.')
        setLoading(false)
        return
      }

      const { data, error: loadError } = await supabase
        .from('info_blogs')
        .select('title, excerpt, content, category')
        .eq('id', id)
        .eq('created_by', userId)
        .eq('status', 'draft')
        .maybeSingle()

      if (loadError || !data) setError('This draft is unavailable.')
      else setForm({ ...initialForm, ...data })
      setLoading(false)
    }

    void loadDraft()
  }, [id])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    const session = getStoredSessionObject()
    const userId = session?.user_id || session?.id || session?.sub || session?.userId
    const { error: saveError } = await supabase
      .from('info_blogs')
      .update({
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || null,
        content: form.content.trim(),
        category: form.category,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('created_by', userId)
      .eq('status', 'draft')

    if (saveError) setError(saveError.message || 'Unable to save this draft.')
    else router.push('/user/drafts')
    setSaving(false)
  }

  if (loading) return <main className="min-h-screen bg-slate-50 p-6 text-slate-600">Loading draft...</main>

  if (error) {
    return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center"><p className="text-sm text-slate-600">{error}</p><Link href="/user/drafts" className="mt-4 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Back to drafts</Link></div></main>
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-6 text-slate-900 sm:px-5">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center justify-between">
          <Link href="/user/drafts" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Drafts</Link>
          <h1 className="text-xl font-black">Edit draft</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Title</span><input required value={form.title} onChange={(event) => updateField('title', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-400 focus:bg-white" /></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Category</span><select value={form.category} onChange={(event) => updateField('category', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-400 focus:bg-white">{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Short excerpt</span><textarea rows={3} value={form.excerpt} onChange={(event) => updateField('excerpt', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-400 focus:bg-white" /></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Article content</span><textarea required rows={16} value={form.content} onChange={(event) => updateField('content', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-400 focus:bg-white" /></label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save draft'}</button>
        </form>
      </div>
    </main>
  )
}