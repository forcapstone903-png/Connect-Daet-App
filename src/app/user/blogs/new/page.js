'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, FileText, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import MediaUpload from '@/app/components/MediaUpload'
import { trackUserActivity } from '@/lib/trackActivity'

const categories = [
  { value: 'travel_guides', label: 'Travel Guides' },
  { value: 'cultural_insights', label: 'Cultural Insights' },
  { value: 'food', label: 'Food' },
  { value: 'history', label: 'History' },
  { value: 'events', label: 'Events' },
  { value: 'announcement', label: 'Announcements' },
]

const EMPTY_FORM = {
  title: '',
  excerpt: '',
  content: '',
  category: 'travel_guides',
  featured_image: '',
  tags: '',
  status: 'draft',
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function CreateBlogPage() {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY_FORM)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setLoading(false)
    }

    getSession()
  }, [])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!session?.user) {
      alert('Please log in before creating a blog article.')
      return
    }

    if (!form.title.trim() || !form.content.trim() || !form.category) {
      alert('Please add a title, category, and article content.')
      return
    }

    setSubmitting(true)

    try {
      const slug = `${generateSlug(form.title)}-${Date.now()}`
      const tags = form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      const payload = {
        title: form.title.trim(),
        slug,
        excerpt: form.excerpt.trim() || form.content.trim().slice(0, 180),
        content: form.content.trim(),
        featured_image: form.featured_image.trim() || null,
        category: form.category,
        tags,
        status: form.status,
        created_by: session.user.id,
        published_at: form.status === 'published' ? new Date().toISOString() : null,
        views: 0,
        likes: 0,
        comments_count: 0,
      }

      const { data, error } = await supabase.from('info_blogs').insert([payload]).select('id')

      if (error) throw error

      const createdBlogId = data?.[0]?.id || null
      if (createdBlogId) {
        trackUserActivity({
          userId: session.user.id,
          activityType: 'new_post',
          entityType: 'blog',
          entityId: createdBlogId,
          description: `Published a new blog post: ${form.title.trim()}`,
          metadata: {
            contentTitle: form.title.trim(),
            ownerUserId: session.user.id,
          },
        })
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/user/blogs')
      }, 1200)
    } catch (error) {
      console.error('Error creating blog:', error)
      alert(error.message || 'Unable to create your blog article right now.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 h-16 animate-pulse rounded bg-slate-200" />
        </div>
      </main>
    )
  }

  if (!session?.user) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-xl rounded-[24px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Restricted</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Log in to publish an article</h1>
          <p className="mt-3 text-slate-600">You need an active account before creating a blog post for the community.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/user/blogs" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Back to articles
            </Link>
            <Link href="/login" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
              Log in
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/user/blogs" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Back to Articles
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700 border border-sky-200">
            <FileText className="h-3.5 w-3.5" />
            Create Post
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">New article</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Share something with the community</h1>
          </div>

          {success ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Your article has been submitted successfully.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Title</span>
                  <input
                    value={form.title}
                    onChange={(event) => updateField('title', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                    placeholder="e.g. Hidden food gems in San Fernando"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Short excerpt</span>
                  <textarea
                    value={form.excerpt}
                    onChange={(event) => updateField('excerpt', event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                    placeholder="A quick summary that shows up in previews."
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Category</span>
                  <select
                    value={form.category}
                    onChange={(event) => updateField('category', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                  >
                    {categories.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Status</span>
                  <select
                    value={form.status}
                    onChange={(event) => updateField('status', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Publish immediately</option>
                  </select>
                </label>

                <div className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Featured image</span>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <MediaUpload
                      bucket="blogs"
                      folder="images"
                      mediaType="image"
                      existingMediaUrl={form.featured_image}
                      onUploadComplete={(url) => updateField('featured_image', url || '')}
                      onUploadError={(error) => alert(error)}
                      buttonText="Upload image"
                      maxSizeMB={5}
                    />
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Or paste an image URL</label>
                      <input
                        value={form.featured_image}
                        onChange={(event) => updateField('featured_image', event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-300"
                        placeholder="https://example.com/image.jpg"
                      />
                    </div>
                  </div>
                </div>

                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Tags</span>
                  <input
                    value={form.tags}
                    onChange={(event) => updateField('tags', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                    placeholder="culture, local-guide, food"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Content</span>
                  <textarea
                    value={form.content}
                    onChange={(event) => updateField('content', event.target.value)}
                    rows={12}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                    placeholder="Write the full article here..."
                  />
                </label>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <Link href="/user/blogs" className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {submitting ? 'Publishing...' : form.status === 'published' ? 'Publish Article' : 'Save Draft'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
