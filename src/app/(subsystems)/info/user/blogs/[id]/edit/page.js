'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Eye, FilePenLine, Save, Send, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import { invalidateCachePrefix } from '@/lib/cache'
import MediaUpload from '@/app/components/MediaUpload'
import MultiMediaUpload from '@/app/components/MultiMediaUpload'
import UserTopHeader from '@/app/components/user/UserTopHeader'
import UserSectionHeader, { SectionLoading } from '@/app/components/user/UserSectionHeader'

const categories = [
  { value: 'travel_guides', label: 'Travel Guides' },
  { value: 'cultural_insights', label: 'Cultural Insights' },
  { value: 'food', label: 'Food' },
  { value: 'history', label: 'History' },
  { value: 'events', label: 'Events' },
  { value: 'announcement', label: 'Announcements' },
]

const BASE_COLUMNS = 'title, excerpt, content, category, status, featured_image, images, videos, media_layout'
const LEGACY_COLUMNS = 'title, excerpt, content, category, status'

const initialForm = {
  title: '',
  excerpt: '',
  content: '',
  category: 'travel_guides',
  featured_image: '',
  status: 'draft',
  media_layout: 'swipe',
}

function toMediaItems(images, videos) {
  return [
    ...(Array.isArray(images) ? images.filter(Boolean).map((url) => ({ url, type: 'image' })) : []),
    ...(Array.isArray(videos) ? videos.filter(Boolean).map((url) => ({ url, type: 'video' })) : []),
  ]
}

export default function EditBlogPage() {
  const { id } = useParams()
  const router = useRouter()
  const [form, setForm] = useState(initialForm)
  const [mediaItems, setMediaItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    const loadStory = async () => {
      const session = getStoredSessionObject()
      const userId = session?.user_id || session?.id || session?.sub || session?.userId

      if (!userId || !id) {
        setError('This story is unavailable.')
        setLoadFailed(true)
        setLoading(false)
        return
      }

      const buildQuery = (columns) =>
        supabase
          .from('info_blogs')
          .select(columns)
          .eq('id', id)
          .eq('created_by', userId)
          .in('status', ['draft', 'published', 'archived'])
          .maybeSingle()

      let { data, error: loadError } = await buildQuery(BASE_COLUMNS)
      if (loadError) {
        const fallback = await buildQuery(LEGACY_COLUMNS)
        data = fallback.data
        loadError = fallback.error
      }

      if (loadError || !data) {
        setError('This story is unavailable.')
        setLoadFailed(true)
      } else {
        setForm({
          ...initialForm,
          title: data.title || '',
          excerpt: data.excerpt || '',
          content: data.content || '',
          category: data.category || initialForm.category,
          featured_image: data.featured_image || '',
          status: data.status || 'draft',
          media_layout: data.media_layout === 'grid' ? 'grid' : 'swipe',
        })
        setMediaItems(toMediaItems(data.images, data.videos))
      }
      setLoading(false)
    }

    void loadStory()
  }, [id])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const saveStory = async (nextStatus) => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Add a title and the article content before saving your story.')
      setNotice('')
      return
    }

    setSaving(nextStatus || 'save')
    setError('')
    setNotice('')

    const payload = {
      title: form.title.trim(),
      excerpt: form.excerpt.trim() || null,
      content: form.content.trim(),
      category: form.category,
      featured_image: form.featured_image || null,
      media_layout: form.media_layout,
      images: mediaItems.filter((item) => item.type === 'image').map((item) => item.url),
      videos: mediaItems.filter((item) => item.type === 'video').map((item) => item.url),
    }
    if (nextStatus) payload.status = nextStatus

    try {
      const response = await fetch(`/api/user/blogs/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success) {
        setError(result.message || 'Unable to save this story right now.')
        return
      }

      invalidateCachePrefix('feed:user:')
      invalidateCachePrefix('profile:user:')
      setForm((current) => ({ ...current, status: result.blog?.status || current.status }))

      if (nextStatus === 'published') {
        setNotice('Story published. Opening your story...')
        router.push(`/user/blogs/${id}`)
        return
      }

      setNotice(nextStatus === 'draft' ? 'Draft saved.' : 'Changes saved.')
    } catch (saveError) {
      console.error('Blog update failed:', saveError)
      setError('Unable to save this story right now.')
    } finally {
      setSaving('')
    }
  }

  const deleteStory = async () => {
    if (!window.confirm('Delete this story?\n\nThis permanently removes the story and cannot be undone.')) return

    setDeleting(true)
    setError('')
    try {
      const response = await fetch(`/api/user/blogs/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        setError(result.message || 'Unable to delete this story right now.')
        return
      }
      invalidateCachePrefix('feed:user:')
      invalidateCachePrefix('profile:user:')
      router.push('/user/drafts')
    } catch (deleteError) {
      console.error('Blog delete failed:', deleteError)
      setError('Unable to delete this story right now.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <main className="tourism-shell usr-section-page usr-editor usr-stories min-h-screen text-slate-900">
        <UserTopHeader />
        <div className="usr-section-container mx-auto max-w-4xl px-3 pb-24 pt-2 sm:px-4 lg:px-6">
          <SectionLoading label="Loading your story" />
        </div>
      </main>
    )
  }

  if (loadFailed) {
    return (
      <main className="tourism-shell usr-section-page usr-editor usr-stories flex min-h-screen items-center justify-center p-6 text-slate-900">
        <div className="usr-empty-state max-w-xl">
          <FilePenLine className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {error || 'This story is unavailable.'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Only the author can edit a story, and deleted stories cannot be restored.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/user/drafts" className="usr-section-secondary">Your drafts</Link>
            <Link href="/user/blogs" className="usr-section-primary">Community stories</Link>
          </div>
        </div>
      </main>
    )
  }

  const isPublished = form.status === 'published'

  return (
    <main className="tourism-shell usr-section-page usr-editor usr-stories min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-4xl px-3 pb-28 pt-2 sm:px-4 lg:px-6 lg:pb-16">
        <UserSectionHeader
          eyebrow="Writing studio"
          title="Edit story"
          description="Refine your draft, add media, then publish it to the community when it is ready."
          emoji="📝"
          backHref="/user/drafts"
          backLabel="Your drafts"
        >
          <span className="usr-section-counter">{isPublished ? 'Published' : 'Draft'}</span>
          {isPublished ? (
            <Link href={`/user/blogs/${id}`} className="usr-section-secondary">
              <Eye className="h-4 w-4" />
              View story
            </Link>
          ) : null}
          <button
            type="button"
            onClick={deleteStory}
            disabled={deleting}
            className="usr-section-secondary text-rose-600 disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : <><Trash2 className="h-4 w-4" />Delete</>}
          </button>
        </UserSectionHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void saveStory(null)
          }}
          className="usr-card usr-enter space-y-5 p-4 sm:p-6"
        >
          {error || notice ? (
            <p
              role="status"
              aria-live="polite"
              className={`usr-inline-note ${error ? 'usr-inline-note-error' : 'usr-inline-note-success'}`}
            >
              {error || notice}
            </p>
          ) : null}

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Story title</span>
            <input
              required
              value={form.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder="Give your story a clear headline"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Category</span>
              <select
                value={form.category}
                onChange={(event) => updateField('category', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
              >
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Gallery layout</span>
              <select
                value={form.media_layout}
                onChange={(event) => updateField('media_layout', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
              >
                <option value="swipe">Swipe gallery</option>
                <option value="grid">Grid gallery</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Short excerpt</span>
            <textarea
              rows={3}
              value={form.excerpt}
              onChange={(event) => updateField('excerpt', event.target.value)}
              placeholder="One or two sentences that preview your story"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Article content</span>
            <textarea
              required
              rows={14}
              value={form.content}
              onChange={(event) => updateField('content', event.target.value)}
              placeholder="Write your story for the Daet community..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-7 outline-none transition focus:border-teal-400 focus:bg-white"
            />
          </label>

          <div className="grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">Cover photo</p>
              <MediaUpload
                bucket="blog-media"
                folder={`blogs/${id}/cover`}
                mediaType="image"
                existingMediaUrl={form.featured_image}
                previewClassName="h-32 w-full aspect-[3/1]"
                buttonText="Upload cover"
                maxSizeMB={10}
                onUploadComplete={(url) => updateField('featured_image', url)}
                onUploadError={(message) => setError(message)}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">Photo and video gallery</p>
              <MultiMediaUpload
                value={mediaItems}
                onChange={setMediaItems}
                bucket="blog-media"
                folder={`blogs/${id}`}
                maxFiles={8}
                maxSizeMB={20}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => saveStory('draft')}
              disabled={Boolean(saving) || deleting}
              className="usr-section-secondary disabled:opacity-60"
            >
              {saving === 'draft' ? 'Saving…' : 'Save as draft'}
            </button>
            <button
              type="submit"
              disabled={Boolean(saving) || deleting}
              className="usr-section-secondary disabled:opacity-60"
            >
              {saving === 'save' ? 'Saving…' : <><Save className="h-4 w-4" />Save changes</>}
            </button>
            {isPublished ? null : (
              <button
                type="button"
                onClick={() => saveStory('published')}
                disabled={Boolean(saving) || deleting}
                className="usr-section-primary disabled:opacity-60"
              >
                {saving === 'published' ? 'Publishing…' : <><Send className="h-4 w-4" />Publish story</>}
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}
